/**
 * BetaMessageParam: represents a single turn in the conversation.
 * role: "user"|"assistant"|"system"
 * content: string or an array of BetaContentBlockParam
 */
  export interface BetaMessageParam {
    role: "user" | "assistant" | "system";
    content: string | BetaContentBlockParam[];
  }
  
  /** A polymorphic content block */
  export type BetaContentBlockParam =
    | BetaTextBlockParam
    | BetaToolUseBlockParam
    | BetaToolResultBlockParam
    | BetaThinkingBlockParam
    | BetaImageBlockParam;
  
  /** For text blocks */
  export interface BetaTextBlockParam {
    type: "text";
    text: string;
  }
  
  /** For thinking blocks */
  export interface BetaThinkingBlockParam {
    type: "thinking";
    thinking: string;
    signature?: string;
  }
  
  /** For tool use requests from the assistant */
  export interface BetaToolUseBlockParam {
    type: "tool_use";
    id: string; // unique ID that the model supplies
    name: string; // "bash" etc
    input: Record<string, any>;
  }
  
  /** For tool results appended by user role */
  export interface BetaToolResultBlockParam {
    type: "tool_result";
    tool_use_id: string;
    is_error: boolean;
    content: string | Array<{ type: "text"; text?: string } | { type: "image"; source: any }>;
  }
  
  /** For images in tool results */
  export interface BetaImageBlockParam {
    type: "image";
    source: {
      type: "base64";
      media_type: string;
      data: string;
    };
  }
  