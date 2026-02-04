import type { LanguageModelV1 } from 'ai';
import type { ModelCandidate } from '../config/schema.js';
import { getLanguageModel } from './provider.js';

export type ModelGroup = 'fast' | 'slow';

export interface ModelSelection {
  model: LanguageModelV1;
  candidate: ModelCandidate;
  group: ModelGroup;
}

/**
 * Tracks which model candidates are in a cooldown period (e.g. after a
 * rate-limit or transient failure).  Keys are `provider:model` strings
 * mapped to an expiry timestamp in milliseconds.
 */
export class CooldownTracker {
  private cooldowns = new Map<string, number>();

  private key(provider: string, model: string): string {
    return `${provider}:${model}`;
  }

  markCooldown(provider: string, model: string, durationMs: number): void {
    this.cooldowns.set(this.key(provider, model), Date.now() + durationMs);
  }

  isAvailable(provider: string, model: string): boolean {
    const expiry = this.cooldowns.get(this.key(provider, model));
    if (expiry === undefined) return true;
    if (Date.now() >= expiry) {
      this.cooldowns.delete(this.key(provider, model));
      return true;
    }
    return false;
  }

  clear(): void {
    this.cooldowns.clear();
  }
}

export class ModelSelector {
  constructor(private cooldowns: CooldownTracker) {}

  /**
   * Select the first non-cooled-down candidate from the resolved list for a
   * given group.  Workspace candidates override global candidates when
   * provided.
   */
  select(
    group: ModelGroup,
    globalCandidates: ModelCandidate[],
    workspaceCandidates?: ModelCandidate[],
  ): ModelSelection | null {
    const candidates = workspaceCandidates ?? globalCandidates;

    for (const candidate of candidates) {
      if (this.cooldowns.isAvailable(candidate.provider, candidate.model)) {
        return {
          model: getLanguageModel(candidate.provider, candidate.model),
          candidate,
          group,
        };
      }
    }

    return null;
  }

  /**
   * Return all candidates for a group that are not currently cooling down.
   * Workspace candidates override global candidates when provided.
   */
  getAvailableCandidates(
    group: ModelGroup,
    globalCandidates: ModelCandidate[],
    workspaceCandidates?: ModelCandidate[],
  ): ModelCandidate[] {
    const candidates = workspaceCandidates ?? globalCandidates;
    return candidates.filter((c) => this.cooldowns.isAvailable(c.provider, c.model));
  }
}
