/**
 * Loose types for cron data coming from the API. Zod `.default()` means the
 * response may include `undefined` for fields that have defaults, depending
 * on whether the gateway serialises them. These types accept both forms.
 */

export interface CronJobState {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastStatus?: 'success' | 'error' | 'skipped';
}

export interface CronSchedule {
  kind: 'every' | 'daily' | 'cron' | 'at';
  interval?: string;
  anchorMs?: number;
  time?: string;
  expression?: string;
  at?: string;
}

export interface CronJob {
  id: string;
  name?: string;
  agentId?: string;
  schedule: CronSchedule;
  prompt: string;
  enabled?: boolean;
  delivery?: { channel: string; conversationId: string };
  source?: 'config' | 'agent';
  createdAt?: string;
  state?: CronJobState;
}

export interface CronRun {
  jobId: string;
  startedAt: string;
  completedAt?: string;
  status: 'success' | 'error' | 'skipped';
  response?: string;
  error?: string;
  delivered?: boolean;
  sessionId?: string;
  durationMs?: number;
}
