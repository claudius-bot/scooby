import { z } from 'zod';
import type { ScoobyToolDefinition } from '../types.js';

export const memorySearchTool: ScoobyToolDefinition = {
  name: 'memory_search',
  description: 'Search the workspace memory for relevant information. Returns matching text chunks from indexed documents.',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    limit: z.number().optional().default(6).describe('Maximum number of results'),
  }),
  async execute(input, _ctx) {
    // Memory search is wired up during application bootstrap
    // The actual implementation delegates to MemoryService
    return 'Memory search not yet initialized';
  },
};
