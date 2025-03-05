import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { spawn } from "child_process";
import * as util from "util";
import { BaseAnthropicTool, ToolError, ToolResult } from "./base";
import { run } from "./run";

////////////////////////////////////////////////////////////////////////////////
// Type Definitions matching Python
////////////////////////////////////////////////////////////////////////////////

/** Matches Python's literal for Action_20241022 */
export type Action_20241022 =
  | "key"
  | "type"
  | "mouse_move"
  | "left_click"
  | "left_click_drag"
  | "right_click"
  | "middle_click"
  | "double_click"
  | "screenshot"
  | "cursor_position";

/** Extends the above with extra actions for 20250124 */
export type Action_20250124 =
  | Action_20241022
  | "left_mouse_down"
  | "left_mouse_up"
  | "scroll"
  | "hold_key"
  | "wait"
  | "triple_click";

/** Scroll direction */
export type ScrollDirection = "up" | "down" | "left" | "right";

interface Resolution {
  width: number;
  height: number;
}

const MAX_SCALING_TARGETS: Record<string, Resolution> = {
  XGA: { width: 1024, height: 768 }, // 4:3
  WXGA: { width: 1280, height: 800 }, // 16:10
  FWXGA: { width: 1366, height: 768 }, // ~16:9
};

const CLICK_BUTTONS: Record<string, number | string> = {
  left_click: 1,
  right_click: 3,
  middle_click: 2,
  double_click: "--repeat 2 --delay 10 1",
  triple_click: "--repeat 3 --delay 10 1",
};

enum ScalingSource {
  COMPUTER = "computer",
  API = "api",
}

/** A small function to chunk text when typing */
function chunks(s: string, chunkSize: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < s.length; i += chunkSize) {
    result.push(s.slice(i, i + chunkSize));
  }
  return result;
}

////////////////////////////////////////////////////////////////////////////////
// The base class: "BaseComputerTool"
////////////////////////////////////////////////////////////////////////////////

/**
 * Base class that implements the Python logic for:
 *  - environment variables WIDTH, HEIGHT, DISPLAY_NUM
 *  - screenshot and coordinate scaling
 *  - xdotool usage
 */
export class BaseComputerTool {
  name: "computer" = "computer";
  width: number;
  height: number;
  displayNum: number | null;

  protected _screenshotDelay = 2.0; // seconds
  protected _scalingEnabled = true;
  protected _displayPrefix = "";
  protected xdotool = "";

  constructor() {
    // read environment
    const w = process.env.WIDTH || "0";
    const h = process.env.HEIGHT || "0";

    this.width = parseInt(w, 10);
    this.height = parseInt(h, 10);
    if (!this.width || !this.height) {
      throw new Error("WIDTH, HEIGHT must be set in environment variables");
    }

    const displayNumStr = process.env.DISPLAY_NUM;
    if (displayNumStr) {
      this.displayNum = parseInt(displayNumStr, 10);
      this._displayPrefix = `DISPLAY=:${this.displayNum} `;
    } else {
      this.displayNum = null;
    }
    this.xdotool = `${this._displayPrefix}xdotool`;
  }

  /**
   * Provide the final tool parameters for (e.g.) BetaToolComputerUse20241022Param:
   */
  get options() {
    // scale the entire resolution
    const [width, height] = this.scaleCoordinates(
      ScalingSource.COMPUTER,
      this.width,
      this.height
    );
    return {
      display_width_px: width,
      display_height_px: height,
      display_number: this.displayNum,
    };
  }

