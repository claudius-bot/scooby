import { join } from 'node:path';
import { JsonlStore } from '../storage/jsonl-store.js';
import type { UsageRecord, UsageSummary } from '@scooby/schemas';

interface AggregateOptions {
  days?: number;
}

interface BucketData {
  tokens: { input: number; output: number; total: number };
  cost: { input: number; output: number; total: number };
  requests: number;
}

function emptyBucket(): BucketData {
  return {
    tokens: { input: 0, output: 0, total: 0 },
    cost: { input: 0, output: 0, total: 0 },
    requests: 0,
  };
}

function addToBucket(bucket: BucketData, record: UsageRecord): void {
  bucket.tokens.input += record.tokens.input;
  bucket.tokens.output += record.tokens.output;
  bucket.tokens.total += record.tokens.total;
  bucket.cost.input += record.cost?.input ?? 0;
  bucket.cost.output += record.cost?.output ?? 0;
  bucket.cost.total += record.cost?.total ?? 0;
  bucket.requests += 1;
}

/**
 * Read usage.jsonl from a workspace data directory and return an
 * aggregated summary.
 */
export async function loadUsageSummary(
  dataDir: string,
  options?: AggregateOptions,
): Promise<UsageSummary> {
  const store = new JsonlStore<UsageRecord>(join(dataDir, 'usage.jsonl'));
  const allRecords = await store.readAll();

  const days = options?.days ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString();

  const records = allRecords.filter((r) => r.timestamp >= cutoffIso);

  const totals = emptyBucket();
  const byModel: Record<string, BucketData> = {};
  const byDay: Record<string, BucketData> = {};
  const byAgent: Record<string, BucketData> = {};

  for (const record of records) {
    addToBucket(totals, record);

    const modelKey = `${record.provider}/${record.model}`;
    if (!byModel[modelKey]) byModel[modelKey] = emptyBucket();
    addToBucket(byModel[modelKey], record);

    const dayKey = record.timestamp.slice(0, 10); // YYYY-MM-DD
    if (!byDay[dayKey]) byDay[dayKey] = emptyBucket();
    addToBucket(byDay[dayKey], record);

    if (!byAgent[record.agentName]) byAgent[record.agentName] = emptyBucket();
    addToBucket(byAgent[record.agentName], record);
  }

  return { totals, byModel, byDay, byAgent };
}
