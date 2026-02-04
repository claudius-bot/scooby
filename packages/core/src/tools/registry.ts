import { tool } from 'ai';
import type { ScoobyToolDefinition, ToolContext } from './types.js';
import { checkToolPermission } from './permissions.js';

export class ToolRegistry {
  private tools = new Map<string, ScoobyToolDefinition>();

  register(toolDef: ScoobyToolDefinition): void {
    this.tools.set(toolDef.name, toolDef);
  }

  get(name: string): ScoobyToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ScoobyToolDefinition[] {
    return Array.from(this.tools.values());
  }

  // Filter tools by workspace permissions and convert to AI SDK format
  toAiSdkTools(ctx: ToolContext): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name, def] of this.tools) {
      if (!checkToolPermission(name, ctx.permissions)) continue;
      result[name] = tool({
        description: def.description,
        parameters: def.inputSchema,
        execute: async (input) => def.execute(input, ctx),
      });
    }
    return result;
  }

  // Get tools that request a specific model group
  getToolsRequestingGroup(group: 'fast' | 'slow'): string[] {
    return Array.from(this.tools.values())
      .filter(t => t.modelGroup === group)
      .map(t => t.name);
  }
}