  /**
   * The base call handles only the "action" in the 20241022 set. We'll override for 20250124.
   */
  async call(args: Record<string, any>): Promise<ToolResult> {
    // e.g. { action, text, coordinate, etc. }
    const action = args.action as Action_20241022;
    const text = args.text as string | undefined;
    const coordinate = args.coordinate as [number, number] | undefined;

    // handle the known actions
    switch (action) {
      case "mouse_move":
      case "left_click_drag": {
        if (!coordinate) {
          throw new ToolError(`coordinate is required for ${action}`);
        }
        if (text !== undefined) {
          throw new ToolError(`text is not accepted for ${action}`);
        }
        const [x, y] = this.validateAndGetCoordinates(coordinate);

        if (action === "mouse_move") {
          const cmd = `${this.xdotool} mousemove --sync ${x} ${y}`;
          return this.shell(cmd);
        } else {
          // left_click_drag
          const cmd = `${this.xdotool} mousedown 1 mousemove --sync ${x} ${y} mouseup 1`;
          return this.shell(cmd);
        }
      }

      case "key":
      case "type": {
        if (!text) {
          throw new ToolError(`text is required for ${action}`);
        }
        if (coordinate !== undefined) {
          throw new ToolError(`coordinate is not accepted for ${action}`);
        }
        if (typeof text !== "string") {
          return { error: `${text} must be a string` };
        }

        if (action === "key") {
          const cmd = `${this.xdotool} key -- ${text}`;
          return this.shell(cmd);
        } else {
          // "type"
          const TYPING_DELAY_MS = 12;
          const TYPING_GROUP_SIZE = 50;
          const results: ToolResult[] = [];
          const textChunks = chunks(text, TYPING_GROUP_SIZE);
          for (const c of textChunks) {
            const cmd = `${this.xdotool} type --delay ${TYPING_DELAY_MS} -- ${shellQuote(c)}`;
            // pass takeScreenshot=false because we only want one final screenshot at the end
            const partial = await this.shell(cmd, false);
            results.push(partial);
          }
          // after typing is done, do a screenshot
          const shot = await this.screenshot();
          return {
            output: results.map((r) => r.output || "").join(""),
            error: results.map((r) => r.error || "").join(""),
            base64_image: shot.base64_image,
          };
        }
      }

      case "left_click":
      case "right_click":
      case "double_click":
      case "middle_click":
      case "screenshot":
      case "cursor_position": {
        if (text !== undefined) {
          throw new ToolError(`text is not accepted for ${action}`);
        }
        if (coordinate !== undefined) {
          throw new ToolError(`coordinate is not accepted for ${action}`);
        }

        if (action === "screenshot") {
          return this.screenshot();
        } else if (action === "cursor_position") {
          const cmd = `${this.xdotool} getmouselocation --shell`;
          const res = await this.shell(cmd, false);
          const out = res.output || "";
          const xVal = parseInt(out.split("X=")[1]?.split("\n")[0] || "0", 10);
          const yVal = parseInt(out.split("Y=")[1]?.split("\n")[0] || "0", 10);
          const [scaledX, scaledY] = this.scaleCoordinates(
            ScalingSource.COMPUTER,
            xVal,
            yVal
          );
          return {
            ...res,
            output: `X=${scaledX},Y=${scaledY}`,
          };
        } else {
          // e.g. left_click
          const button = CLICK_BUTTONS[action];
          const cmd = `${this.xdotool} click ${button}`;
          return this.shell(cmd);
        }
      }

      default:
        throw new ToolError(`Invalid action: ${action}`);
    }
  }

  /**
   * Validate coordinate
   */
  validateAndGetCoordinates(coord: [number, number]): [number, number] {
    if (!Array.isArray(coord) || coord.length !== 2) {
      throw new ToolError(`${coord} must be a tuple of length 2`);
    }
    const [x, y] = coord;
    if (x < 0 || y < 0) {
      throw new ToolError(`${coord} must be a tuple of non-negative ints`);
    }
    return this.scaleCoordinates(ScalingSource.API, x, y);
  }

