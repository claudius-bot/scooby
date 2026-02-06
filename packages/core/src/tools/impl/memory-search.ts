import { z } from 'zod';
import type { ScoobyToolDefinition } from '../types.js';

export const memorySearchTool: ScoobyToolDefinition = {
  name: 'memory_search',
  description: 'Search the workspace memory for relevant information. Returns matching text chunks from indexed documents.',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    limit: z.number().optional().default(6).describe('Maximum number of results'),
  }),
  async execute(input, ctx) {
    // Prefer the new provider interface
    const provider = ctx.memoryProvider;
    if (provider) {
      const results = await provider.search(ctx.workspace.id, input.query, input.limit);
      if (results.length === 0) return 'No relevant memory found.';
      return results.map(r => {
        let text = `[${r.source}] (score: ${r.score.toFixed(2)})\n${r.content}`;
        if (ctx.citationsEnabled && r.citation) {
          const loc = r.citation.startLine ? `#${r.citation.startLine}` : '';
          text += `\nSource: ${r.citation.path}${loc}`;
        }
        return text;
      }).join('\n\n---\n\n');
    }

    // Fallback to legacy memoryService
    if (ctx.memoryService) {
      const results = await ctx.memoryService.search(ctx.workspace.id, input.query, input.limit);
      if (results.length === 0) return 'No relevant memory found.';
      return results
        .map(r => `[${r.chunk.source}] (score: ${r.score.toFixed(2)})\n${r.chunk.content}`)
        .join('\n\n---\n\n');
    }

    return 'Memory search is not available in this workspace.';
  },
};
