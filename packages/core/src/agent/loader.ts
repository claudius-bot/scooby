import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { AgentDefinitionSchema } from '@scooby/schemas';
import type { AgentProfile } from '../workspace/types.js';

async function safeRead(filePath: string, fallback = ''): Promise<string> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }
    throw err;
  }
}

/**
 * Load all agent definitions from the agents directory.
 * Each subdirectory must contain an agent.json file.
 */
export async function loadAgentDefinitions(agentsDir: string): Promise<Map<string, AgentProfile>> {
  const agents = new Map<string, AgentProfile>();

  let entries: string[];
  try {
    entries = await readdir(agentsDir);
  } catch {
    console.warn(`[AgentLoader] Agents directory not found: ${agentsDir}`);
    return agents;
  }

  for (const entry of entries) {
    const agentDir = join(agentsDir, entry);
    const stats = await stat(agentDir).catch(() => null);
    if (!stats?.isDirectory()) continue;

    const jsonPath = join(agentDir, 'agent.json');
    const jsonRaw = await safeRead(jsonPath);
    if (!jsonRaw) {
      console.warn(`[AgentLoader] No agent.json in ${agentDir}, skipping`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonRaw);
    } catch {
      console.warn(`[AgentLoader] Invalid JSON in ${jsonPath}, skipping`);
      continue;
    }

    const result = AgentDefinitionSchema.safeParse(parsed);
    if (!result.success) {
      console.warn(`[AgentLoader] Invalid agent definition in ${jsonPath}:`, result.error.format());
      continue;
    }

    const def = result.data;

    // Load markdown files in parallel
    const [identity, soul, tools, scratchpad] = await Promise.all([
      safeRead(join(agentDir, 'IDENTITY.md')),
      safeRead(join(agentDir, 'SOUL.md')),
      safeRead(join(agentDir, 'TOOLS.md')),
      safeRead(join(agentDir, 'SCRATCHPAD.md')),
    ]);

    const profile: AgentProfile = {
      name: def.name,
      vibe: '',
      emoji: def.emoji,
      avatar: def.avatar,
      soul,
      identity,
      tools,
      configured: true,
      scratchpad,
      heartbeatChecklist: '',
      id: def.id,
      about: def.about,
      modelRef: def.model,
      fallbackModelRef: def.fallbackModel,
      allowedTools: def.tools,
      universalTools: def.universal,
      skillNames: def.skills,
    };

    agents.set(def.id, profile);
  }

  return agents;
}
