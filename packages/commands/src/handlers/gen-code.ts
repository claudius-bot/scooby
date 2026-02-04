import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

/**
 * Create the /gen-code command handler.
 */
export function createGenCodeCommand(): CommandDefinition {
  return {
    name: 'gen-code',
    aliases: ['code', 'invite'],
    description: 'Generate a code to connect a new channel',
    usage: '/gen-code',
    handler: async (_args: string, ctx: CommandContext): Promise<CommandResult> => {
      if (!ctx.generateWorkspaceCode) {
        const response = 'Code generation not available.';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      const code = ctx.generateWorkspaceCode();

      const lines = [
        '**Workspace Join Code**',
        '',
        `\`${code}\``,
        '',
        'Send this code from a new channel to connect it to this workspace.',
        'The code expires in 10 minutes.',
      ];

      const response = lines.join('\n');
      await ctx.sendReply(response, 'markdown');

      return { handled: true, response, suppressTranscript: true };
    },
  };
}
