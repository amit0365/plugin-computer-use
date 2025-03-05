import { BaseAnthropicTool } from "./base";
import { BashTool20241022, BashTool20250124 } from "./bash"; // or if you only have the new version
import { ComputerTool20241022, ComputerTool20250124 } from "./computer";
import { EditTool20241022, EditTool20250124 } from "./edit";

/**
 * We'll define the same "ToolVersion" as in Python:
 */
export type ToolVersion = "computer_use_20241022" | "computer_use_20250124";

export type BetaFlag = "computer-use-2024-10-22" | "computer-use-2025-01-24";

/**
 * A grouping of tools for a particular version,
 * plus an optional beta flag for the API to use.
 */
export interface ToolGroup {
  version: ToolVersion;
  tools: Array<new () => BaseAnthropicTool>;
  betaFlag?: BetaFlag;
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    version: "computer_use_20241022",
    tools: [ComputerTool20241022, EditTool20241022, BashTool20241022],
    betaFlag: "computer-use-2024-10-22",
  },
  {
    version: "computer_use_20250124",
    tools: [ComputerTool20250124, EditTool20250124, BashTool20250124],
    betaFlag: "computer-use-2025-01-24",
  },
];

export const TOOL_GROUPS_BY_VERSION: Record<ToolVersion, ToolGroup> = {
  computer_use_20241022: TOOL_GROUPS[0],
  computer_use_20250124: TOOL_GROUPS[1],
};
