import { z } from 'zod';
import { readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { ScoobyToolDefinition } from '../types.js';
import { resolveSandboxedPath } from '../permissions.js';

const MAX_DEPTH = 3;
const MAX_ENTRIES = 500;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

interface Entry {
  label: string;
  size?: number;
}

async function walkDir(
  dirPath: string,
  prefix: string,
  depth: number,
  entries: Entry[],
): Promise<boolean> {
  if (depth > MAX_DEPTH || entries.length >= MAX_ENTRIES) return entries.length >= MAX_ENTRIES;

  let items;
  try {
    items = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return false;
  }

  items.sort((a, b) => a.name.localeCompare(b.name));

  for (const item of items) {
    if (entries.length >= MAX_ENTRIES) return true;

    const rel = prefix ? `${prefix}/${item.name}` : item.name;

    if (item.isDirectory()) {
      entries.push({ label: `[dir]  ${rel}/` });
      const truncated = await walkDir(resolve(dirPath, item.name), rel, depth + 1, entries);
      if (truncated) return true;
    } else {
      try {
        const s = await stat(resolve(dirPath, item.name));
        entries.push({ label: `[file] ${rel}`, size: s.size });
      } catch {
        entries.push({ label: `[file] ${rel}` });
      }
    }
  }

  return false;
}

export const fileListTool: ScoobyToolDefinition = {
  name: 'file_list',
  description:
    'List directory contents. Shows files and subdirectories with sizes. Optionally recurse up to 3 levels deep.',
  inputSchema: z.object({
    path: z
      .string()
      .optional()
      .describe('Directory to list, defaults to workspace root'),
    recursive: z
      .boolean()
      .optional()
      .describe('Recurse up to 3 levels deep (max 500 entries)'),
  }),
  async execute(input, ctx) {
    const resolved = resolveSandboxedPath(input.path ?? '.', ctx.permissions);

    try {
      const s = await stat(resolved);
      if (!s.isDirectory()) {
        return `Error: "${input.path ?? '.'}" is not a directory`;
      }
    } catch (err: any) {
      return `Error: ${err.message}`;
    }

    if (input.recursive) {
      const entries: Entry[] = [];
      const truncated = await walkDir(resolved, '', 1, entries);

      if (entries.length === 0) return '(empty)';

      const lines = entries.map((e) =>
        e.size !== undefined ? `${e.label}  (${humanSize(e.size)})` : e.label,
      );

      let result = lines.join('\n');
      result += `\n\n${entries.length} entries`;
      if (truncated) result += ` (truncated at ${MAX_ENTRIES})`;
      return result;
    }

    // Non-recursive listing
    try {
      const items = await readdir(resolved, { withFileTypes: true });
      if (items.length === 0) return '(empty)';

      items.sort((a, b) => a.name.localeCompare(b.name));

      const lines: string[] = [];
      for (const item of items) {
        if (item.isDirectory()) {
          lines.push(`[dir]  ${item.name}/`);
        } else {
          try {
            const s = await stat(resolve(resolved, item.name));
            lines.push(`[file] ${item.name}  (${humanSize(s.size)})`);
          } catch {
            lines.push(`[file] ${item.name}`);
          }
        }
      }

      return lines.join('\n') + `\n\n${items.length} entries`;
    } catch (err: any) {
      return `Error listing directory: ${err.message}`;
    }
  },
};
