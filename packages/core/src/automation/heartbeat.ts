export type HeartbeatTask = () => Promise<void>;

export interface HeartbeatConfig {
  intervalMinutes: number; // default 5
}

export class Heartbeat {
  private tasks = new Map<string, HeartbeatTask>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private config: HeartbeatConfig) {}

  registerTask(name: string, task: HeartbeatTask): void {
    this.tasks.set(name, task);
  }

  unregisterTask(name: string): void {
    this.tasks.delete(name);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const intervalMs = this.config.intervalMinutes * 60 * 1000;

    this.interval = setInterval(async () => {
      await this.tick();
    }, intervalMs);

    console.log(`[Heartbeat] Started with ${this.config.intervalMinutes}min interval, ${this.tasks.size} tasks`);
  }

  async tick(): Promise<void> {
    for (const [name, task] of this.tasks) {
      try {
        await task();
      } catch (err) {
        console.error(`[Heartbeat] Task "${name}" failed:`, err);
      }
    }
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log('[Heartbeat] Stopped');
  }
}
