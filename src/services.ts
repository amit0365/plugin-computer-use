import { platform } from "os";
import { BetaMessageParam, BetaToolResultBlockParam, BetaContentBlockParam, BetaToolUseBlockParam } from "./types";
import { ToolResult } from "./tools/base";

/**
 * Big system prompt that references Ubuntu environment, etc.
 */
export function systemPrompt(): string {
  // In python, it used platform.machine(), we can do the same in Node's `os.arch()`.
  // For brevity, we'll just do:
  const machineArch = platform(); // or os.arch()
  const today = new Date().toDateString();

  return `<SYSTEM_CAPABILITY>
* You are running on Ubuntu with internet access.
* You can feel free to install Ubuntu applications with your bash tool. Use curl instead of wget.
* To open firefox, please just click on the firefox icon.  Note, firefox-esr is what is installed on your system.
* Using bash tool you can start GUI applications, but you need to set export DISPLAY=:1 and use a subshell. For example "(DISPLAY=:1 xterm &)". GUI apps run with bash tool will appear within your desktop environment, but they may take some time to appear. Take a screenshot to confirm it did.
* When using your bash tool with commands that are expected to output very large quantities of text, redirect into a tmp file and use str_replace_editor or \`grep -n -B <lines before> -A <lines after> <query> <filename>\` to confirm output.
* When viewing a page it can be helpful to zoom out so that you can see everything on the page.  Either that, or make sure you scroll down to see everything before deciding something isn't available.
* When using your computer function calls, they take a while to run and send back to you.  Where possible/feasible, try to chain multiple of these calls all into one function calls request.
The current date is ${today}.
</SYSTEM_CAPABILITY>

<IMPORTANT>
* When using Firefox, if a startup wizard appears, IGNORE IT.  Do not even click "skip this step".  Instead, click on the address bar where it says "Search or enter address", and enter the appropriate search term or URL there.
* If the item you are looking at is a pdf, if after taking a single screenshot of the pdf it seems that you want to read the entire document instead of trying to continue to read the pdf from your screenshots + navigation, determine the URL, use curl to download the pdf, install and use pdftotext to convert it to a text file, and then read that text file directly with your StrReplaceEditTool.
</IMPORTANT>`;
}

/**
 * Mark ephemeral blocks for the last ~3 user messages
 */
export function _injectPromptCaching(messages: any[]) {
  let breakpointsRemaining = 3;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" && Array.isArray(msg.content)) {
      if (breakpointsRemaining > 0) {
        breakpointsRemaining--;
        const len = msg.content.length;
        if (len > 0) {
          (msg.content[len - 1] as any).cache_control = { type: "ephemeral" };
        }
      } else {
        const len = msg.content.length;
        if (len > 0 && (msg.content[len - 1] as any).cache_control) {
          delete (msg.content[len - 1] as any).cache_control;
        }
      }
    }
  }
}

/**
 * Keep only N most recent images among tool_result blocks
 */
export function _maybeFilterToNMostRecentImages(
  messages: any[],
  imagesToKeep: number,
  minRemovalThreshold: number
) {
  if (!imagesToKeep) return;

  const toolResults: any[] = [];
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "tool_result") {
          toolResults.push(block);
        }
      }
    }
  }

  let totalImages = 0;
  for (const tr of toolResults) {
    if (Array.isArray(tr.content)) {
      for (const c of tr.content) {
        if (c.type === "image") {
          totalImages++;
        }
      }
    }
  }
  let imagesToRemove = totalImages - imagesToKeep;
  imagesToRemove -= imagesToRemove % minRemovalThreshold;

  for (const tr of toolResults) {
    if (!Array.isArray(tr.content)) continue;
    const newContent = [];
    for (const c of tr.content) {
      if (c.type === "image" && imagesToRemove > 0) {
        imagesToRemove--;
        continue;
      }
      newContent.push(c);
    }
    tr.content = newContent;
  }
}

/**
 * Python: _response_to_params
 * Convert a BetaMessage into array of BetaContentBlockParam
 */
export function _responseToParams(response: any): BetaContentBlockParam[] {
  // We expect `response.content` to be an array of BetaTextBlock or BetaToolUseBlock
  const result: BetaContentBlockParam[] = [];
  if (!response?.content) return result;

  for (const block of response.content) {
    if (block.type === "text" && block.text) {
      result.push({
        type: "text",
        text: block.text,
      });
    } else if (block.type === "thinking") {
      // Might have signature
      result.push({
        type: "thinking",
        thinking: block.thinking || "",
        signature: block.signature || "",
      } as any);
    } else if (block.type === "tool_use") {
      // Cast to BetaToolUseBlockParam
      result.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input,
      } as BetaToolUseBlockParam);
    } else {
      // fallback
      result.push(block);
    }
  }
  return result;
}

/**
 * Python: _make_api_tool_result was in loop, but we do it in loop now as `_makeApiToolResult`.
 * No extra code needed here, we already define it in loop.ts
 */
export function _makeApiToolResult(
    result: ToolResult,
    toolUseId: string
  ): BetaToolResultBlockParam {
    let toolResultContent: string | (
      | { type: "text"; text: string }
      | { type: "image"; source: any }
    )[] = [];
    let isError = false;
  
    if (result.error) {
      isError = true;
      const combinedText = maybePrependSystem(result, result.error);
      toolResultContent = combinedText;
    } else {
      const contentArr: (
        | { type: "text"; text: string }
        | { type: "image"; source: any }
      )[] = [];
      
      if (result.output) {
        contentArr.push({
          type: "text",
          text: maybePrependSystem(result, result.output),
        });
      }
      if (result.base64_image) {
        contentArr.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: result.base64_image,
          },
        });
      }
      toolResultContent = contentArr;
    }
  
    return {
      type: "tool_result",
      content: toolResultContent,
      tool_use_id: toolUseId,
      is_error: isError,
    };
  }

  /** Prepend <system> ... </system> if result.system is present. */
function maybePrependSystem(result: ToolResult, text: string) {
    if (result.system) {
      return `<system>${result.system}</system>\n${text}`;
    }
    return text;
  }