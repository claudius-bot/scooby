import { z } from 'zod';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { ScoobyToolDefinition } from '../types.js';
import { resolveSandboxedPath } from '../permissions.js';

const execAsync = promisify(exec);

export const shellExecTool: ScoobyToolDefinition = {
  name: 'shell_exec',
  description: 'Execute a shell command and return stdout/stderr. Use for running scripts, git commands, installing packages, etc.',
  inputSchema: z.object({
    command: z.string().describe('The shell command to execute'),
    timeout: z.number().optional().default(30000).describe('Timeout in milliseconds'),
    cwd: z.string().optional().describe('Working directory for the command'),
  }),
  async execute(input, ctx) {
    const cwd = input.cwd
      ? resolveSandboxedPath(input.cwd, ctx.permissions)
      : ctx.workspace.path;
    try {
      const { stdout, stderr } = await execAsync(input.command, {
        cwd,
        timeout: input.timeout,
        maxBuffer: 1024 * 1024,
      });
      let result = '';
      if (stdout) result += stdout;
      if (stderr) result += (result ? '\n--- stderr ---\n' : '') + stderr;
      return result || '(no output)';
    } catch (err: any) {
      return `Error (exit ${err.code ?? 'unknown'}): ${err.message}\n${err.stderr || ''}`.trim();
    }
  },
};
