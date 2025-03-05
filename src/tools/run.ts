/**
 * This file corresponds to `run.py`: a utility to run shell commands asynchronously,
 * possibly with a timeout, and optionally truncated output.
 */

import { spawn } from "child_process";

export const TRUNCATED_MESSAGE = "<response clipped><NOTE>Large output truncated</NOTE>";
export const MAX_RESPONSE_LEN = 16000;

/**
 * maybeTruncate: If content is longer than `truncateAfter`, we cut it and append TRUNCATED_MESSAGE.
 */
export function maybeTruncate(content: string, truncateAfter: number = MAX_RESPONSE_LEN): string {
  if (!content) return "";
  if (content.length <= truncateAfter) return content;
  return content.slice(0, truncateAfter) + TRUNCATED_MESSAGE;
}

/**
 * run(command, timeout=120) => [returnCode, stdout, stderr].
 * This is a direct "one-shot" shell execution, not an interactive session.
 */
export async function run(
  command: string,
  timeoutSec = 120,
  truncateAfter = MAX_RESPONSE_LEN
): Promise<[number, string, string]> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", command], {
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Command '${command}' timed out after ${timeoutSec}s`));
    }, timeoutSec * 1000);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // possibly truncate
      stdout = maybeTruncate(stdout, truncateAfter);
      stderr = maybeTruncate(stderr, truncateAfter);
      resolve([code ?? 0, stdout, stderr]);
    });
  });
}
