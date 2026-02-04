import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

/**
 * Create the /model command handler.
 */
export function createModelCommand(): CommandDefinition {
  return {
    name: 'model',
    aliases: ['m'],
    description: 'Show or switch models',
    usage: '/model [name]',
    handler: async (args: string, ctx: CommandContext): Promise<CommandResult> => {
      const { globalModels } = ctx;

      // For now, just display current models (switching can be added later)
      if (args) {
        const response = 'Model switching is not yet implemented. Showing current models:';
        await ctx.sendReply(response, 'text');
      }

      const lines = [
        '**Current Models**',
        '',
        '**Fast (default):**',
        ...globalModels.fast.map((m, i) => `  ${i + 1}. ${m.provider}/${m.model}`),
        '',
        '**Slow (complex tasks):**',
        ...globalModels.slow.map((m, i) => `  ${i + 1}. ${m.provider}/${m.model}`),
      ];

      const response = lines.join('\n');
      await ctx.sendReply(response, 'markdown');

      return { handled: true, response, suppressTranscript: true };
    },
  };
}
