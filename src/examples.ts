import { ActionExample } from "@elizaos/core";

export const getComputerUseExamples: ActionExample[][] = [
  [
    {
      user: "{{user1}}",
      content: {
        text: "Can you run a bash command to check the system uptime?",
      },
    },
    {
      user: "{{agent}}",
      content: {
        text: "Sure, let me run the command for you.",
        action: "ANTHROPIC_COMPUTER_USE",
      },
    },
  ],
  [
    {
      user: "{{user1}}",
      content: {
        text: "Open Firefox for me if possible.",
      },
    },
    {
      user: "{{agent}}",
      content: {
        text: "Alright, I'll try to open Firefox with the 'computer' tool.",
        action: "ANTHROPIC_COMPUTER_USE",
      },
    },
  ],
];
