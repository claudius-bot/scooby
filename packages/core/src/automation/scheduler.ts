import { CronJob } from 'cron';
import { join } from 'node:path';
import { JsonStore } from '../storage/json-store.js';
import { JsonlStore } from '../storage/jsonl-store.js';
import type { WorkspaceCronEntry, CronRunRecord } from '../config/schema.js';

type WorkspaceCronHandler = (job: WorkspaceCronEntry, workspaceId: string) => Promise<string>;

const DURATION_RE = /^(\d+)\s*(s|sec|m|min|h|hr|d|day)s?$/i;
const UNIT_MS: Record<string, number> = {
  s: 1000, sec: 1000,
  m: 60_000, min: 60_000,
  h: 3_600_000, hr: 3_600_000,
  d: 86_400_000, day: 86_400_000,
};

const HISTORY_COMPACT_LIMIT = 100;
const HISTORY_COMPACT_EVERY = 20;
const RESPONSE_MAX_CHARS = 2000;
const ONE_SHOT_GRACE_MS = 5 * 60 * 1000; // 5 minutes

export class WorkspaceCronScheduler {
  private cronJobs = new Map<string, CronJob>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private handler: WorkspaceCronHandler | null = null;
  private jobStore: JsonStore<WorkspaceCronEntry[]>;
  private historyStore: JsonlStore<CronRunRecord>;
  private runsSinceCompact = 0;

  constructor(
    private workspaceId: string,
    private dataDir: string,
  ) {
    this.jobStore = new JsonStore(join(dataDir, 'cron-jobs.json'));
    this.historyStore = new JsonlStore(join(dataDir, 'cron-history.jsonl'));
  }

  onJob(handler: WorkspaceCronHandler): void {
    this.handler = handler;
  }

  /** Schedule a config-defined job (startup). Overwrites persisted agent jobs with same ID. */
  async schedule(entry: WorkspaceCronEntry): Promise<void> {
    if (!entry.enabled) return;
    this.scheduleEntry(entry);
  }

  /** Add an agent-created job: persist + schedule. */
  async addJob(entry: WorkspaceCronEntry): Promise<void> {
    const jobs = (await this.jobStore.read()) ?? [];
    const idx = jobs.findIndex((j) => j.id === entry.id);
    if (idx >= 0) {
      jobs[idx] = entry;
    } else {
      jobs.push(entry);
    }
    await this.jobStore.write(jobs);

    if (entry.enabled) {
      this.scheduleEntry(entry);
    }
  }

  /** Remove a job by ID: unschedule + remove from persistence. */
  async removeJob(id: string): Promise<boolean> {
    this.stop(id);

    const jobs = (await this.jobStore.read()) ?? [];
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx < 0) return false;

