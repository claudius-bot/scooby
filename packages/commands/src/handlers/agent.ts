import type { CommandDefinition } from '../types.js';

export function createAgentCommand(): CommandDefinition {
  return {
    name: 'agent',
    description: 'List or switch agents',
    usage: '/agent [name|id]',
    handler: async (args, ctx) => {
      if (!ctx.agentRegistry) {
        await ctx.sendReply('Agent system not available.', 'text');
        return { handled: true };
      }

      const trimmed = args.trim();

      // No args: list all agents
      if (!trimmed) {
        const agents = ctx.agentRegistry.list();
        const lines = agents.map(a => {
          const isCurrent = a.id === ctx.currentAgentId;
          const marker = isCurrent ? ' (current)' : '';
          return `${a.emoji} **${a.name}**${marker} — ${a.about ?? ''}`;
        });
        await ctx.sendReply(lines.join('\n'), 'markdown');
        return { handled: true };
      }

      // Switch to specific agent
      const match = ctx.agentRegistry.findByName(trimmed);
      if (!match) {
        await ctx.sendReply(`Unknown agent "${trimmed}". Use /agent to list available agents.`, 'text');
        return { handled: true };
      }

      const [agentId, agent] = match;

      if (ctx.setSessionAgent) {
        await ctx.setSessionAgent(agentId);
        await ctx.sendReply(`Switched to ${agent.emoji} **${agent.name}**.`, 'markdown');
      } else {
        await ctx.sendReply('Agent switching not available for this session.', 'text');
      }

      return { handled: true };
    },
  };
}
