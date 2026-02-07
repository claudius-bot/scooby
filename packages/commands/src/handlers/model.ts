import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

/**
 * Create the /model command handler.
 */
export function createModelCommand(): CommandDefinition {
  return {
    name: 'model',
    aliases: ['m'],
    description: 'Show, set, or clear model overrides',
    usage: '/model [set fast|slow <provider/model>] [clear [fast|slow]]',
    handler: async (args: string, ctx: CommandContext): Promise<CommandResult> => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const subcommand = parts[0]?.toLowerCase();

      // /model set fast|slow <provider/model>
      if (subcommand === 'set') {
        return handleSet(parts.slice(1), ctx);
      }

      // /model clear [fast|slow]
      if (subcommand === 'clear') {
        return handleClear(parts.slice(1), ctx);
      }

      // /model — show effective models
      return handleShow(ctx);
    },
  };
}

async function handleShow(ctx: CommandContext): Promise<CommandResult> {
  const { globalModels, modelOverrideStore } = ctx;
  const overrides = modelOverrideStore ? await modelOverrideStore.getWorkspaceModels() : undefined;

  const lines = ['**Current Models**', ''];

  lines.push('**Fast (default):**');
  const fastCandidates = overrides?.fast ?? globalModels.fast;
  const fastLabel = overrides?.fast ? '(override)' : '(global)';
  for (let i = 0; i < fastCandidates.length; i++) {
    const m = fastCandidates[i];
    lines.push(`  ${i + 1}. ${m.provider}/${m.model} ${fastLabel}`);
  }

  lines.push('');
  lines.push('**Slow (complex tasks):**');
  const slowCandidates = overrides?.slow ?? globalModels.slow;
  const slowLabel = overrides?.slow ? '(override)' : '(global)';
  for (let i = 0; i < slowCandidates.length; i++) {
    const m = slowCandidates[i];
    lines.push(`  ${i + 1}. ${m.provider}/${m.model} ${slowLabel}`);
  }

  const response = lines.join('\n');
  await ctx.sendReply(response, 'markdown');
  return { handled: true, response, suppressTranscript: true };
}

async function handleSet(args: string[], ctx: CommandContext): Promise<CommandResult> {
  const { modelOverrideStore } = ctx;
  if (!modelOverrideStore) {
    await ctx.sendReply('Model overrides are not available in this context.', 'text');
    return { handled: true, suppressTranscript: true };
  }

  const group = args[0]?.toLowerCase();
  if (group !== 'fast' && group !== 'slow') {
    await ctx.sendReply('Usage: `/model set fast|slow <provider/model>`', 'markdown');
    return { handled: true, suppressTranscript: true };
  }

  const modelSpec = args[1];
  if (!modelSpec || !modelSpec.includes('/')) {
    await ctx.sendReply('Usage: `/model set fast|slow <provider/model>`\nExample: `/model set fast anthropic/claude-haiku-4.5`', 'markdown');
    return { handled: true, suppressTranscript: true };
  }

  const slashIndex = modelSpec.indexOf('/');
  const provider = modelSpec.slice(0, slashIndex);
  const model = modelSpec.slice(slashIndex + 1);

  if (!provider || !model) {
    await ctx.sendReply('Invalid model format. Use `provider/model`.', 'markdown');
    return { handled: true, suppressTranscript: true };
  }

  await modelOverrideStore.setGroup(group, [{ provider, model }]);
  const response = `Set **${group}** model override to \`${provider}/${model}\``;
  await ctx.sendReply(response, 'markdown');
  return { handled: true, response, suppressTranscript: true };
}

async function handleClear(args: string[], ctx: CommandContext): Promise<CommandResult> {
  const { modelOverrideStore } = ctx;
  if (!modelOverrideStore) {
    await ctx.sendReply('Model overrides are not available in this context.', 'text');
    return { handled: true, suppressTranscript: true };
  }

  const group = args[0]?.toLowerCase();
  if (group === 'fast' || group === 'slow') {
    await modelOverrideStore.clearGroup(group);
    const response = `Cleared **${group}** model override. Reverted to global config.`;
    await ctx.sendReply(response, 'markdown');
    return { handled: true, response, suppressTranscript: true };
  }

  await modelOverrideStore.clear();
  const response = 'Cleared all model overrides. Reverted to global config.';
  await ctx.sendReply(response, 'markdown');
  return { handled: true, response, suppressTranscript: true };
}
