import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

/**
 * Create the /reset command handler.
 */
export function createResetCommand(): CommandDefinition {
  return {
    name: 'reset',
    aliases: ['new', 'clear'],
    description: 'Clear session and start fresh',
    usage: '/reset',
    handler: async (_args: string, ctx: CommandContext): Promise<CommandResult> => {
      const { session, sessionManager, workspace } = ctx;

      // Archive the current session
      await sessionManager.archiveSession(session.id);

      const response = `Session cleared. Starting fresh with ${workspace.agent.emoji} ${workspace.agent.name}.`;
      await ctx.sendReply(response, 'text');

      return {
        handled: true,
        response,
        suppressTranscript: true,
        sessionReset: true,
      };
    },
  };
}
