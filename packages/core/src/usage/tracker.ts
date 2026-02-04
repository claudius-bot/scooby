import { join } from 'node:path';
import { JsonlStore } from '../storage/jsonl-store.js';
import type { UsageRecord } from '@scooby/schemas';

export class UsageTracker {
  private store: JsonlStore<UsageRecord>;

  constructor(dataDir: string) {
    this.store = new JsonlStore<UsageRecord>(join(dataDir, 'usage.jsonl'));
  }

  async record(entry: UsageRecord): Promise<void> {
    await this.store.append(entry);
  }

  async readAll(): Promise<UsageRecord[]> {
    return this.store.readAll();
  }
}
