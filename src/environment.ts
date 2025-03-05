import { IAgentRuntime } from "@elizaos/core";
import { z } from "zod";

export const anthropicEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "Anthropic API key is required"),
});

export type AnthropicConfig = z.infer<typeof anthropicEnvSchema>;

export async function validateAnthropicConfig(
  runtime: IAgentRuntime
): Promise<AnthropicConfig> {
  try {
    const config = {
      ANTHROPIC_API_KEY: runtime.getSetting("ANTHROPIC_API_KEY"),
    };
    return anthropicEnvSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join("\n");
      throw new Error(
        `Anthropic plugin config validation failed:\n${errorMessages}`
      );
    }
    throw error;
  }
}
