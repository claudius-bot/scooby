import { tool } from 'ai';
import type { ScoobyToolDefinition, ToolContext } from './types.js';
import { checkToolPermission } from './permissions.js';
import type { AgentProfile } from '../workspace/types.js';

export const UNIVERSAL_TOOLS = [
  'memory_search',
  'memory_get',
  'memory_write',
  'scratchpad_read',
  'scratchpad_write',
  'send_message',
  'agent_switch',
  'web_search',
];

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
        inputSchema: def.inputSchema,
        execute: async (input) => def.execute(input, ctx),
      });
    }
    return result;
  }

  /**
   * Filter tools by workspace permissions AND agent's allowedTools list.
   * Always includes universal tools if agent.universalTools !== false.
   */
  toAiSdkToolsForAgent(ctx: ToolContext, agent: AgentProfile): Record<string, any> {
    // If agent has no allowedTools defined, fall back to standard filtering
    if (!agent.allowedTools) {
      return this.toAiSdkTools(ctx);
    }

    const agentToolSet = new Set(agent.allowedTools);
    const includeUniversal = agent.universalTools !== false;

    const result: Record<string, any> = {};
    for (const [name, def] of this.tools) {
      // Check workspace-level permissions first
      if (!checkToolPermission(name, ctx.permissions)) continue;

      // Check if tool is in agent's allowed list or universal
      const isAllowed = agentToolSet.has(name) || (includeUniversal && UNIVERSAL_TOOLS.includes(name));
      if (!isAllowed) continue;

      result[name] = tool({
        description: def.description,
        inputSchema: def.inputSchema,
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
