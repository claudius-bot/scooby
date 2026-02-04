import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

/**
 * Create the /usage command handler.
 */
export function createUsageCommand(): CommandDefinition {
  return {
    name: 'usage',
    aliases: ['stats', 'tokens'],
    description: 'Show token usage summary',
    usage: '/usage [days]',
    handler: async (args: string, ctx: CommandContext): Promise<CommandResult> => {
      if (!ctx.getUsageSummary) {
        const response = 'Usage tracking not available.';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      // Parse days argument (default 30)
      const days = args ? parseInt(args, 10) : 30;
      if (isNaN(days) || days < 1 || days > 365) {
        const response = 'Invalid days argument. Use a number between 1 and 365.';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      const summary = await ctx.getUsageSummary(days);

      const lines = [
        `**Usage Summary (${days} days)**`,
        '',
        '**Totals:**',
        `  Requests: ${summary.totals.requests.toLocaleString()}`,
        `  Tokens: ${summary.totals.tokens.total.toLocaleString()} (${summary.totals.tokens.input.toLocaleString()} in / ${summary.totals.tokens.output.toLocaleString()} out)`,
        `  Cost: $${summary.totals.cost.total.toFixed(4)}`,
        '',
      ];

      // Add by-model breakdown if there are multiple models
      const models = Object.keys(summary.byModel);
      if (models.length > 0) {
        lines.push('**By Model:**');
        for (const model of models.slice(0, 5)) {
          const data = summary.byModel[model];
          lines.push(`  ${model}: ${data.requests} requests, ${data.tokens.total.toLocaleString()} tokens, $${data.cost.total.toFixed(4)}`);
        }
        if (models.length > 5) {
          lines.push(`  ... and ${models.length - 5} more`);
        }
      }

      const response = lines.join('\n');
      await ctx.sendReply(response, 'markdown');

      return { handled: true, response, suppressTranscript: true };
    },
  };
}
