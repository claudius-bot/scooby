import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, normalize } from 'node:path';
import type { ScoobyToolDefinition } from '../types.js';

function getTodayFilename(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}.md`;
}

function isAllowedPath(path: string): boolean {
  const normalized = normalize(path);
  if (normalized.includes('..')) return false;
  if (normalized === 'MEMORY.md') return true;
  if (normalized.startsWith('memory/') || normalized.startsWith('memory\\')) return true;
  return false;
}

export const memoryWriteTool: ScoobyToolDefinition = {
  name: 'memory_write',
  description:
    'Write to a memory file with automatic re-indexing. Defaults to appending to today\'s daily log (memory/YYYY-MM-DD.md). Use mode "overwrite" for MEMORY.md curation.',
  inputSchema: z.object({
    content: z.string().describe('Text to write'),
    path: z
      .string()
      .optional()
      .describe(
        'Relative path (e.g., "memory/2026-02-06.md" or "MEMORY.md"). Defaults to today\'s daily log.'
      ),
    mode: z
      .enum(['append', 'overwrite'])
      .optional()
      .default('append')
      .describe('Write mode: "append" (default) adds to file, "overwrite" replaces it'),
  }),
  async execute(input, ctx) {
    const filePath = input.path ?? `memory/${getTodayFilename()}`;

    if (!isAllowedPath(filePath)) {
      return 'Error: Path must be under memory/ or be MEMORY.md. Path traversal is not allowed.';
    }

    const fullPath = join(ctx.workspace.path, filePath);

    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });

    if (input.mode === 'overwrite') {
      await writeFile(fullPath, input.content, 'utf-8');
    } else {
      // Append mode: prepend timestamp header
      const header = `\n\n## ${new Date().toISOString()}\n\n`;
      let existing = '';
      try {
        existing = await readFile(fullPath, 'utf-8');
      } catch {
        // File doesn't exist yet — that's fine
      }
      await writeFile(fullPath, existing + header + input.content, 'utf-8');
    }

    // Re-index the file for immediate searchability
    const indexer = ctx.memoryProvider ?? ctx.memoryService;
    if (indexer) {
      try {
        const fullContent = await readFile(fullPath, 'utf-8');
        await indexer.index(ctx.workspace.id, filePath, fullContent);
      } catch (err: any) {
        return `Written to ${filePath} but re-indexing failed: ${err.message}`;
      }
    }

    return `Written to ${filePath} (${input.mode ?? 'append'} mode).`;
  },
};