  /**
   * Takes a screenshot, possibly using "gnome-screenshot" or fallback "scrot", then resizes with "convert".
   */
  async screenshot(): Promise<ToolResult> {
    const OUTPUT_DIR = "/tmp/outputs";
    // ensure dir
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const filename = `screenshot_${crypto.randomBytes(8).toString("hex")}.png`;
    const filepath = path.join(OUTPUT_DIR, filename);

    // check for "gnome-screenshot"
    const hasGnome = await which("gnome-screenshot");
    let screenshotCmd = "";
    if (hasGnome) {
      screenshotCmd = `${this._displayPrefix}gnome-screenshot -f ${filepath} -p`;
    } else {
      // fallback to scrot
      screenshotCmd = `${this._displayPrefix}scrot -p ${filepath}`;
    }

    // run screenshot
    const res = await this.shell(screenshotCmd, false);
    // optionally scale down
    if (this._scalingEnabled) {
      const [x, y] = this.scaleCoordinates(
        ScalingSource.COMPUTER,
        this.width,
        this.height
      );
      const convertCmd = `convert ${filepath} -resize ${x}x${y}! ${filepath}`;
      await this.shell(convertCmd, false);
    }

    if (fs.existsSync(filepath)) {
      const base64Data = fs.readFileSync(filepath).toString("base64");
      return {
        ...res,
        base64_image: base64Data,
      };
    }
    throw new ToolError(`Failed to take screenshot: ${res.error}`);
  }

  /**
   * Runs a shell command using `run(...)`.
   * Optionally take another screenshot after the command if `takeScreenshot=true`.
   */
  async shell(command: string, takeScreenshot = true): Promise<ToolResult> {
    const [rc, stdout, stderr] = await run(command);
    let base64_image: string | undefined;
    if (takeScreenshot) {
      // small delay
      await new Promise((r) => setTimeout(r, this._screenshotDelay * 1000));
      const shot = await this.screenshot();
      base64_image = shot.base64_image;
    }
    return { output: stdout, error: stderr, base64_image };
  }

