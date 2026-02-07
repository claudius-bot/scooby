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
}
