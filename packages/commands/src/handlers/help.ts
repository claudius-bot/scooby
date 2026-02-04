import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';
import type { CommandRegistry } from '../registry.js';

/**
 * Create the /help command handler.
 */
export function createHelpCommand(registry: CommandRegistry): CommandDefinition {
  return {
    name: 'help',
    aliases: ['commands', '?'],
    description: 'List available commands',
    usage: '/help',
    handler: async (_args: string, ctx: CommandContext): Promise<CommandResult> => {
      const commands = registry.list();

      const lines = [
        '**Available Commands**',
        '',
        ...commands.map((cmd) => {
          const aliases = cmd.aliases?.length ? ` (${cmd.aliases.map((a) => '/' + a).join(', ')})` : '';
          return `\`/${cmd.name}\`${aliases} - ${cmd.description}`;
        }),
      ];

      const response = lines.join('\n');
      await ctx.sendReply(response, 'markdown');

      return { handled: true, response, suppressTranscript: true };
    },
  };
}
