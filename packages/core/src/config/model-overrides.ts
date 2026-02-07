import { z } from 'zod';
import { join } from 'node:path';
import { JsonStore } from '../storage/json-store.js';
import { ModelCandidateSchema, type ModelCandidate } from '../config/schema.js';

const ModelOverridesSchema = z.object({
  fast: z.array(ModelCandidateSchema).optional(),
  slow: z.array(ModelCandidateSchema).optional(),
  updatedAt: z.string().optional(),
});

type ModelOverrides = z.infer<typeof ModelOverridesSchema>;

export class ModelOverrideStore {
  private store: JsonStore<ModelOverrides>;
  private cache: ModelOverrides | null = null;

  constructor(dataDir: string) {
    this.store = new JsonStore<ModelOverrides>(join(dataDir, 'model-overrides.json'));
  }

  async get(): Promise<ModelOverrides> {
    if (this.cache) return this.cache;
    const raw = await this.store.read();
    if (!raw) {
      this.cache = {};
      return this.cache;
    }
    const parsed = ModelOverridesSchema.safeParse(raw);
    this.cache = parsed.success ? parsed.data : {};
    return this.cache;
  }

  async setGroup(group: 'fast' | 'slow', candidates: ModelCandidate[]): Promise<void> {
    const current = await this.get();
    const updated: ModelOverrides = {
      ...current,
      [group]: candidates,
      updatedAt: new Date().toISOString(),
    };
    await this.store.write(updated);
    this.cache = updated;
  }

  async clear(): Promise<void> {
    const updated: ModelOverrides = { updatedAt: new Date().toISOString() };
    await this.store.write(updated);
    this.cache = updated;
  }

  async clearGroup(group: 'fast' | 'slow'): Promise<void> {
    const current = await this.get();
    const updated: ModelOverrides = { ...current, updatedAt: new Date().toISOString() };
    delete updated[group];
    await this.store.write(updated);
    this.cache = updated;
  }

  async getWorkspaceModels(): Promise<{ fast?: ModelCandidate[]; slow?: ModelCandidate[] } | undefined> {
    const overrides = await this.get();
    if (!overrides.fast && !overrides.slow) return undefined;
    const result: { fast?: ModelCandidate[]; slow?: ModelCandidate[] } = {};
    if (overrides.fast) result.fast = overrides.fast;
    if (overrides.slow) result.slow = overrides.slow;
    return result;
  }
}
