/**
 * This file is equivalent to `bash.py`. 
 * It defines `BashTool20250124` and `BashTool20241022`, plus a `_BashSession` helper
 * for an interactive shell if "restart" is requested.
 *
 * In Python: 
 *   - `_BashSession` starts a subprocess, reads until a sentinel, etc.
 *   - `BashTool20250124` uses that session or restarts it.
 */
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { BaseAnthropicTool, ToolError, ToolResult } from "./base";

/**
 * `_BashSession` is a session of an interactive bash shell, akin to the Python version.
 * We feed commands, read output until a sentinel, handle timeouts, etc.
 */
class _BashSession {
  private _started = false;
  private _process: ChildProcessWithoutNullStreams | null = null;

  private _timeoutMs = 120_000; // 120s
  private _sentinel = "<<exit>>\n";

  async start(): Promise<void> {
    if (this._started) return;
    // Start an interactive shell:
    // On Python, we had `asyncio.create_subprocess_shell(...)`.
    // Here, we emulate it with Node's `spawn` in shell mode.
    this._process = spawn("bash", {
      shell: true, // so we can do built-ins
      stdio: "pipe", // we want to write to stdin
    });
    this._started = true;
  }

  stop(): void {
    if (!this._started || !this._process) return;
    if (this._process.exitCode === null) {
      this._process.kill("SIGTERM");
    }
  }

  /**
   * Run a command in the existing shell. We'll send a sentinel to know when it's done.
   */
  async run(command: string): Promise<ToolResult> {
    if (!this._started || !this._process) {
      throw new ToolError("Session not started.");
    }
    if (this._process.exitCode !== null) {
      // The process ended already
      return {
        system: "tool must be restarted",
        error: `bash has exited with return code ${this._process.exitCode}`,
      };
    }

    // We'll write the command + sentinel:
    // e.g. `echo "Hello"; echo "<<exit>>"`
    const fullCmd = `${command}; echo '${this._sentinel.trim()}'`;
    this._process.stdin.write(fullCmd + "\n");

    let stdout = "";
    let stderr = "";
    let done = false;

    // We'll read from the process's stdout/stderr until we see the sentinel
    const waitPromise = new Promise<void>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        // times out
        this._process?.kill("SIGTERM");
        return reject(
          new ToolError(
            `timed out: bash has not returned in ${
              this._timeoutMs / 1000
            } seconds and must be restarted`
          )
        );
      }, this._timeoutMs);

      const onStdoutData = (data: Buffer) => {
        // see if sentinel is included
        const text = data.toString();
        stdout += text;
        if (stdout.includes(this._sentinel.trim())) {
          // remove sentinel from output
          const index = stdout.indexOf(this._sentinel.trim());
          stdout = stdout.slice(0, index);
          cleanup();
          done = true;
          resolve();
        }
      };
      const onStderrData = (data: Buffer) => {
        stderr += data.toString();
      };
      const onClose = () => {
        // process ended
        if (!done) {
          // we ended unexpectedly
          cleanup();
          resolve(); // we'll just allow it
        }
      };

      const cleanup = () => {
        clearTimeout(timeoutHandle);
        this._process?.stdout.off("data", onStdoutData);
        this._process?.stderr.off("data", onStderrData);
        this._process?.off("close", onClose);
      };

      this._process?.stdout.on("data", onStdoutData);
      this._process?.stderr.on("data", onStderrData);
      this._process?.on("close", onClose);
    });

    try {
      await waitPromise;
    } catch (err) {
      return { error: (err as Error).message };
    }

    // Trim trailing newlines
    stdout = stdout.replace(/\n+$/, "");
    stderr = stderr.replace(/\n+$/, "");
    return { output: stdout, error: stderr };
  }
}

/**
 * The Bash tool that uses `_BashSession` for a persistent shell.
 * In Python, we have `BashTool20250124` which calls:
 *    - `restart => session.stop() + session.start()`
 *    - `command => session.run(command)`
 */
export class BashTool20250124 extends BaseAnthropicTool {
  name = "bash";
  api_type = "bash_20250124";

  private _session: _BashSession | null = null;

  toParams(): any {
    return {
      type: this.api_type,
      name: this.name,
    };
  }

  async call(args: Record<string, any>): Promise<ToolResult> {
    const command = args.command as string | undefined;
    const restart = args.restart === true;

    if (restart) {
      // stop old session, start new
      if (this._session) this._session.stop();
      this._session = new _BashSession();
      await this._session.start();
      return { system: "tool has been restarted." };
    }
    if (!this._session) {
      this._session = new _BashSession();
      await this._session.start();
    }

    if (!command) {
      return { error: "no command provided." };
    }

    // run in the session
    try {
      return await this._session.run(command);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
}

/**
 * A second version for "bash_20241022". 
 * Typically the code is identical except for the `api_type`.
 */
export class BashTool20241022 extends BashTool20250124 {
  api_type = "bash_20241022";
}
