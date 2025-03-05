import * as fs from "fs";
import * as path from "path";
import { BaseAnthropicTool, ToolError, ToolResult } from "./base";
import { run, maybeTruncate } from "./run";

/**
 * The set of possible commands for the edit tool.
 */
export type EditCommand = "view" | "create" | "str_replace" | "insert" | "undo_edit";

export class EditTool20250124 extends BaseAnthropicTool {
  name = "str_replace_editor";
  api_type: string = "text_editor_20250124";

  // This in-memory history helps with "undo_edit".
  // Map<absolutePath, arrayOfPastContents>
  private fileHistory = new Map<string, string[]>();

  toParams(): any {
    return {
      name: this.name,
      type: this.api_type,
    };
  }

  /**
   * The main entrypoint for the tool. We parse the "command" arg
   * and call the relevant method (view, create, str_replace, insert, undo_edit).
   */
  async call(args: Record<string, any>): Promise<ToolResult> {
    // e.g. { command: 'view', path: '/...', file_text, ... }
    const command = args.command as EditCommand;
    const filePath = args.path as string;
    switch (command) {
      case "view":
        return this.handleView(filePath, args.view_range);
      case "create":
        return this.handleCreate(filePath, args.file_text);
      case "str_replace":
        return this.handleStrReplace(filePath, args.old_str, args.new_str);
      case "insert":
        return this.handleInsert(filePath, args.insert_line, args.new_str);
      case "undo_edit":
        return this.handleUndo(filePath);
      default:
        throw new ToolError(
          `Unrecognized command ${command}. Valid: view, create, str_replace, insert, undo_edit.`
        );
    }
  }

  /**
   * 1) handleView
   */
  private async handleView(filePath: string, viewRange?: [number, number]): Promise<ToolResult> {
    this.validatePath("view", filePath);
    if (this.isDirectory(filePath)) {
      // If it's a directory, we mimic the python logic and do a `find <path>`
      if (viewRange) {
        throw new ToolError(
          "view_range parameter is not allowed when path points to a directory."
        );
      }
      const cmd = `find ${shellQuote(filePath)} -maxdepth 2 -not -path '*/.*'`;
      const [rc, stdout, stderr] = await run(cmd);
      let output = stdout;
      if (!stderr) {
        output = `Here's the files and directories up to 2 levels deep in ${filePath}, excluding hidden items:\n${stdout}\n`;
      }
      return { output, error: stderr };
    } else {
      // it's a file
      const fileContent = this.readFile(filePath);
      // apply viewRange if any
      if (viewRange) {
        if (
          !Array.isArray(viewRange) ||
          viewRange.length !== 2 ||
          typeof viewRange[0] !== "number" ||
          typeof viewRange[1] !== "number"
        ) {
          throw new ToolError("Invalid view_range. Must be [startLine, endLine].");
        }
        return { output: this.makeOutputSnippet(fileContent, filePath, viewRange) };
      } else {
        return { output: this.makeOutputSnippet(fileContent, filePath) };
      }
    }
  }

  /**
   * 2) handleCreate
   */
  private async handleCreate(filePath: string, fileText?: string): Promise<ToolResult> {
    this.validatePath("create", filePath);
    if (!fileText) {
      throw new ToolError("Parameter `file_text` is required for command: create");
    }
    // write
    this.writeFile(filePath, fileText);
    // store this version for undo
    this.fileHistory.set(filePath, [fileText]);
    return {
      output: `File created successfully at: ${filePath}`,
    };
  }

