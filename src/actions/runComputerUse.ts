import {
  elizaLogger,
  Action,
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  UUID,
} from "@elizaos/core";
import { validateAnthropicConfig } from "../environment";
import { getComputerUseExamples } from "../examples";
import { multiTurnComputerUse } from "../loop"; 

/**
 * Builds a Memory record for storing the entire computer-use conversation.
 */
function createComputerUseMemory({
  roomId,
  runtime,
  conversation,
}: {
  roomId: UUID;
  runtime: IAgentRuntime;
  conversation: any[];
}): Memory {
  return {
    id: roomId,
    agentId: runtime.agentId,
    userId: runtime.agentId,
    roomId,
    content: {
      source: "anthropic-computer-use",
      text: "Computer use conversation",
      conversation, // store conversation array
    },
    embedding: [],
  };
}

/**
 * The Action that triggers a multi-turn "computer use" loop with the standard endpoint,
 * storing conversation to memory. 
 * 
 * We do NOT produce any "Eliza" text ourselves. Instead, each 
 * partial "assistant" response from Anthropic is sent directly back 
 * via `callback({ text: partialText, type: "partial" })`.
 */
export const computerUseAction: Action = {
  name: "ANTHROPIC_COMPUTER_USE",
  similes: ["ANTHROPIC", "COMPUTER", "BASH", "TOOL", "BROWSE", "SEARCH", "OPEN", "WEBSITE"],
  description:
    "Use Anthropic's multi-turn loop to run local computer-use tools, returning partial + final responses. No Eliza text is produced here.",

  validate: async (runtime: IAgentRuntime) => {
    // Ensure we have an Anthropic key
    await validateAnthropicConfig(runtime);
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback: HandlerCallback
  ) => {
    try {
      // 1) Identify the memory record ID
      const roomId = ("anthropic_computeruse_" + runtime.agentId) as UUID;

      // 2) Attempt to load existing memory
      let existingMemory = await runtime.messageManager.getMemoryById(roomId);

      if (!existingMemory) {
        // Create if not found
        existingMemory = createComputerUseMemory({
          roomId,
          runtime,
          conversation: [],
        });
        await runtime.messageManager.createMemory(existingMemory);
      }

      // 3) Retrieve conversation array
      const conversation = (existingMemory.content.conversation as any[]) || [];

      // 4) Append the user's new message
      const userText = message.content?.text || "Hello from user";
      conversation.push({ role: "user", content: userText });

      // 5) Validate config (Anthropic key, etc.)
      const config = await validateAnthropicConfig(runtime);
      const anthropicKey = config.ANTHROPIC_API_KEY;

      // 6) Call the multi-turn loop. 
      //    Provide an onIntermediate callback to show partial responses:
      elizaLogger.info("[computerUseAction] Starting multi-turn computer use...");

      const finalMessages = await multiTurnComputerUse({
        apiKey: anthropicKey,
        messages: conversation,
        ephemeralPromptCaching: true,
        tokenEfficientTools: false,

        // New callback that runs every time the model sends an assistant message
        onIntermediate: async (assistantBlocks) => {
          // Convert blocks => string
          const partialText = convertBlocksToText(assistantBlocks);
          // Send it to the UI
          if (callback) {
            await callback({
              text: partialText,
              type: "partial", 
            });
          }
        },
      });

      // 7) The final conversation from multiTurnComputerUse
      existingMemory.content.conversation = finalMessages;

      // Because we do NOT have updateMemory, we do a remove + create
      await runtime.messageManager.removeMemory(roomId);
      await runtime.messageManager.createMemory(existingMemory);

      // 8) parse the last assistant message for a final text
      const lastMsg = finalMessages[finalMessages.length - 1];
      if (!lastMsg || lastMsg.role !== "assistant") {
        if (callback) {
          callback({ text: "No final assistant response found." });
        }
        return true;
      }

      let finalText = lastMsg.content;
      try {
        const blocks = JSON.parse(finalText);
        finalText = convertBlocksToText(blocks);
      } catch {
        // fallback
      }

      // 9) send the final text
      elizaLogger.success(`[computerUseAction] Final text => ${finalText}`);
      if (callback) {
        callback({ text: finalText, type: "final" });
      }
      return true;
    } catch (error: any) {
      elizaLogger.error("[computerUseAction] error:", error);
      if (callback) {
        callback({
          text: `Error: ${error.message}`,
          content: { error: error.message },
        });
      }
      return false;
    }
  },

  examples: getComputerUseExamples as ActionExample[][],
};

function convertBlocksToText(blocks: any[]): string {
  if (!Array.isArray(blocks)) {
    return typeof blocks === "string" ? blocks : JSON.stringify(blocks);
  }

  return blocks
    .map((block) => {
      switch (block.type) {
        case "text":
          return block.text;
        case "tool_result":
          if (typeof block.content === "string") {
            return block.content;
          } else if (Array.isArray(block.content)) {
            // flatten
            return block.content
              .map((c) => (c.type === "text" ? c.text : "[image omitted]"))
              .join("\n");
          }
          return "[tool result]";
        case "image":
          return "[image omitted]";
        case "thinking":
          return "[thinking hidden]";
        default:
          return "";
      }
    })
    .join("\n");
}

/**
 * toBlocksArray takes `assistantContent` (which might be a string or array)
 * and returns a guaranteed array of content-block objects.
 */
function toBlocksArray(assistantContent: unknown): any[] {
  // If it’s already an array of objects, assume it’s valid
  if (Array.isArray(assistantContent)) {
    return assistantContent;
  }

  // If it’s a string, see if it might be JSON
  if (typeof assistantContent === "string") {
    const trimmed = assistantContent.trim();
    // Quick shape check: must start with '[' or '{'
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        // If parse yields an array, return it
        if (Array.isArray(parsed)) {
          return parsed;
        }
        // If parse yields an object, wrap it in an array
        return [parsed];
      } catch {
        // fall through to fallback
      }
    }
  }

  // Fallback: if we can’t parse or it’s not an array,
  // return a single text block containing the raw content
  return [
    {
      type: "text",
      text: String(assistantContent),
    },
  ];
}
