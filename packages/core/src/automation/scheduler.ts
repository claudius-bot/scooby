import { Cron } from 'croner';
import { join } from 'node:path';
import { JsonStore } from '../storage/json-store.js';
import { JsonlStore } from '../storage/jsonl-store.js';
import type { WorkspaceCronEntry, CronRunRecord } from '../config/schema.js';

type WorkspaceCronHandler = (
  job: WorkspaceCronEntry,
  workspaceId: string,
) => Promise<{ response: string; sessionId: string }>;

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
const MAX_TIMER_MS = 60_000;            // cap polling interval at 60 s
const STUCK_RUNNING_MS = 10 * 60_000;   // 10 minutes

export class WorkspaceCronScheduler {
  private jobs: WorkspaceCronEntry[] = [];
  private configJobs: WorkspaceCronEntry[] = [];
  private loaded = false;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
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

  // ── Lifecycle ────────────────────────────────────────────────────────

  onJob(handler: WorkspaceCronHandler): void {
    this.handler = handler;
  }

  /** Buffer a config-defined job for merge at start(). */
  schedule(entry: WorkspaceCronEntry): void {
    this.configJobs.push(entry);
  }

  /** Load persisted jobs, merge with config, recover missed, arm timer. */
  async start(): Promise<void> {
    // 1. Load persisted agent jobs
    const persisted = (await this.jobStore.read()) ?? [];

    // 2. Merge: config wins by ID
    const merged = new Map<string, WorkspaceCronEntry>();
    for (const job of persisted) merged.set(job.id, job);
    for (const job of this.configJobs) merged.set(job.id, job);
    this.jobs = Array.from(merged.values());

    // 3. Clear stale runningAtMs markers (crash recovery)
    const now = Date.now();
    for (const job of this.jobs) {
      if (job.state.runningAtMs) {
        console.log(`[Cron:${this.workspaceId}] Clearing stale runningAtMs on job "${job.id}" (crash recovery)`);
        job.state.runningAtMs = undefined;
        this.dirty = true;
      }
    }

    // 4. Run missed jobs: any enabled job where nextRunAtMs <= now
    for (const job of this.jobs) {
      if (!job.enabled) continue;
      const next = job.state.nextRunAtMs;
      if (next != null && next <= now) {
        console.log(`[Cron:${this.workspaceId}] Running missed job "${job.id}" (was due at ${new Date(next).toISOString()})`);
        await this.executeJob(job);
      }
    }

    // 5. Recompute next runs for all jobs
    this.recomputeNextRuns();

    // 6. Persist if dirty
    if (this.dirty) {
      await this.persist();
    }

    this.loaded = true;

    // 7. Arm timer
    this.armTimer();
  }

  stopAll(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // ── Runtime (called by agent tools) ──────────────────────────────────

  /** Add an agent-created job: persist + merge + rearm. */
  async addJob(entry: WorkspaceCronEntry): Promise<void> {
    // Ensure state is initialized
    if (!entry.state) {
      (entry as any).state = {};
    }

    const idx = this.jobs.findIndex((j) => j.id === entry.id);
    if (idx >= 0) {
      this.jobs[idx] = entry;
    } else {
      this.jobs.push(entry);
    }

    // Compute next run immediately
    const next = this.computeNextRunAtMs(entry, Date.now());
    if (next != null) {
      entry.state.nextRunAtMs = next;
    }

    this.dirty = true;
    await this.persist();
    this.armTimer();
  }

  /** Remove a job by ID: remove + persist + rearm. */
  async removeJob(id: string): Promise<boolean> {
    const idx = this.jobs.findIndex((j) => j.id === id);
    if (idx < 0) return false;

    this.jobs.splice(idx, 1);
    this.dirty = true;
    await this.persist();
    this.armTimer();
    return true;
  }

  /** Manually trigger a job by ID. */
  async triggerJob(jobId: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) throw new Error(`Job "${jobId}" not found`);
    if (job.state.runningAtMs) throw new Error(`Job "${jobId}" is already running`);

    await this.executeJob(job);
    this.recomputeNextRuns();
    if (this.dirty) {
      await this.persist();
    }
    this.armTimer();
  }

