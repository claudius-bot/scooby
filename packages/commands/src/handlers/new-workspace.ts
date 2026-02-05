import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

/**
 * Create the /new-workspace command handler.
 */
export function createNewWorkspaceCommand(): CommandDefinition {
  return {
    name: 'new-workspace',
    aliases: ['create-workspace'],
    description: 'Create a new workspace',
    usage: '/new-workspace <name> [--description "..."]',
    handler: async (args: string, ctx: CommandContext): Promise<CommandResult> => {
      if (!ctx.createWorkspace) {
        const response = 'Workspace creation not available.';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      // Parse --description or -d flag (supports double quotes, single quotes, and = syntax)
      const descMatch = args.match(/(?:--description|-d)(?:=|\s+)(["'])(.+?)\1/);
      const description = descMatch ? descMatch[2] : undefined;

      // Extract name by removing the flag and its value from the args
      const name = descMatch
        ? args.replace(descMatch[0], '').trim()
        : args.trim();

      if (!name) {
        const response = 'Please provide a name for the workspace.\n\nUsage: `/new-workspace <name> [--description "..."]`';
        await ctx.sendReply(response, 'markdown');
        return { handled: true, response, suppressTranscript: true };
      }

      // Validate name
      if (name.length < 2 || name.length > 50) {
        const response = 'Workspace name must be between 2 and 50 characters.';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      try {
        const { workspaceId, code } = await ctx.createWorkspace(name, { description });

        const lines = [
          `**Workspace Created: ${name}**`,
          '',
          `Workspace ID: \`${workspaceId}\``,
          '',
          '**Join Code:**',
          `\`${code}\``,
          '',
          'Send this code from another channel to connect it to this workspace.',
          'The code expires in 10 minutes.',
          '',
          '_Note: Your current channel is not automatically connected to this workspace._',
        ];

        const response = lines.join('\n');
        await ctx.sendReply(response, 'markdown');
        return { handled: true, response, suppressTranscript: true };
      } catch (err) {
        const response = `Failed to create workspace: ${err instanceof Error ? err.message : String(err)}`;
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }
    },
  };
}
