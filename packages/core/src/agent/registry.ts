import type { AgentProfile } from '../workspace/types.js';
import type { AgentRegistryRef } from '../tools/types.js';

/**
 * Registry of all loaded standalone agents.
 * Provides lookup by id, emoji, and listing.
 */
export class AgentRegistry implements AgentRegistryRef {
  private agents: Map<string, AgentProfile>;
  private emojiIndex: Map<string, string>;
  private defaultId: string;

  constructor(agents: Map<string, AgentProfile>, defaultId = 'scooby') {
    this.agents = agents;
    this.defaultId = defaultId;

    // Build emoji → agentId index
    this.emojiIndex = new Map();
    for (const [id, profile] of agents) {
      if (profile.emoji) {
        this.emojiIndex.set(profile.emoji, id);
      }
    }
  }

  get(id: string): AgentProfile | undefined {
    return this.agents.get(id);
  }

  getByEmoji(emoji: string): AgentProfile | undefined {
    const id = this.emojiIndex.get(emoji);
    return id ? this.agents.get(id) : undefined;
  }

  list(): AgentProfile[] {
    return Array.from(this.agents.values());
  }

  listEntries(): Array<[string, AgentProfile]> {
    return Array.from(this.agents.entries());
  }

  getDefault(): AgentProfile {
    return this.agents.get(this.defaultId) ?? this.agents.values().next().value!;
  }

  getDefaultId(): string {
    return this.defaultId;
  }

  /**
   * Scan text for any agent emoji and return the first matching agentId.
   */
  matchEmoji(text: string): string | null {
    for (const [emoji, agentId] of this.emojiIndex) {
      if (text.includes(emoji)) {
        return agentId;
      }
    }
    return null;
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }

  /**
   * Find an agent by name (case-insensitive).
   */
  findByName(name: string): [string, AgentProfile] | undefined {
    const lower = name.toLowerCase();
    for (const [id, profile] of this.agents) {
      if (profile.name.toLowerCase() === lower || id.toLowerCase() === lower) {
        return [id, profile];
      }
    }
    return undefined;
  }

  /**
   * Update in-memory agent profile fields.
   */
  update(id: string, updates: {
    name?: string;
    emoji?: string;
    about?: string;
    model?: string;
    fallbackModel?: string | null;
    tools?: string[];
    skills?: string[];
    universal?: boolean;
  }): boolean {
    const profile = this.agents.get(id);
    if (!profile) return false;

    const oldEmoji = profile.emoji;

    if (updates.name !== undefined) profile.name = updates.name;
    if (updates.emoji !== undefined) profile.emoji = updates.emoji;
    if (updates.about !== undefined) profile.about = updates.about;
    if (updates.model !== undefined) profile.modelRef = updates.model;
    if (updates.fallbackModel !== undefined) profile.fallbackModelRef = updates.fallbackModel ?? undefined;
    if (updates.tools !== undefined) profile.allowedTools = updates.tools;
    if (updates.skills !== undefined) profile.skillNames = updates.skills;
    if (updates.universal !== undefined) profile.universalTools = updates.universal;

    // Rebuild emoji index if emoji changed
    if (updates.emoji !== undefined && updates.emoji !== oldEmoji) {
      if (oldEmoji) this.emojiIndex.delete(oldEmoji);
      if (updates.emoji) this.emojiIndex.set(updates.emoji, id);
    }

    return true;
  }

  /**
   * Update in-memory markdown content for a file key.
   */
  updateFile(id: string, fileKey: 'identity' | 'soul' | 'tools', content: string): boolean {
    const profile = this.agents.get(id);
    if (!profile) return false;
    profile[fileKey] = content;
    return true;
  }
}
