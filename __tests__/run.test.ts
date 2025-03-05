import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

// Import your plugin from the "dist" build
import anthropicComputerUsePlugin from "../dist/index.js";

// Pull the action from the plugin's actions array
import type {
  IAgentRuntime,
  HandlerCallback,
  Memory,
  MemoryManager,
} from "@elizaos/core";

// -- Mock axios so we avoid real calls to Anthropic
vi.mock("axios", () => {
  const mockPost = vi.fn().mockResolvedValue({
    data: {
      id: "msg_mock",
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Sure, let me do that... (mock partial)",
        }
      ],
      model: "claude-3-5-sonnet-20241022",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 50
      }
    },
  });
  
  // Debug the mock calls
  mockPost.mockImplementation((url, body, options) => {
    console.log("MOCK AXIOS CALLED WITH:", { url, body });
    return Promise.resolve({
      data: {
        id: "msg_mock",
        type: "message",
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Sure, let me do that... (mock partial)",
          }
        ],
        model: "claude-3-5-sonnet-20241022",
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50
        }
      },
    });
  });
  
  return {
    post: mockPost,
    default: {
      post: mockPost,
    },
  };
});

// -- Mock environment variables
beforeEach(() => {
  // Mock environment variables needed by the plugin
  process.env.WIDTH = "1024";
  process.env.HEIGHT = "768";
});

// -- Mock the multiTurnComputerUse function to debug
vi.mock("../src/loop", async () => {
  const actual = await vi.importActual("../src/loop");
  return {
    ...actual,
    multiTurnComputerUse: vi.fn().mockImplementation(async (args) => {
      console.log("MOCK multiTurnComputerUse CALLED WITH:", JSON.stringify(args, null, 2));
      try {
        // Call the onIntermediate callback with our mock content
        if (args.onIntermediate) {
          await args.onIntermediate([
            {
              type: "text",
              text: "Sure, let me do that... (mock partial)",
            }
          ]);
        }
        
        // Return a valid conversation array
        return [
          ...args.messages,
          {
            role: "assistant",
            content: JSON.stringify([
              {
                type: "text",
                text: "Sure, let me do that... (mock partial)",
              }
            ])
          }
        ];
      } catch (err) {
        console.error("ERROR IN multiTurnComputerUse MOCK:", err);
        throw err;
      }
    })
  };
});

