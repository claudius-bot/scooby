import { CronJob } from 'cron';
import { join } from 'node:path';
import { JsonStore } from '../storage/json-store.js';

export interface CronJobConfig {
  id: string;
  workspace: string;
  type: 'every' | 'at' | 'cron';
  schedule: string;
  prompt: string;
  enabled: boolean;
}

export interface CronJobState {
  id: string;
  lastRunAt?: string;
  nextRunAt?: string;
  status: 'idle' | 'running' | 'error';
  lastError?: string;
}

export type CronHandler = (job: CronJobConfig) => Promise<void>;

export class CronScheduler {
  private jobs = new Map<string, CronJob>();
  private stateStore: JsonStore<Record<string, CronJobState>>;
  private handler: CronHandler | null = null;

  constructor(dataDir: string) {
    this.stateStore = new JsonStore(join(dataDir, 'cron-jobs.json'));
  }

  onJob(handler: CronHandler): void {
    this.handler = handler;
  }

  async schedule(config: CronJobConfig): Promise<void> {
    if (!config.enabled) return;

    // Stop existing job if any
    this.stop(config.id);

    let cronExpression: string;
    switch (config.type) {
      case 'cron':
        cronExpression = config.schedule;
        break;
      case 'every': {
        // Parse interval like "5m", "1h", "30s"
        const match = config.schedule.match(/^(\d+)(s|m|h)$/);
        if (!match) throw new Error(`Invalid interval: ${config.schedule}`);
        const [, value, unit] = match;
        const seconds = unit === 's' ? Number(value) : unit === 'm' ? Number(value) * 60 : Number(value) * 3600;
        cronExpression = `*/${seconds} * * * * *`;
        if (seconds >= 60) cronExpression = `*/${Math.floor(seconds / 60)} * * * *`;
        if (seconds >= 3600) cronExpression = `0 */${Math.floor(seconds / 3600)} * * *`;
        break;
      }
      case 'at': {
        // Parse time like "09:00" or "14:30"
        const [hours, minutes] = config.schedule.split(':').map(Number);
        cronExpression = `${minutes} ${hours} * * *`;
        break;
      }
      default:
        throw new Error(`Unknown job type: ${(config as CronJobConfig).type}`);
    }

    const job = new CronJob(cronExpression, async () => {
      if (!this.handler) return;

      await this.stateStore.update((states) => {
        const s = states ?? {};
        s[config.id] = { ...s[config.id], id: config.id, status: 'running', lastRunAt: new Date().toISOString() };
        return s;
      });

      try {
        await this.handler(config);
        await this.stateStore.update((states) => {
          const s = states ?? {};
          s[config.id] = { ...s[config.id], id: config.id, status: 'idle' };
          return s;
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await this.stateStore.update((states) => {
          const s = states ?? {};
          s[config.id] = { ...s[config.id], id: config.id, status: 'error', lastError: message };
          return s;
        });
      }
    });

    job.start();
    this.jobs.set(config.id, job);

    console.log(`[Cron] Scheduled job "${config.id}" with expression: ${cronExpression}`);
  }

  stop(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
    }
  }

  async getState(id: string): Promise<CronJobState | null> {
    const states = await this.stateStore.read();
    return states?.[id] ?? null;
  }

  async getAllStates(): Promise<Record<string, CronJobState>> {
    return (await this.stateStore.read()) ?? {};
  }

  stopAll(): void {
    for (const [, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
  }
}
