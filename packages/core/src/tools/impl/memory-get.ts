import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import type { ScoobyToolDefinition } from '../types.js';

function isAllowedPath(path: string): boolean {
  const normalized = normalize(path);
  if (normalized.includes('..')) return false;
  if (normalized === 'MEMORY.md') return true;
  if (normalized.startsWith('memory/') || normalized.startsWith('memory\\')) return true;
  if (normalized.startsWith('qmd/')) return true;
  return false;
}

export const memoryGetTool: ScoobyToolDefinition = {
  name: 'memory_get',
  description:
    'Read a memory file. Files must be under the memory/ directory or be MEMORY.md. Use this to review daily logs or long-term memory.',
  inputSchema: z.object({
    path: z
      .string()
      .describe(
        'Relative path to the memory file (e.g., "memory/2026-02-06.md" or "MEMORY.md")'
      ),
    startLine: z
      .number()
      .optional()
      .describe('Line number to start reading from (1-based)'),
    lines: z
      .number()
      .optional()
      .describe('Number of lines to read. Omit to read the entire file.'),
  }),
  async execute(input, ctx) {
    if (!isAllowedPath(input.path)) {
      return 'Error: Path must be under memory/, qmd/, or be MEMORY.md. Path traversal is not allowed.';
    }

    // Handle QMD paths via provider
    if (input.path.startsWith('qmd/') && ctx.memoryProvider?.readFile) {
      const content = await ctx.memoryProvider.readFile(input.path, ctx.workspace.path);
      if (content === null) return `File not found: ${input.path}`;

      if (input.startLine !== undefined || input.lines !== undefined) {
        const allLines = content.split('\n');
        const start = (input.startLine ?? 1) - 1;
        const count = input.lines ?? allLines.length - start;
        const slice = allLines.slice(start, start + count);
        return slice.join('\n') || '(empty range)';
      }

      return content || '(empty file)';
    }

    const fullPath = join(ctx.workspace.path, input.path);

    try {
      const content = await readFile(fullPath, 'utf-8');

      if (input.startLine !== undefined || input.lines !== undefined) {
        const allLines = content.split('\n');
        const start = (input.startLine ?? 1) - 1; // convert to 0-based
        const count = input.lines ?? allLines.length - start;
        const slice = allLines.slice(start, start + count);
        return slice.join('\n') || '(empty range)';
      }

      return content || '(empty file)';
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return `File not found: ${input.path}`;
      }
      return `Error reading file: ${err.message}`;
    }
  },
};
