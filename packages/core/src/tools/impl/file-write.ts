import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ScoobyToolDefinition } from '../types.js';
import { resolveSandboxedPath } from '../permissions.js';

export const fileWriteTool: ScoobyToolDefinition = {
  name: 'file_write',
  description: 'Write content to a file. Creates directories as needed.',
  inputSchema: z.object({
    path: z.string().describe('Path to the file to write'),
    content: z.string().describe('Content to write to the file'),
  }),
  async execute(input, ctx) {
    const resolved = resolveSandboxedPath(input.path, ctx.permissions);
    try {
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, input.content, 'utf-8');
      return `File written: ${resolved}`;
    } catch (err: any) {
      return `Error writing file: ${err.message}`;
    }
  },
};