    jobs.splice(idx, 1);
    await this.jobStore.write(jobs);
    return true;
  }

  /** List all jobs: config-scheduled (in-memory) + agent-persisted. */
  async listJobs(): Promise<WorkspaceCronEntry[]> {
    const persisted = (await this.jobStore.read()) ?? [];
    // Merge: persisted agent jobs + any config jobs that aren't overridden
    const ids = new Set(persisted.map((j) => j.id));
    const configJobs: WorkspaceCronEntry[] = [];
    // Config jobs are scheduled in-memory via schedule(), we track them here
    // Return agent-persisted jobs (they're the persisted state of truth for agent jobs)
    return [...persisted, ...configJobs.filter((j) => !ids.has(j.id))];
  }

  /** Get run history, most recent last. */
  async getHistory(limit = 20): Promise<CronRunRecord[]> {
    return this.historyStore.readLast(limit);
  }

  /** Load persisted agent jobs on startup and schedule them. */
  async loadPersistedJobs(): Promise<void> {
    const jobs = (await this.jobStore.read()) ?? [];
    const now = Date.now();

    for (const job of jobs) {
      if (!job.enabled) continue;

      // Handle one-shot 'at' jobs on restart
      if (job.schedule.kind === 'at') {
        const fireTime = Date.parse(job.schedule.at);
        if (isNaN(fireTime)) {
          console.warn(`[Cron:${this.workspaceId}] Invalid 'at' timestamp for job "${job.id}", removing`);
          await this.removeJob(job.id);
          continue;
        }

        const delta = fireTime - now;
        if (delta < -ONE_SHOT_GRACE_MS) {
          // Stale — past grace window
          console.warn(`[Cron:${this.workspaceId}] One-shot job "${job.id}" is stale (${new Date(fireTime).toISOString()}), removing`);
          await this.removeJob(job.id);
          continue;
        }

        // Within grace or future — schedule it
        this.scheduleEntry(job);
        continue;
      }

      this.scheduleEntry(job);
    }
  }

  stop(id: string): void {
    const cj = this.cronJobs.get(id);
    if (cj) {
      cj.stop();
      this.cronJobs.delete(id);
    }
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  stopAll(): void {
    for (const [, cj] of this.cronJobs) cj.stop();
    this.cronJobs.clear();
    for (const [, t] of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  // ── Internal ──────────────────────────────────────────────────────

  private scheduleEntry(entry: WorkspaceCronEntry): void {
    // Stop any existing schedule for this ID
    this.stop(entry.id);

    const schedule = entry.schedule;

    switch (schedule.kind) {
      case 'at':
        this.scheduleOneShot(entry, schedule.at);
        break;
      case 'every':
        this.scheduleInterval(entry, schedule.interval);
        break;
      case 'daily':
        this.scheduleCronExpr(entry, this.dailyToCron(schedule.time));
        break;
      case 'cron':
        this.scheduleCronExpr(entry, schedule.expression);
        break;
    }
  }

  private scheduleOneShot(entry: WorkspaceCronEntry, isoTimestamp: string): void {
    const fireTime = Date.parse(isoTimestamp);
    const delay = Math.max(0, fireTime - Date.now());

    const timer = setTimeout(async () => {
      this.timers.delete(entry.id);
      await this.executeJob(entry);
      // One-shot: remove from persistence after execution
      if (entry.source === 'agent') {
        await this.removeJob(entry.id);
      }
    }, delay);

    this.timers.set(entry.id, timer);
    console.log(`[Cron:${this.workspaceId}] One-shot job "${entry.id}" scheduled for ${isoTimestamp} (in ${Math.round(delay / 1000)}s)`);
  }

  private scheduleInterval(entry: WorkspaceCronEntry, interval: string): void {
    const match = interval.match(DURATION_RE);
    if (!match) {
      console.error(`[Cron:${this.workspaceId}] Invalid interval "${interval}" for job "${entry.id}"`);
      return;
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const ms = UNIT_MS[unit];
    if (!ms) return;

    const totalSeconds = (value * ms) / 1000;

    let cronExpression: string;
    if (totalSeconds < 60) {
      cronExpression = `*/${totalSeconds} * * * * *`;
    } else if (totalSeconds < 3600) {
      cronExpression = `*/${Math.floor(totalSeconds / 60)} * * * *`;
    } else {
      cronExpression = `0 */${Math.floor(totalSeconds / 3600)} * * *`;
    }

    this.scheduleCronExpr(entry, cronExpression);
  }

  private dailyToCron(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    return `${minutes ?? 0} ${hours} * * *`;
  }

  private scheduleCronExpr(entry: WorkspaceCronEntry, expression: string): void {
    const job = new CronJob(expression, () => {
      this.executeJob(entry).catch((err) => {
        console.error(`[Cron:${this.workspaceId}] Job "${entry.id}" execution error:`, err);
      });
    });

    job.start();
    this.cronJobs.set(entry.id, job);
    console.log(`[Cron:${this.workspaceId}] Scheduled job "${entry.id}" with expression: ${expression}`);
  }

  private async executeJob(entry: WorkspaceCronEntry): Promise<void> {
    if (!this.handler) return;

    const startedAt = new Date().toISOString();

    const record: CronRunRecord = {
      jobId: entry.id,
      startedAt,
      status: 'success',
      delivered: false,
    };

    try {
      const response = await this.handler(entry, this.workspaceId);
      record.completedAt = new Date().toISOString();
      record.status = 'success';
      record.response = response.slice(0, RESPONSE_MAX_CHARS);
      record.delivered = true;
    } catch (err: unknown) {
      record.completedAt = new Date().toISOString();
      record.status = 'error';
      record.error = err instanceof Error ? err.message : String(err);
    }

    await this.historyStore.append(record);
    this.runsSinceCompact++;

    if (this.runsSinceCompact >= HISTORY_COMPACT_EVERY) {
      this.runsSinceCompact = 0;
      const all = await this.historyStore.readAll();
      if (all.length > HISTORY_COMPACT_LIMIT) {
        await this.historyStore.rewrite(all.slice(-HISTORY_COMPACT_LIMIT));
      }
    }

    console.log(`[Cron:${this.workspaceId}] Job "${entry.id}" ${record.status}`);
  }
}
