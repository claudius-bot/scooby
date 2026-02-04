import type { InboundMessage, MessageHandler } from './types.js';

export interface MessageQueueOptions {
  debounceMs?: number;  // default 500
}

export class MessageQueue {
  private pending = new Map<string, { messages: InboundMessage[]; timer: ReturnType<typeof setTimeout> }>();
  private handler: MessageHandler | null = null;
  private debounceMs: number;

  constructor(options: MessageQueueOptions = {}) {
    this.debounceMs = options.debounceMs ?? 500;
  }

  onFlush(handler: MessageHandler): void {
    this.handler = handler;
  }

  push(msg: InboundMessage): void {
    const key = `${msg.channelType}:${msg.conversationId}`;
    const existing = this.pending.get(key);

    if (existing) {
      clearTimeout(existing.timer);
      existing.messages.push(msg);
      existing.timer = setTimeout(() => this.flush(key), this.debounceMs);
    } else {
      this.pending.set(key, {
        messages: [msg],
        timer: setTimeout(() => this.flush(key), this.debounceMs),
      });
    }
  }

  private async flush(key: string): Promise<void> {
    const entry = this.pending.get(key);
    if (!entry || !this.handler) return;
    this.pending.delete(key);

    // Merge messages: combine text with newlines, use last message as base
    const merged = entry.messages[entry.messages.length - 1];
    if (entry.messages.length > 1) {
      (merged as any).text = entry.messages.map(m => m.text).join('\n');
      // Merge attachments from all messages
      const allAttachments = entry.messages.flatMap(m => m.attachments ?? []);
      if (allAttachments.length > 0) {
        (merged as any).attachments = allAttachments;
      }
    }

    try {
      await this.handler(merged);
    } catch (err) {
      console.error(`[MessageQueue] Error handling message for ${key}:`, err);
    }
  }

  dispose(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
    }
    this.pending.clear();
  }
}