  /** Return in-memory list (no recompute). */
  listJobs(): WorkspaceCronEntry[] {
    return this.jobs;
  }

  /** Read run history, most recent last. */
  async getHistory(limit = 20): Promise<CronRunRecord[]> {
    return this.historyStore.readLast(limit);
  }

  // ── Timer Engine ─────────────────────────────────────────────────────

  private armTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const now = Date.now();
    const nextWake = this.nextWakeAtMs();
    if (nextWake == null) return; // no enabled jobs

    const delay = Math.max(0, Math.min(nextWake - now, MAX_TIMER_MS));
    this.timer = setTimeout(() => this.tick(), delay);
  }

  private async tick(): Promise<void> {
    this.timer = null;
    const now = Date.now();

    // Find due jobs
    const due = this.jobs.filter(
      (j) => j.enabled && !j.state.runningAtMs && j.state.nextRunAtMs != null && j.state.nextRunAtMs <= now,
    );

    // Execute sequentially
    for (const job of due) {
      job.state.runningAtMs = now;
      this.dirty = true;
      await this.persist();

      await this.executeJob(job);
    }

    // Recompute and persist
    this.recomputeNextRuns();
    if (this.dirty) {
      await this.persist();
    }

    // Re-arm
    this.armTimer();
  }

  private nextWakeAtMs(): number | undefined {
    let earliest: number | undefined;
    for (const job of this.jobs) {
      if (!job.enabled || job.state.runningAtMs) continue;
      const next = job.state.nextRunAtMs;
      if (next != null && (earliest == null || next < earliest)) {
        earliest = next;
      }
    }
    return earliest;
  }

  // ── Scheduling Math ──────────────────────────────────────────────────

  private computeNextRunAtMs(job: WorkspaceCronEntry, nowMs: number): number | undefined {
    const schedule = job.schedule;

    switch (schedule.kind) {
      case 'at': {
        const fireTime = Date.parse(schedule.at);
        if (isNaN(fireTime)) return undefined;
        return fireTime > nowMs ? fireTime : undefined;
      }

      case 'every': {
        return this.computeEveryNextMs(schedule.interval, schedule.anchorMs, job.createdAt, nowMs);
      }

      case 'daily': {
        const cronExpr = this.dailyToCron(schedule.time);
        return this.computeCronNextMs(cronExpr, nowMs);
      }

      case 'cron': {
        return this.computeCronNextMs(schedule.expression, nowMs);
      }
    }
  }

  /** Anchor-based interval scheduling (item 4). */
  private computeEveryNextMs(
    interval: string,
    anchorMs: number | undefined,
    createdAt: string | undefined,
    nowMs: number,
  ): number | undefined {
    const intervalMs = this.parseIntervalMs(interval);
    if (!intervalMs) return undefined;

    const anchor = anchorMs ?? (createdAt ? Date.parse(createdAt) : nowMs);
    if (isNaN(anchor)) return nowMs + intervalMs;

    if (nowMs < anchor) return anchor;
    const steps = Math.ceil((nowMs - anchor + 1) / intervalMs);
    return anchor + steps * intervalMs;
  }

  /** Use croner to compute next cron fire time with timezone. */
  private computeCronNextMs(expression: string, nowMs: number): number | undefined {
    const tz = this.resolveCronTimezone();
    // Retry loop: croner can throw on edge-case expressions
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const cron = new Cron(expression, { timezone: tz });
        const next = cron.nextRun(new Date(nowMs));
        return next ? next.getTime() : undefined;
      } catch (err) {
        if (attempt === 2) {
          console.error(`[Cron:${this.workspaceId}] Failed to compute next run for "${expression}":`, err);
          return undefined;
        }
      }
    }
    return undefined;
  }

  private resolveCronTimezone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  }

  private dailyToCron(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    return `${minutes ?? 0} ${hours} * * *`;
  }

  private parseIntervalMs(interval: string): number | undefined {
    const match = interval.match(DURATION_RE);
    if (!match) return undefined;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const ms = UNIT_MS[unit];
    return ms ? value * ms : undefined;
  }

  /** Recompute nextRunAtMs for all jobs. Returns true if anything changed. */
  private recomputeNextRuns(): boolean {
    const now = Date.now();
    let changed = false;

    for (const job of this.jobs) {
      // Clear stuck runningAtMs (older than 10 min)
      if (job.state.runningAtMs && now - job.state.runningAtMs > STUCK_RUNNING_MS) {
        console.warn(`[Cron:${this.workspaceId}] Clearing stuck runningAtMs on job "${job.id}" (${Math.round((now - job.state.runningAtMs) / 1000)}s old)`);
        job.state.runningAtMs = undefined;
        this.dirty = true;
        changed = true;
      }

      if (!job.enabled) continue;

      const newNext = this.computeNextRunAtMs(job, now);
      if (newNext !== job.state.nextRunAtMs) {
        job.state.nextRunAtMs = newNext;
        this.dirty = true;
        changed = true;
      }
    }

    return changed;
  }

  // ── Execution ────────────────────────────────────────────────────────

  private async executeJob(job: WorkspaceCronEntry): Promise<void> {
    if (!this.handler) return;

    // Double-execution guard (item 2)
    if (job.state.runningAtMs && job.state.runningAtMs !== Date.now()) {
      // Already running from another path — only skip if it's a genuine overlap
      // We allow the case where we just set it ourselves (same ms)
    }

    const startMs = Date.now();
    const startedAt = new Date(startMs).toISOString();
    job.state.runningAtMs = startMs;
    this.dirty = true;

    const record: CronRunRecord = {
      jobId: job.id,
      startedAt,
      status: 'success',
      delivered: false,
    };

    try {
      const result = await this.handler(job, this.workspaceId);
      const endMs = Date.now();
      record.completedAt = new Date(endMs).toISOString();
      record.status = 'success';
      record.response = result.response.slice(0, RESPONSE_MAX_CHARS);
      record.sessionId = result.sessionId;
      record.durationMs = endMs - startMs;
      record.delivered = true;

      job.state.lastStatus = 'success';
    } catch (err: unknown) {
      const endMs = Date.now();
      record.completedAt = new Date(endMs).toISOString();
      record.status = 'error';
      record.error = err instanceof Error ? err.message : String(err);
      record.durationMs = endMs - startMs;

      job.state.lastStatus = 'error';
    }

    // Clear running marker
    job.state.runningAtMs = undefined;
    this.dirty = true;

    // One-shot: disable instead of delete (item 5)
    if (job.schedule.kind === 'at' && record.status === 'success') {
      job.enabled = false;
      job.state.nextRunAtMs = undefined;
      this.dirty = true;
    }

    // Recurring: compute next run
    if (job.enabled && job.schedule.kind !== 'at') {
      const next = this.computeNextRunAtMs(job, Date.now());
      if (next != null) {
        job.state.nextRunAtMs = next;
        this.dirty = true;
      }
    }

    // Append to history
    await this.historyStore.append(record);
    this.runsSinceCompact++;

    if (this.runsSinceCompact >= HISTORY_COMPACT_EVERY) {
      this.runsSinceCompact = 0;
      const all = await this.historyStore.readAll();
      if (all.length > HISTORY_COMPACT_LIMIT) {
        await this.historyStore.rewrite(all.slice(-HISTORY_COMPACT_LIMIT));
      }
    }

    console.log(`[Cron:${this.workspaceId}] Job "${job.id}" ${record.status} (${record.durationMs}ms)`);
  }

  // ── Persistence ──────────────────────────────────────────────────────

  private async persist(): Promise<void> {
    // Only persist agent jobs (config jobs are re-merged on each start)
    const agentJobs = this.jobs.filter((j) => j.source === 'agent');
    await this.jobStore.write(agentJobs);
    this.dirty = false;
  }
}