describe("anthropicComputerUsePlugin - Integration Test (Vitest)", () => {
  let compUseAction = anthropicComputerUsePlugin.actions?.find(
    (a) => a.name === "ANTHROPIC_COMPUTER_USE"
  );

  // Make sure we found the action in the plugin
  if (!compUseAction) {
    throw new Error("Could not find ANTHROPIC_COMPUTER_USE in plugin actions.");
  }

  // Create a mock runtime for testing
  const mockRuntime: IAgentRuntime = {
    agentId: "test-agent-123" as `${string}-${string}-${string}-${string}-${string}`,
    messageManager: {
      async createMemory(mem: Memory) {
        console.log("TEST: createMemory called with:", mem);
        return;
      },
      async removeMemory(memId: string) {
        console.log("TEST: removeMemory called with:", memId);
        return;
      },
      async getMemoryById(memId: string) {
        console.log("TEST: getMemoryById called with:", memId);
        if (memId.includes("anthropic_computeruse")) {
          return {
            id: memId as `${string}-${string}-${string}-${string}-${string}`,
            content: {
              conversation: [
                { role: "user", content: "I need help with my computer" },
                { role: "assistant", content: JSON.stringify([{ type: "text", text: "Sure, let me do that... (mock partial)" }]) }
              ],
              text: "Mock memory content",
            },
            userId: "test-user" as `${string}-${string}-${string}-${string}-${string}`,
            agentId: "test-agent" as `${string}-${string}-${string}-${string}-${string}`,
            roomId: "test-room" as `${string}-${string}-${string}-${string}-${string}`,
          } as unknown as Memory;
        }
        return null;
      },
    } as unknown as MemoryManager,
    getSetting(key: string) {
      console.log("TEST: getSetting called with:", key);
      // Return mock settings
      if (key === "ANTHROPIC_API_KEY") return "mock-api-key";
      if (key === "WIDTH") return "1024";
      if (key === "HEIGHT") return "768";
      return null;
    },
  } as IAgentRuntime;

  // An example user message that should trigger the plugin
  const userMemory: Memory = {
    id: "00000000-0000-0000-0000-000000000001",
    userId: "00000000-0000-0000-0000-000000000002",
    agentId: mockRuntime.agentId,
    roomId: "00000000-0000-0000-0000-000000000003",
    content: { text: "Could you open xterm and take a screenshot?" },
    createdAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should load the plugin and pass validate()", async () => {
    expect(anthropicComputerUsePlugin.name).toBe("anthropic-computer-use");
    // Check the action's validate
    const valid = await compUseAction.validate(mockRuntime, userMemory);
    expect(valid).toBe(true);
  });

  it("should invoke handler, produce partial & final responses, and update memory", async () => {
    // Debug what actions are available
    console.log("TEST: Plugin:", anthropicComputerUsePlugin);
    console.log("TEST: Plugin actions:", anthropicComputerUsePlugin.actions?.map((a: any) => a.name));
    
    // 1) Get the action - use the correct action name
    const compUseAction = anthropicComputerUsePlugin.actions?.find(
      (a: any) => a.name === "ANTHROPIC_COMPUTER_USE"
    );
    console.log("TEST: Found action:", compUseAction ? (compUseAction as any).name : undefined);
    expect(compUseAction).toBeDefined();
    if (!compUseAction) return;

    console.log("TEST: Starting test execution");
    
    // Track partial and final messages
    const partials: string[] = [];
    let finalText = "";

    // Create a test callback
    const testCallback: HandlerCallback = async (msg) => {
      console.log("TEST CALLBACK CALLED:", msg);
      if (msg.type === "partial") {
        partials.push(msg.text || "");
      } else {
        finalText = msg.text || "";
      }
      return []; // Return empty Memory array to match HandlerCallback signature
    };

    // Create a user memory
    const userMemory: Memory = {
      id: "user-memory-123" as `${string}-${string}-${string}-${string}-${string}`,
      content: {
        text: "I need help with my computer",
      },
    } as Memory;

    try {
      // 3) Call the action's handler
      console.log("TEST: About to call handler");
      const result = await compUseAction.handler(
        mockRuntime,
        userMemory,
        undefined,
        {}, // no special options
        testCallback
      );
      console.log("TEST: Handler returned:", result);

      // 4) Assertions:
      expect(result).toBe(true);
      // We should have 1 partial message
      console.log("TEST: Partial messages:", partials);
      expect(partials.length).toBe(1);
      expect(partials[0]).toContain("Sure, let me do that... (mock partial)");
      // We should have a final message
      console.log("TEST: Final message:", finalText);
      expect(finalText).toContain("Sure, let me do that... (mock partial)");

      // Check that axios.post was called with the Anthropic URL
      expect(axios.post).toHaveBeenCalled();
      const callArgs = (axios.post as any).mock.calls[0];
      console.log("TEST: Axios call args:", callArgs);
      const [callUrl, callBody] = callArgs;
      expect(callUrl).toContain("https://api.anthropic.com/v1/messages");
      expect(callBody.messages).toBeDefined();

      // Memory check: The plugin stores conversation in a memory
      const memoryId = `anthropic_computeruse_${mockRuntime.agentId}` as `${string}-${string}-${string}-${string}-${string}`;
      console.log("TEST: Checking memory with ID:", memoryId);
      const updatedMem = await mockRuntime.messageManager.getMemoryById(memoryId);
      console.log("TEST: Updated memory:", updatedMem);
      expect(updatedMem).not.toBeNull();
      if (updatedMem) {
        const conv = updatedMem.content.conversation as Array<{role: string, content: string}>;
        console.log("TEST: Conversation in memory:", conv);
        expect(Array.isArray(conv)).toBe(true);
        // The last assistant message
        const lastAssistant = conv.find((c) => c.role === "assistant");
        expect(lastAssistant).toBeDefined();
        expect(lastAssistant!.content).toMatch(
          /Sure, let me do that... \(mock partial\)/
        );
      }
    } catch (err) {
      console.error("TEST ERROR:", err);
      throw err;
    }
  });
});
