import { z } from 'zod';
import { readFile, writeFile } from 'node:fs/promises';
import type { ScoobyToolDefinition } from '../types.js';
import { resolveSandboxedPath } from '../permissions.js';

export const fileEditTool: ScoobyToolDefinition = {
  name: 'file_edit',
  description: 'Edit a file by searching for a string and replacing it. The search string must match exactly.',
  inputSchema: z.object({
    path: z.string().describe('Path to the file to edit'),
    search: z.string().describe('Exact string to search for in the file'),
    replace: z.string().describe('String to replace the search match with'),
  }),
  async execute(input, ctx) {
    const resolved = resolveSandboxedPath(input.path, ctx.permissions);
    try {
      const content = await readFile(resolved, 'utf-8');
      if (!content.includes(input.search)) {
        return `Error: Search string not found in file`;
      }
      const updated = content.replace(input.search, input.replace);
      await writeFile(resolved, updated, 'utf-8');
      return `File edited: ${resolved}`;
    } catch (err: any) {
      return `Error editing file: ${err.message}`;
    }
  },
};
