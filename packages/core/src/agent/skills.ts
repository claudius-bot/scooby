import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { SkillDefinition } from './prompt-builder.js';

export async function loadSkills(workspacePath: string): Promise<SkillDefinition[]> {
  const agentsDir = join(workspacePath, 'skills');
  const skills: SkillDefinition[] = [];

  try {
    const entries = await readdir(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = join(agentsDir, entry.name, 'SKILL.md');
      try {
        const raw = await readFile(skillPath, 'utf-8');
        const { data, content } = matter(raw);
        skills.push({
          name: data.name || entry.name,
          description: data.description || '',
          instructions: content.trim(),
          always: data.always ?? false,
          modelGroup: data.modelGroup,
        });
      } catch {
        // Skip skills that can't be loaded
      }
    }
  } catch {
    // No skills directory, return empty
  }

  return skills;
}

export { type SkillDefinition } from './prompt-builder.js';
