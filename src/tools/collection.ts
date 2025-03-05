import { BaseAnthropicTool, ToolResult } from "./base";

export class ToolCollection {
  private tools: Record<string, BaseAnthropicTool>;

  constructor(...toolInstances: BaseAnthropicTool[]) {
    this.tools = {};
    for (const tool of toolInstances) {
      this.tools[tool.name] = tool;
    }
  }

  toParams(): any[] {
    return Object.values(this.tools).map((t) => t.toParams());
  }

  async run(name: string, toolInput: Record<string, any>): Promise<ToolResult> {
    const tool = this.tools[name];
    if (!tool) {
      return { error: `Tool ${name} is invalid` };
    }
    try {
      return await tool.call(toolInput);
    } catch (e: any) {
      return { error: e.message };
    }
  }
}
