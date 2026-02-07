import { z } from 'zod';
import type { ScoobyToolDefinition } from '../types.js';

const inputSchema = z.object({
  targetAgentId: z.string().describe('The ID of the agent to switch to'),
  reason: z.string().describe('Brief reason for the switch'),
});

export const agentSwitchTool: ScoobyToolDefinition = {
  name: 'agent_switch',
  description:
    'Hand off the conversation to a different agent who is better suited for the request. ' +
    'The switch takes effect on the next message — the current response completes normally.',
  inputSchema,
  async execute(input, ctx) {
    const { targetAgentId, reason } = input;

    if (!ctx.agentRegistry) {
      return 'Agent switching is not available.';
    }

    const target = ctx.agentRegistry.get(targetAgentId);
    if (!target) {
      const available = ctx.agentRegistry.list().map(a => `${a.emoji} ${a.id ?? a.name}`).join(', ');
      return `Unknown agent "${targetAgentId}". Available agents: ${available}`;
    }

    if (!ctx.setSessionAgent) {
      return 'Agent switching is not available for this session.';
    }

    await ctx.setSessionAgent(targetAgentId);
    return `Switching to ${target.emoji} ${target.name}. Reason: ${reason}. The switch takes effect on the next message.`;
  },
};
