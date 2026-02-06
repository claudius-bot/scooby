import { z } from 'zod';
import { readdir, readFile, stat, open } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import type { ScoobyToolDefinition } from '../types.js';
import { resolveSandboxedPath } from '../permissions.js';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '__pycache__',
  '.cache',
  '.turbo',
  'coverage',
  '.output',
  'build',
]);

const MAX_FILES = 10_000;
const MAX_LINE_LENGTH = 200;

async function isBinary(filePath: string): Promise<boolean> {
  let fh;
  try {
    fh = await open(filePath, 'r');
    const buf = Buffer.alloc(512);
    const { bytesRead } = await fh.read(buf, 0, 512, 0);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } catch {
    return true;
  } finally {
    await fh?.close();
  }
}

async function collectFiles(
  dirPath: string,
  extensions: Set<string> | null,
  files: string[],
): Promise<void> {
  if (files.length >= MAX_FILES) return;

  let items;
  try {
    items = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const item of items) {
    if (files.length >= MAX_FILES) return;

    const fullPath = resolve(dirPath, item.name);

    if (item.isDirectory()) {
      if (IGNORED_DIRS.has(item.name)) continue;
      await collectFiles(fullPath, extensions, files);
    } else {
      if (extensions && !extensions.has(extname(item.name).toLowerCase())) continue;
      files.push(fullPath);
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const fileSearchTool: ScoobyToolDefinition = {
  name: 'file_search',
  description:
    'Search file contents by pattern. Returns matching lines in grep format (file:line: text). Skips node_modules, .git, dist, binary files, etc.',
  inputSchema: z.object({
    pattern: z.string().describe('Search text or regex pattern'),
    path: z
      .string()
      .optional()
      .describe('File or directory to search, defaults to workspace root'),
    include: z
      .string()
      .optional()
      .describe('Comma-separated extension filter (e.g. ".ts,.js")'),
    maxResults: z
      .number()
      .optional()
      .describe('Maximum matching lines to return (default 50)'),
    useRegex: z
      .boolean()
      .optional()
      .describe('Treat pattern as regex instead of literal text'),
  }),
  async execute(input, ctx) {
    const resolved = resolveSandboxedPath(input.path ?? '.', ctx.permissions);
    const maxResults = input.maxResults ?? 50;

    // Parse extension filter
    let extensions: Set<string> | null = null;
    if (input.include) {
      extensions = new Set(
        input.include
          .split(',')
          .map((e: string) => e.trim().toLowerCase())
          .map((e: string) => (e.startsWith('.') ? e : `.${e}`)),
      );
    }

    // Build regex
    let regex: RegExp;
    try {
      const pat = input.useRegex ? input.pattern : escapeRegex(input.pattern);
      regex = new RegExp(pat, 'gi');
    } catch (err: any) {
      return `Error: Invalid regex pattern: ${err.message}`;
    }

    // Collect files to search
    const files: string[] = [];
    try {
      const s = await stat(resolved);
      if (s.isFile()) {
        files.push(resolved);
      } else if (s.isDirectory()) {
        await collectFiles(resolved, extensions, files);
      } else {
        return `Error: "${input.path ?? '.'}" is not a file or directory`;
      }
    } catch (err: any) {
      return `Error: ${err.message}`;
    }

    // Search files
    const matches: string[] = [];
    let truncated = false;
    const basePath = ctx.permissions.workspacePath;

    for (const filePath of files) {
      if (matches.length >= maxResults) {
        truncated = true;
        break;
      }

      if (await isBinary(filePath)) continue;

      let content: string;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      const relPath = filePath.startsWith(basePath)
        ? filePath.slice(basePath.length + 1)
        : filePath;

      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= maxResults) {
          truncated = true;
          break;
        }

        // Reset regex lastIndex for each line (global flag)
        regex.lastIndex = 0;
        if (regex.test(lines[i])) {
          const line =
            lines[i].length > MAX_LINE_LENGTH
              ? lines[i].slice(0, MAX_LINE_LENGTH) + '...'
              : lines[i];
          matches.push(`${relPath}:${i + 1}: ${line}`);
        }
      }
    }

    if (matches.length === 0) {
      return `No matches found for "${input.pattern}"`;
    }

    let result = matches.join('\n');
    result += `\n\n${matches.length} matches`;
    if (truncated) result += ` (truncated at ${maxResults})`;
    return result;
  },
};