  /**
   * scaleCoordinates from the python code, with a "scaling" approach for XGA/WXGA
   */
  scaleCoordinates(
    source: ScalingSource,
    x: number,
    y: number
  ): [number, number] {
    if (!this._scalingEnabled) {
      return [x, y];
    }
    const ratio = this.width / this.height;
    let targetDimension: Resolution | null = null;
    for (const dimKey of Object.keys(MAX_SCALING_TARGETS)) {
      const dim = MAX_SCALING_TARGETS[dimKey];
      const dimRatio = dim.width / dim.height;
      // if ratio is close
      if (Math.abs(dimRatio - ratio) < 0.02) {
        if (dim.width < this.width) {
          targetDimension = dim;
        }
        break;
      }
    }
    if (!targetDimension) {
      return [x, y];
    }
    const xFactor = targetDimension.width / this.width;
    const yFactor = targetDimension.height / this.height;

    if (source === ScalingSource.API) {
      if (x > this.width || y > this.height) {
        throw new ToolError(`Coordinates ${x}, ${y} are out of bounds`);
      }
      // scale up
      return [Math.round(x / xFactor), Math.round(y / yFactor)];
    } else {
      // scale down
      return [Math.round(x * xFactor), Math.round(y * yFactor)];
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// Derived Classes (like ComputerTool20241022, ComputerTool20250124)
////////////////////////////////////////////////////////////////////////////////

export class ComputerTool20241022 extends BaseComputerTool implements BaseAnthropicTool {
  api_type: "computer_20241022" = "computer_20241022";

  toParams(): any {
    return {
      name: this.name,
      type: this.api_type,
      ...this.options,
    };
  }
}

export class ComputerTool20250124 extends BaseComputerTool implements BaseAnthropicTool {
  api_type: "computer_20250124" = "computer_20250124";

  toParams(): any {
    return {
      name: this.name,
      type: this.api_type,
      ...this.options,
    };
  }

  /**
   * Extend the call() method with additional actions: "left_mouse_down", "left_mouse_up", "scroll", "hold_key", "wait", "triple_click"
   */
  async call(args: Record<string, any>): Promise<ToolResult> {
    const action = args.action as Action_20250124;
    const text = args.text as string | undefined;
    const coordinate = args.coordinate as [number, number] | undefined;
    const scrollDirection = args.scroll_direction as ScrollDirection | undefined;
    const scrollAmount = args.scroll_amount as number | undefined;
    const duration = args.duration as number | undefined;
    const key = args.key as string | undefined;

    // handle extra 20250124 actions
    switch (action) {
      case "left_mouse_down":
      case "left_mouse_up": {
        if (coordinate !== undefined) {
          throw new ToolError(`coordinate is not accepted for ${action}.`);
        }
        const cmd = `${this.xdotool} ${action === "left_mouse_down" ? "mousedown" : "mouseup"} 1`;
        return this.shell(cmd);
      }
      case "scroll": {
        if (!scrollDirection || !["up", "down", "left", "right"].includes(scrollDirection)) {
          throw new ToolError(`scroll_direction=${scrollDirection} must be 'up','down','left','right'`);
        }
        if (typeof scrollAmount !== "number" || scrollAmount < 0) {
          throw new ToolError(`scroll_amount=${scrollAmount} must be a non-negative int`);
        }
        let mouseMovePart = "";
        if (coordinate) {
          const [x, y] = this.validateAndGetCoordinates(coordinate);
          mouseMovePart = `mousemove --sync ${x} ${y}`;
        }
        const scrollButton = {
          up: 4,
          down: 5,
          left: 6,
          right: 7,
        }[scrollDirection];
        const cmdParts = [this.xdotool, mouseMovePart];
        if (text) {
          cmdParts.push(`keydown ${text}`);
        }
        cmdParts.push(`click --repeat ${scrollAmount} ${scrollButton}`);
        if (text) {
          cmdParts.push(`keyup ${text}`);
        }
        return this.shell(cmdParts.join(" "));
      }
      case "hold_key":
      case "wait": {
        if (typeof duration !== "number" || duration < 0) {
          throw new ToolError(`duration=${duration} must be a non-negative number`);
        }
        if (duration > 100) {
          throw new ToolError(`duration=${duration} is too long.`);
        }
        if (action === "hold_key") {
          if (!text) {
            throw new ToolError(`text is required for hold_key`);
          }
          const escaped = shellQuote(text);
          const cmd = [
            this.xdotool,
            `keydown ${escaped}`,
            `sleep ${duration}`,
            `keyup ${escaped}`,
          ].join(" ");
          return this.shell(cmd);
        } else {
          // "wait"
          // just wait, then do screenshot
          await new Promise((r) => setTimeout(r, duration * 1000));
          return this.screenshot();
        }
      }
      case "triple_click":
      case "double_click":
      case "left_click":
      case "right_click":
      case "middle_click": {
        // we handle "triple_click" also
        if (text !== undefined) {
          throw new ToolError(`text is not accepted for ${action}`);
        }
        let mouseMovePart = "";
        if (coordinate) {
          const [x, y] = this.validateAndGetCoordinates(coordinate);
          mouseMovePart = `mousemove --sync ${x} ${y}`;
        }
        const cmdParts = [this.xdotool, mouseMovePart];
        if (key) {
          cmdParts.push(`keydown ${key}`);
        }
        const button = CLICK_BUTTONS[action] ?? action;
        cmdParts.push(`click ${button}`);
        if (key) {
          cmdParts.push(`keyup ${key}`);
        }
        return this.shell(cmdParts.join(" "));
      }
      default:
        // fallback to the base's call
        return super.call(args);
    }
  }
}

/**
 * A tiny shell-escape. xdotool might interpret special characters badly.
 */
function shellQuote(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Attempt to find an executable in PATH, returning a boolean if found.
 */
async function which(cmdName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("which", [cmdName]);
    let found = false;
    child.stdout.on("data", (d) => {
      if (d.toString().trim().length > 0) found = true;
    });
    child.on("close", () => resolve(found));
  });
}
