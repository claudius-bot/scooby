import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WorkspaceHeartbeatConfig } from '../config/schema.js';

export interface WorkspaceHeartbeatDeps {
  workspaceId: string;
  workspacePath: string;
  config: WorkspaceHeartbeatConfig;
  runAgent: (prompt: string) => Promise<string>;
  deliver: (text: string) => Promise<void>;
}

export class WorkspaceHeartbeat {
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private deps: WorkspaceHeartbeatDeps) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    const intervalMs = this.deps.config.intervalMinutes * 60 * 1000;

    this.interval = setInterval(() => {
      this.tick().catch((err) => {
        console.error(`[WorkspaceHeartbeat:${this.deps.workspaceId}] Tick error:`, err);
      });
    }, intervalMs);

    console.log(
      `[WorkspaceHeartbeat:${this.deps.workspaceId}] Started with ${this.deps.config.intervalMinutes}min interval`,
    );
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log(`[WorkspaceHeartbeat:${this.deps.workspaceId}] Stopped`);
  }

  private async tick(): Promise<void> {
    if (!this.isWithinActiveHours()) {
      console.log(`[WorkspaceHeartbeat:${this.deps.workspaceId}] Outside active hours, skipping`);
      return;
    }

    // Read HEARTBEAT.md from workspace
    const checklist = await this.safeReadFile(join(this.deps.workspacePath, 'HEARTBEAT.md'));

    // Build heartbeat prompt
    const suppressToken = this.deps.config.suppressToken;
    const prompt = [
      '[Heartbeat Turn]',
      'This is a periodic heartbeat check. Review your workspace state and any pending tasks.',
      '',
      checklist
        ? `## Heartbeat Checklist\n${checklist}`
        : 'No HEARTBEAT.md found — check for any pending tasks or items that need attention.',
      '',
      `If everything is fine and nothing needs attention, respond with exactly: ${suppressToken}`,
      `If there is something to report, respond with a concise update.`,
    ].join('\n');

    try {
      const response = await this.deps.runAgent(prompt);

      if (this.shouldSuppress(response)) {
        console.log(`[WorkspaceHeartbeat:${this.deps.workspaceId}] Suppressed (${suppressToken})`);
        return;
      }

      // Deliver the response
      if (this.deps.config.delivery) {
        await this.deps.deliver(response);
        console.log(`[WorkspaceHeartbeat:${this.deps.workspaceId}] Delivered heartbeat response`);
      } else {
        console.log(`[WorkspaceHeartbeat:${this.deps.workspaceId}] Response (no delivery target): ${response.slice(0, 200)}`);
      }
    } catch (err) {
      console.error(`[WorkspaceHeartbeat:${this.deps.workspaceId}] Agent error:`, err);
    }
  }

  private isWithinActiveHours(): boolean {
    const ah = this.deps.config.activeHours;
    if (!ah) return true; // No active hours configured = always active

    const tz = ah.timezone;
    const now = new Date();

    // Use Intl.DateTimeFormat for zero-dependency TZ support
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = ah.start.split(':').map(Number);
    const [endH, endM] = ah.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Normal range: e.g. 08:00 - 22:00
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight range: e.g. 22:00 - 06:00
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  private shouldSuppress(response: string): boolean {
    const token = this.deps.config.suppressToken;
    const trimmed = response.trim();
    return trimmed === token || trimmed.startsWith(token);
  }

  private async safeReadFile(path: string): Promise<string> {
    try {
      return await readFile(path, 'utf-8');
    } catch {
      return '';
    }
  }
}
