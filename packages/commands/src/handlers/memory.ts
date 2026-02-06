import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

/**
 * Create the /memory command handler.
 */
export function createMemoryCommand(): CommandDefinition {
  return {
    name: 'memory',
    aliases: ['mem'],
    description: 'Search, add, or clear memory entries',
    usage: '/memory <search|add|clear> [args]',
    handler: async (args: string, ctx: CommandContext): Promise<CommandResult> => {
      const trimmed = args.trim();
      const spaceIdx = trimmed.indexOf(' ');
      const subcommand = spaceIdx === -1 ? trimmed.toLowerCase() : trimmed.slice(0, spaceIdx).toLowerCase();
      const subArgs = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

      switch (subcommand) {
        case 'search':
          return handleSearch(subArgs, ctx);
        case 'add':
          return handleAdd(subArgs, ctx);
        case 'clear':
          return handleClear(ctx);
        default:
          return handleHelp(ctx);
      }
    },
  };
}

async function handleSearch(query: string, ctx: CommandContext): Promise<CommandResult> {
  if (!ctx.searchMemory) {
    await ctx.sendReply('Memory is not configured for this workspace.', 'text');
    return { handled: true, suppressTranscript: true };
  }

  if (!query) {
    await ctx.sendReply('Usage: `/memory search <query>`', 'markdown');
    return { handled: true, suppressTranscript: true };
  }

  const results = await ctx.searchMemory(query);

  if (results.length === 0) {
    await ctx.sendReply('No memory results found.', 'text');
    return { handled: true, suppressTranscript: true };
  }

  const lines = ['**Memory Search Results**', ''];
  for (const r of results) {
    const truncated = r.content.length > 200 ? r.content.slice(0, 200) + '...' : r.content;
    lines.push(`**${r.source}** (score: ${r.score.toFixed(2)})`);
    lines.push(truncated);
    lines.push('');
  }

  await ctx.sendReply(lines.join('\n'), 'markdown');
  return { handled: true, suppressTranscript: true };
}

async function handleAdd(text: string, ctx: CommandContext): Promise<CommandResult> {
  if (!ctx.addMemory) {
    await ctx.sendReply('Memory is not configured for this workspace.', 'text');
    return { handled: true, suppressTranscript: true };
  }

  if (!text) {
    await ctx.sendReply('Usage: `/memory add <text>`', 'markdown');
    return { handled: true, suppressTranscript: true };
  }

  const chunkCount = await ctx.addMemory(text);
  await ctx.sendReply(`Added to memory (${chunkCount} chunk${chunkCount !== 1 ? 's' : ''}).`, 'text');
  return { handled: true, suppressTranscript: true };
}

async function handleClear(ctx: CommandContext): Promise<CommandResult> {
  if (!ctx.clearMemory) {
    await ctx.sendReply('Memory is not configured for this workspace.', 'text');
    return { handled: true, suppressTranscript: true };
  }

  await ctx.clearMemory();
  await ctx.sendReply('User memory notes cleared.', 'text');
  return { handled: true, suppressTranscript: true };
}

async function handleHelp(ctx: CommandContext): Promise<CommandResult> {
  const lines = [
    '**Memory Commands**',
    '',
    '`/memory search <query>` — Search memory for relevant entries',
    '`/memory add <text>` — Add a note to memory',
    '`/memory clear` — Clear all user-added notes',
  ];

  await ctx.sendReply(lines.join('\n'), 'markdown');
  return { handled: true, suppressTranscript: true };
}
