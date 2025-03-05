/**
 * This file corresponds to `base.py` in the Python code.
 * It defines the abstract base class for Anthropic tools, the ToolResult structure,
 * and exceptions (ToolError).
 */
 
export interface ToolResult {
    output?: string | null;
    error?: string | null;
    base64_image?: string | null;
    system?: string | null;
  }
  
  export class ToolError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ToolError";
    }
  }
  
  /**
   * Abstract base for any Anthropic-defined tool.
   */
  export abstract class BaseAnthropicTool {
    /**
     * Tools must define a "name" and an "api_type" for the Anthropics Tools schema
     */
    abstract name: string;       // e.g. "bash", "computer", "str_replace_editor"
    abstract api_type: string;   // e.g. "bash_20250124"
  
    /**
     * The main "tool call" method. Accepts arbitrary arguments, returns a ToolResult.
     */
    abstract call(args: Record<string, any>): Promise<ToolResult>;
  
    /**
     * toParams() is used to produce the BetaToolUnionParam describing the tool. 
     */
    toParams(): any {
      return {
        type: this.api_type,
        name: this.name,
      };
    }
  }
  