import { Plugin } from "@elizaos/core";
import { computerUseAction } from "./actions/runComputerUse";

export const anthropicComputerUsePlugin: Plugin = {
  name: "anthropic-computer-use",
  description: "Fully-featured plugin that replicates the loop.py logic for local computer usage.",
  actions: [computerUseAction],
  evaluators: [],
  providers: [],
};

export default anthropicComputerUsePlugin;
