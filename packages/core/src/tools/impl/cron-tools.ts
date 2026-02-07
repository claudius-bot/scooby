import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { ScoobyToolDefinition } from '../types.js';
import { DeliveryTargetSchema } from '../../config/schema.js';
import type { WorkspaceCronEntry } from '../../config/schema.js';
import { parseScheduleString } from '../../automation/duration.js';

// ── cron_add ─────────────────────────────────────────────────────────

export const cronAddTool: ScoobyToolDefinition = {
  name: 'cron_add',
  description:
    'Schedule a recurring job or one-shot reminder. Use for reminders ("in 20m"), recurring tasks ("every 5m", "daily 09:00"), or cron expressions ("0 9 * * *").',
  inputSchema: z.object({
    prompt: z.string().describe('What to run when the job fires'),
    schedule: z.string().describe('Schedule: "in 20m", "every 5m", "daily 09:00", "0 9 * * *", "tomorrow at 9am"'),
    name: z.string().optional().describe('Human-readable name for the job'),
    delivery: DeliveryTargetSchema.optional().describe('Where to send output (defaults to current conversation)'),
  }),
  async execute(input, ctx) {
    if (!ctx.cronScheduler) {
      return 'Error: Cron scheduler not available for this workspace.';
    }

    let schedule;
    try {
      schedule = parseScheduleString(input.schedule);
    } catch (err: unknown) {
      return `Error parsing schedule: ${err instanceof Error ? err.message : String(err)}`;
    }

    // Auto-populate delivery from current conversation if not provided
    const delivery = input.delivery ?? (ctx.conversation
      ? { channel: ctx.conversation.channelType, conversationId: ctx.conversation.conversationId }
      : undefined);

    // Set anchorMs for interval-based schedules
    if (schedule.kind === 'every') {
      schedule.anchorMs = Date.now();
    }

    const entry: WorkspaceCronEntry = {
      id: randomUUID(),
      name: input.name,
      schedule,
      prompt: input.prompt,
      enabled: true,
      delivery,
      source: 'agent',
      createdAt: new Date().toISOString(),
      state: {},
    };

    await ctx.cronScheduler.addJob(entry);

    const scheduleDesc = describeSchedule(schedule);
    return `Job scheduled successfully.\nID: ${entry.id}\nSchedule: ${scheduleDesc}\nPrompt: ${input.prompt}${entry.name ? `\nName: ${entry.name}` : ''}`;
  },
};

// ── cron_remove ──────────────────────────────────────────────────────

export const cronRemoveTool: ScoobyToolDefinition = {
  name: 'cron_remove',
  description: 'Remove a scheduled cron job or reminder by its ID.',
  inputSchema: z.object({
    jobId: z.string().describe('The job ID to remove'),
  }),
  async execute(input, ctx) {
    if (!ctx.cronScheduler) {
      return 'Error: Cron scheduler not available for this workspace.';
    }

    const removed = await ctx.cronScheduler.removeJob(input.jobId);
    if (removed) {
      return `Job "${input.jobId}" removed successfully.`;
    }
    return `Job "${input.jobId}" not found.`;
  },
};

// ── cron_list ────────────────────────────────────────────────────────

export const cronListTool: ScoobyToolDefinition = {
  name: 'cron_list',
  description: 'List all scheduled cron jobs and reminders in this workspace.',
  inputSchema: z.object({
    includeHistory: z.boolean().optional().describe('Include last 5 run results'),
  }),
  async execute(input, ctx) {
    if (!ctx.cronScheduler) {
      return 'Error: Cron scheduler not available for this workspace.';
    }

    const jobs = await ctx.cronScheduler.listJobs();

    if (jobs.length === 0) {
      return 'No scheduled jobs in this workspace.';
    }

    const lines: string[] = ['## Scheduled Jobs', ''];

    for (const job of jobs) {
      const scheduleDesc = describeSchedule(job.schedule);
      const isCompletedOneShot = !job.enabled && job.schedule.kind === 'at';
      const statusLabel = isCompletedOneShot
        ? ' (completed)'
        : !job.enabled
          ? ' (disabled)'
          : '';
      lines.push(`**${job.name ?? job.id}**${statusLabel}`);
      lines.push(`  ID: ${job.id}`);
      lines.push(`  Schedule: ${scheduleDesc}`);
      lines.push(`  Prompt: ${job.prompt.slice(0, 100)}${job.prompt.length > 100 ? '...' : ''}`);
      lines.push(`  Source: ${job.source}`);
      if (job.state?.lastStatus) {
        lines.push(`  Last status: ${job.state.lastStatus}`);
      }
      if (job.delivery) {
        lines.push(`  Delivery: ${job.delivery.channel}:${job.delivery.conversationId}`);
      }
      lines.push('');
    }

    if (input.includeHistory) {
      const history = await ctx.cronScheduler.getHistory(5);
      if (history.length > 0) {
        lines.push('## Recent Run History', '');
        for (const run of history) {
          lines.push(`- **${run.jobId}** at ${run.startedAt}: ${run.status}`);
          if (run.response) {
            lines.push(`  Response: ${run.response.slice(0, 200)}${run.response.length > 200 ? '...' : ''}`);
          }
          if (run.error) {
            lines.push(`  Error: ${run.error}`);
          }
        }
      }
    }

    return lines.join('\n');
  },
};

// ── Helpers ──────────────────────────────────────────────────────────

function describeSchedule(schedule: WorkspaceCronEntry['schedule']): string {
  switch (schedule.kind) {
    case 'every':
      return `every ${schedule.interval}`;
    case 'daily':
      return `daily at ${schedule.time}`;
    case 'cron':
      return `cron: ${schedule.expression}`;
    case 'at':
      return `one-shot at ${schedule.at}`;
  }
}
