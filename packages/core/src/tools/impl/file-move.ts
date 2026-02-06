import { z } from 'zod';
import { rename, stat, copyFile, unlink, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import type { ScoobyToolDefinition } from '../types.js';
import { resolveSandboxedPath } from '../permissions.js';

export const fileMoveTool: ScoobyToolDefinition = {
  name: 'file_move',
  description:
    'Move or rename a file or directory. Creates destination parent directories automatically. Will not overwrite existing files.',
  inputSchema: z.object({
    source: z.string().describe('Current path of the file or directory'),
    destination: z.string().describe('New path for the file or directory'),
  }),
  async execute(input, ctx) {
    const resolvedSrc = resolveSandboxedPath(input.source, ctx.permissions);
    const resolvedDst = resolveSandboxedPath(input.destination, ctx.permissions);
    const workspaceRoot = resolve(ctx.permissions.workspacePath);

    // Block moving workspace root
    if (resolvedSrc === workspaceRoot) {
      return 'Error: Cannot move workspace root';
    }

    // Reject same-path moves
    if (resolvedSrc === resolvedDst) {
      return 'Error: Source and destination are the same path';
    }

    // Check source exists
    try {
      await stat(resolvedSrc);
    } catch {
      return `Error: Source does not exist: ${input.source}`;
    }

    // Reject if destination already exists
    try {
      await stat(resolvedDst);
      return `Error: Destination already exists: ${input.destination}`;
    } catch {
      // Good — destination doesn't exist
    }

    // Create parent directories
    await mkdir(dirname(resolvedDst), { recursive: true });

    try {
      await rename(resolvedSrc, resolvedDst);
      return `Moved: ${resolvedSrc} → ${resolvedDst}`;
    } catch (err: any) {
      // EXDEV: cross-device link — fallback to copy+delete for files
      if (err.code === 'EXDEV') {
        const s = await stat(resolvedSrc);
        if (s.isDirectory()) {
          return 'Error: Cannot move directory across devices. Use shell_exec to copy and delete.';
        }
        await copyFile(resolvedSrc, resolvedDst);
        await unlink(resolvedSrc);
        return `Moved: ${resolvedSrc} → ${resolvedDst}`;
      }
      return `Error: ${err.message}`;
    }
  },
};