  /**
   * 3) handleStrReplace
   */
  private async handleStrReplace(
    filePath: string,
    oldStr?: string,
    newStr?: string
  ): Promise<ToolResult> {
    this.validatePath("str_replace", filePath);
    if (!oldStr) {
      throw new ToolError("Parameter `old_str` is required for command: str_replace");
    }
    const fileContent = this.readFile(filePath).replaceAll("\t", "    ");
    const count = (fileContent.match(new RegExp(oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;

    if (count === 0) {
      throw new ToolError(
        `No replacement was performed, old_str '${oldStr}' did not appear in ${filePath}.`
      );
    }
    if (count > 1) {
      throw new ToolError(
        `No replacement performed. Multiple occurrences of '${oldStr}' found in ${filePath}.`
      );
    }

    const replacedText = fileContent.replace(oldStr, newStr || "");
    // write new content
    this.writeFile(filePath, replacedText);

    // store old content for undo
    const arr = this.fileHistory.get(filePath) || [];
    arr.push(fileContent);
    this.fileHistory.set(filePath, arr);

    // snippet
    const replacementLine = fileContent.split(oldStr)[0].split("\n").length - 1;
    const snippet = this.makeSnippet(replacedText, replacementLine);

    const successMsg =
      `The file ${filePath} has been edited.\n` +
      snippet +
      "\nReview the changes. Edit again if needed.";
    return { output: successMsg };
  }

  /**
   * 4) handleInsert
   */
  private async handleInsert(
    filePath: string,
    insertLine?: number,
    newStr?: string
  ): Promise<ToolResult> {
    this.validatePath("insert", filePath);
    if (typeof insertLine !== "number") {
      throw new ToolError("Parameter `insert_line` is required for command: insert (number).");
    }
    if (!newStr) {
      throw new ToolError("Parameter `new_str` is required for command: insert.");
    }
    const fileText = this.readFile(filePath).replaceAll("\t", "    ");
    const lines = fileText.split("\n");
    const n = lines.length;
    if (insertLine < 0 || insertLine > n) {
      throw new ToolError(`insert_line ${insertLine} out of range [0..${n}].`);
    }
    const newStrLines = newStr.replaceAll("\t", "    ").split("\n");
    const newFileLines = [
      ...lines.slice(0, insertLine),
      ...newStrLines,
      ...lines.slice(insertLine),
    ];
    const newFileText = newFileLines.join("\n");

    // snippet
    const snippetLines = newFileLines.slice(
      Math.max(0, insertLine - 4),
      insertLine + newStrLines.length + 4
    );
    const snippet = `A snippet:\n${snippetLines.join("\n")}`;

    // write
    this.writeFile(filePath, newFileText);
    // store old content for undo
    const arr = this.fileHistory.get(filePath) || [];
    arr.push(fileText);
    this.fileHistory.set(filePath, arr);

    const successMsg =
      `The file ${filePath} has been edited.\n` +
      snippet +
      "\nReview the changes. Edit again if needed.";
    return { output: successMsg };
  }

  /**
   * 5) handleUndo
   */
  private async handleUndo(filePath: string): Promise<ToolResult> {
    this.validatePath("undo_edit", filePath);
    const arr = this.fileHistory.get(filePath);
    if (!arr || arr.length === 0) {
      throw new ToolError(`No edit history found for ${filePath}.`);
    }
    // pop last
    const previousContent = arr.pop()!;
    this.writeFile(filePath, previousContent);
    // update
    this.fileHistory.set(filePath, arr);
    return {
      output: `Last edit to ${filePath} undone successfully.\n${this.makeOutputSnippet(
        previousContent,
        filePath
      )}`,
    };
  }

  /**
   * Validate path logic
   */
  private validatePath(command: string, filePath: string) {
    if (!path.isAbsolute(filePath)) {
      throw new ToolError(`The path ${filePath} is not absolute. Provide an absolute path.`);
    }
    const exists = fs.existsSync(filePath);
    if (!exists && command !== "create") {
      throw new ToolError(`Path ${filePath} does not exist. For new files, use 'create'.`);
    }
    const isDir = exists && fs.lstatSync(filePath).isDirectory();
    if (isDir && command !== "view") {
      throw new ToolError(`The path ${filePath} is a directory; only 'view' can be used on directories.`);
    }
    if (exists && command === "create") {
      throw new ToolError(`File already exists at: ${filePath}. Cannot overwrite with 'create'.`);
    }
  }

  private isDirectory(filePath: string) {
    return fs.existsSync(filePath) && fs.lstatSync(filePath).isDirectory();
  }

  private readFile(filePath: string): string {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch (err) {
      throw new ToolError(`Error reading file ${filePath}: ${String(err)}`);
    }
  }

  private writeFile(filePath: string, data: string): void {
    try {
      fs.writeFileSync(filePath, data);
    } catch (err) {
      throw new ToolError(`Error writing file ${filePath}: ${String(err)}`);
    }
  }

  /**
   * Display a snippet with line numbers. 
   * If viewRange is [2,5], we show lines 2..5 (1-based).
   */
  private makeOutputSnippet(fileContent: string, filePath: string, viewRange?: [number, number]): string {
    const lines = fileContent.split("\n");
    const n = lines.length;
    let start = 1;
    let end = n;
    if (viewRange) {
      [start, end] = viewRange;
      if (start < 1 || start > n) {
        throw new ToolError(`view_range start ${start} not in [1..${n}]`);
      }
      if (end !== -1 && (end < start || end > n)) {
        throw new ToolError(`view_range end ${end} not in [${start}..${n}] or -1`);
      }
      if (end === -1) {
        end = n;
      }
    }
    // slice lines
    const snippet = lines.slice(start - 1, end).map((line, i) => {
      const ln = i + start;
      return `${ln.toString().padStart(6)}\t${line}`;
    });
    const truncated = maybeTruncate(snippet.join("\n"));
    return `Here's result of running cat -n on ${filePath}:\n${truncated}\n`;
  }

  /**
   * Make a snippet around a given line number
   */
  private makeSnippet(newFileContent: string, replacementLine: number): string {
    const lines = newFileContent.split("\n");
    const startLine = Math.max(0, replacementLine - 4);
    const endLine = Math.min(lines.length, replacementLine + 4);
    const snippet = lines.slice(startLine, endLine + 1);
    return snippet.join("\n");
  }
}

/**
 * Minimal variant for older version (like "text_editor_20241022").
 */
export class EditTool20241022 extends EditTool20250124 {
  api_type = "text_editor_20241022";
  
  toParams(): any {
    return {
      name: this.name,
      type: this.api_type,
    };
  }
}

/**
 * A small shell-escape (since we might run `find` or other commands).
 */
function shellQuote(str: string) {
  return `'${str.replace(/'/g, "'\\''")}'`;
}
