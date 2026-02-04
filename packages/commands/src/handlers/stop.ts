import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

/**
 * Create the /stop command handler.
 */
export function createStopCommand(): CommandDefinition {
  return {
    name: 'stop',
    aliases: ['cancel', 'abort'],
    description: 'Stop running agent',
    usage: '/stop',
    handler: async (_args: string, ctx: CommandContext): Promise<CommandResult> => {
      if (!ctx.stopRunningAgent) {
        const response = 'Stop functionality not available.';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      const stopped = ctx.stopRunningAgent();

      if (stopped) {
        const response = 'Stopped the running agent.';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      } else {
        const response = 'No agent is currently running.';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }
    },
  };
}
