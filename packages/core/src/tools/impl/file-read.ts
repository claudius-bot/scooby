import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import type { ScoobyToolDefinition } from '../types.js';
import { resolveSandboxedPath } from '../permissions.js';

export const fileReadTool: ScoobyToolDefinition = {
  name: 'file_read',
  description: 'Read the contents of a file. Optionally specify line range.',
  inputSchema: z.object({
    path: z.string().describe('Path to the file to read'),
    startLine: z.number().optional().describe('Starting line number (1-based)'),
    endLine: z.number().optional().describe('Ending line number (inclusive)'),
  }),
  async execute(input, ctx) {
    const resolved = resolveSandboxedPath(input.path, ctx.permissions);
    try {
      const content = await readFile(resolved, 'utf-8');
      if (input.startLine || input.endLine) {
        const lines = content.split('\n');
        const start = (input.startLine ?? 1) - 1;
        const end = input.endLine ?? lines.length;
        return lines.slice(start, end).join('\n');
      }
      return content;
    } catch (err: any) {
      return `Error reading file: ${err.message}`;
    }
  },
};
