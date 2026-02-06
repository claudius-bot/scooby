import { z } from 'zod';
import { unlink, rmdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ScoobyToolDefinition } from '../types.js';
import { resolveSandboxedPath } from '../permissions.js';

export const fileDeleteTool: ScoobyToolDefinition = {
  name: 'file_delete',
  description:
    'Delete a single file or empty directory. Does not support recursive deletion — use shell_exec for that.',
  inputSchema: z.object({
    path: z.string().describe('Path to the file or empty directory to delete'),
  }),
  async execute(input, ctx) {
    const resolved = resolveSandboxedPath(input.path, ctx.permissions);

    // Block deletion of workspace root
    if (resolved === resolve(ctx.permissions.workspacePath)) {
      return 'Error: Cannot delete workspace root';
    }

    try {
      const s = await stat(resolved);

      if (s.isDirectory()) {
        await rmdir(resolved);
        return `Deleted directory: ${resolved}`;
      }

      await unlink(resolved);
      return `Deleted file: ${resolved}`;
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};
