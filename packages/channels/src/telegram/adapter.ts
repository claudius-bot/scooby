import { Bot, type Context } from 'grammy';
import type { ChannelAdapter, InboundMessage, OutboundMessage, MessageHandler } from '../types.js';

export interface TelegramAdapterConfig {
  botToken: string;
}

export class TelegramAdapter implements ChannelAdapter {
  type = 'telegram' as const;
  private bot: Bot;
  private handlers: MessageHandler[] = [];

  constructor(private config: TelegramAdapterConfig) {
    this.bot = new Bot(config.botToken);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.bot.on('message:text', async (ctx: Context) => {
      if (!ctx.message?.text || !ctx.from) return;

      const msg: InboundMessage = {
        channelType: 'telegram',
        conversationId: String(ctx.chat!.id),
        senderId: String(ctx.from.id),
        senderName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        text: ctx.message.text,
        timestamp: new Date(ctx.message.date * 1000),
        replyToMessageId: ctx.message.reply_to_message?.message_id
          ? String(ctx.message.reply_to_message.message_id) : undefined,
        raw: ctx.message,
      };

      for (const handler of this.handlers) {
        await handler(msg);
      }
    });
  }

  async start(): Promise<void> {
    console.log('[Telegram] Starting bot...');
    // Start polling (non-blocking)
    this.bot.start({
      onStart: () => console.log('[Telegram] Bot is running'),
    });
  }

  async stop(): Promise<void> {
    console.log('[Telegram] Stopping bot...');
    await this.bot.stop();
  }

  async send(message: OutboundMessage): Promise<void> {
    const chatId = Number(message.conversationId);
    const text = message.text;

    // Telegram has 4096 char limit per message
    const MAX_LEN = 4096;
    if (text.length <= MAX_LEN) {
      await this.bot.api.sendMessage(chatId, text, {
        parse_mode: message.format === 'markdown' ? 'MarkdownV2' : undefined,
        reply_to_message_id: message.replyToMessageId ? Number(message.replyToMessageId) : undefined,
      });
    } else {
      // Split into chunks at newline boundaries where possible
      const chunks = this.splitMessage(text, MAX_LEN);
      for (const chunk of chunks) {
        await this.bot.api.sendMessage(chatId, chunk, {
          parse_mode: message.format === 'markdown' ? 'MarkdownV2' : undefined,
        });
      }
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  private splitMessage(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }
      // Try to split at last newline before maxLen
      let splitAt = remaining.lastIndexOf('\n', maxLen);
      if (splitAt <= 0) splitAt = maxLen;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }
    return chunks;
  }
}
