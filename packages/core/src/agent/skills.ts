import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import matter from 'gray-matter';
import type { SkillDefinition } from './prompt-builder.js';

export interface LoadSkillsOptions {
  workspacePath: string;
  globalSkillsDir?: string;
  skillEntries?: Record<string, { apiKey?: string; env?: Record<string, string> }>;
}

/**
 * Load skills from a single directory into a Map keyed by skill name.
 */
async function loadSkillsFromDir(dir: string): Promise<Map<string, SkillDefinition>> {
  const skills = new Map<string, SkillDefinition>();

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = join(dir, entry.name, 'SKILL.md');
      try {
        const raw = await readFile(skillPath, 'utf-8');
        const { data, content } = matter(raw);

        // Parse metadata — may be a JSON string or an object
        let metadata: Record<string, unknown> | undefined;
        if (data.metadata) {
          if (typeof data.metadata === 'string') {
            try { metadata = JSON.parse(data.metadata); } catch { /* ignore */ }
          } else if (typeof data.metadata === 'object') {
            metadata = data.metadata as Record<string, unknown>;
          }
        }

        skills.set(data.name || entry.name, {
          name: data.name || entry.name,
          description: data.description || '',
          instructions: content.trim(),
          always: data.always ?? false,
          modelGroup: data.modelGroup,
          metadata,
        });
      } catch {
        // SKILL.md not found or unreadable — skip
      }
    }
  } catch {
    // Directory doesn't exist — return empty
  }

  return skills;
}

/**
 * Load skills from global (~/.agents/skills/) and workspace directories,
 * with env gating and API key injection from config entries.
 *
 * Accepts either a string (backward-compat workspace path) or LoadSkillsOptions.
 */
export async function loadSkills(optionsOrPath: string | LoadSkillsOptions): Promise<SkillDefinition[]> {
  const options: LoadSkillsOptions = typeof optionsOrPath === 'string'
    ? { workspacePath: optionsOrPath }
    : optionsOrPath;

  const globalDir = options.globalSkillsDir ?? join(homedir(), '.agents', 'skills');
  const workspaceDir = join(options.workspacePath, 'skills');
  const entries = options.skillEntries ?? {};

  // 1. Load global skills, then overlay workspace skills (workspace wins by name)
  const globalSkills = await loadSkillsFromDir(globalDir);
  const workspaceSkills = await loadSkillsFromDir(workspaceDir);

  const merged = new Map<string, SkillDefinition>(globalSkills);
  for (const [name, skill] of workspaceSkills) {
    merged.set(name, skill);
  }

  // 2. Inject env vars and API keys, then gate
  const result: SkillDefinition[] = [];

  for (const [name, skill] of merged) {
    const entry = entries[name];

    // Inject primaryEnv API key from config
    if (entry?.apiKey && skill.metadata) {
      const primaryEnv = (skill.metadata as any).openclaw?.primaryEnv
        ?? (skill.metadata as any).primaryEnv;
      if (typeof primaryEnv === 'string' && !process.env[primaryEnv]) {
        process.env[primaryEnv] = entry.apiKey;
      }
    }

    // Inject additional env vars from config (only if not already set)
    if (entry?.env) {
      for (const [key, value] of Object.entries(entry.env)) {
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }

    // Env gating: skip if metadata.openclaw.requires.env lists vars not in process.env
    const requires = (skill.metadata as any)?.openclaw?.requires;
    if (requires?.env && Array.isArray(requires.env)) {
      const missing = (requires.env as string[]).filter(v => !process.env[v]);
      if (missing.length > 0) {
        continue;
      }
    }

    result.push(skill);
  }

  return result;
}

export { type SkillDefinition } from './prompt-builder.js';
