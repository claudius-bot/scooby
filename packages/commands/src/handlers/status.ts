import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

/**
 * Create the /status command handler.
 */
export function createStatusCommand(): CommandDefinition {
  return {
    name: 'status',
    description: 'Show session, workspace, and model info',
    usage: '/status',
    handler: async (_args: string, ctx: CommandContext): Promise<CommandResult> => {
      const { workspace, session, globalModels } = ctx;

      // Get current model info
      const fastModel = globalModels.fast[0];
      const slowModel = globalModels.slow[0];

      const lines = [
        '**Status**',
        '',
        `**Workspace:** ${workspace.id}`,
        `**Agent:** ${workspace.agent.emoji} ${workspace.agent.name}`,
        `**Vibe:** ${workspace.agent.vibe}`,
        '',
        `**Session ID:** \`${session.id.slice(0, 8)}...\``,
        `**Channel:** ${session.channelType}`,
        `**Messages:** ${session.messageCount}`,
        `**Status:** ${session.status}`,
        `**Created:** ${formatTime(session.createdAt)}`,
        `**Last Active:** ${formatTime(session.lastActiveAt)}`,
        '',
        '**Models:**',
        `  Fast: ${fastModel ? `${fastModel.provider}/${fastModel.model}` : 'none'}`,
        `  Slow: ${slowModel ? `${slowModel.provider}/${slowModel.model}` : 'none'}`,
      ];

      const response = lines.join('\n');
      await ctx.sendReply(response, 'markdown');

      return { handled: true, response, suppressTranscript: true };
    },
  };
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
