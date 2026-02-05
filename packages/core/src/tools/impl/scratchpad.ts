import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { ScoobyToolDefinition } from '../types.js';

/**
 * Safely read the scratchpad file.
 */
async function readScratchpad(workspacePath: string): Promise<string> {
  try {
    return await readFile(join(workspacePath, 'SCRATCHPAD.md'), 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Write to the scratchpad file.
 */
async function writeScratchpad(workspacePath: string, content: string): Promise<void> {
  const filePath = join(workspacePath, 'SCRATCHPAD.md');
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}

export const scratchpadReadTool: ScoobyToolDefinition = {
  name: 'scratchpad_read',
  description: 'Read the current contents of your scratchpad. The scratchpad is for short-term notes that persist across sessions.',
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const content = await readScratchpad(ctx.workspace.path);
    if (!content.trim()) {
      return 'Scratchpad is empty.';
    }
    return content;
  },
};

export const scratchpadWriteTool: ScoobyToolDefinition = {
  name: 'scratchpad_write',
  description: 'Overwrite your scratchpad with new content. Use this to keep temporary notes, track ongoing tasks, or remember things for later. Clear items when they are no longer needed.',
  inputSchema: z.object({
    content: z.string().describe('The new content for the scratchpad. Pass an empty string to clear it.'),
  }),
  async execute(input, ctx) {
    await writeScratchpad(ctx.workspace.path, input.content);
    if (!input.content.trim()) {
      return 'Scratchpad cleared.';
    }
    return 'Scratchpad updated.';
  },
};
