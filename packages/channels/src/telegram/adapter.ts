import { Bot, InputFile, type Context } from 'grammy';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ChannelAdapter, InboundMessage, OutboundMessage, OutboundAttachment, MessageHandler } from '../types.js';

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

    this.bot.on('message:voice', async (ctx: Context) => {
      if (!ctx.message?.voice || !ctx.from) return;

      const voice = ctx.message.voice;
      try {
        const localPath = await this.downloadTelegramFile(voice.file_id, 'ogg');

        const msg: InboundMessage = {
          channelType: 'telegram',
          conversationId: String(ctx.chat!.id),
          senderId: String(ctx.from.id),
          senderName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
          text: ctx.message.caption ?? '',
          timestamp: new Date(ctx.message.date * 1000),
          replyToMessageId: ctx.message.reply_to_message?.message_id
            ? String(ctx.message.reply_to_message.message_id) : undefined,
          attachments: [{
            type: 'voice',
            localPath,
            mimeType: voice.mime_type ?? 'audio/ogg',
            duration: voice.duration,
          }],
          raw: ctx.message,
        };

        for (const handler of this.handlers) {
          await handler(msg);
        }
      } catch (err) {
        console.error('[Telegram] Failed to download voice message:', err);
      }
    });

    this.bot.on('message:audio', async (ctx: Context) => {
      if (!ctx.message?.audio || !ctx.from) return;

      const audio = ctx.message.audio;
      const ext = this.extFromMime(audio.mime_type) ?? 'mp3';
      try {
        const localPath = await this.downloadTelegramFile(audio.file_id, ext);

        const msg: InboundMessage = {
          channelType: 'telegram',
          conversationId: String(ctx.chat!.id),
          senderId: String(ctx.from.id),
          senderName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
          text: ctx.message.caption ?? '',
          timestamp: new Date(ctx.message.date * 1000),
          replyToMessageId: ctx.message.reply_to_message?.message_id
            ? String(ctx.message.reply_to_message.message_id) : undefined,
          attachments: [{
            type: 'audio',
            localPath,
            mimeType: audio.mime_type ?? 'audio/mpeg',
            fileName: audio.file_name,
            duration: audio.duration,
          }],
          raw: ctx.message,
        };

        for (const handler of this.handlers) {
          await handler(msg);
        }
      } catch (err) {
        console.error('[Telegram] Failed to download audio file:', err);
      }
    });

    this.bot.on('message:photo', async (ctx: Context) => {
      console.log('[Telegram] Received photo message');
      if (!ctx.message?.photo || !ctx.from) return;

      // Telegram sends multiple sizes, get the largest one
      const photos = ctx.message.photo;
      const largestPhoto = photos[photos.length - 1];
      console.log(`[Telegram] Photo file_id: ${largestPhoto.file_id}, caption: "${ctx.message.caption ?? ''}"`);

      try {
        const localPath = await this.downloadTelegramFile(largestPhoto.file_id, 'jpg', 'scooby-images');
        console.log(`[Telegram] Photo downloaded to: ${localPath}`);

        const msg: InboundMessage = {
          channelType: 'telegram',
          conversationId: String(ctx.chat!.id),
          senderId: String(ctx.from.id),
          senderName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
          text: ctx.message.caption ?? '',
          timestamp: new Date(ctx.message.date * 1000),
          replyToMessageId: ctx.message.reply_to_message?.message_id
            ? String(ctx.message.reply_to_message.message_id) : undefined,
          attachments: [{
            type: 'photo',
            localPath,
            mimeType: 'image/jpeg',
            fileId: largestPhoto.file_id,
          }],
          raw: ctx.message,
        };

        console.log(`[Telegram] Calling ${this.handlers.length} handlers with photo message`);
        for (const handler of this.handlers) {
          await handler(msg);
        }
      } catch (err) {
        console.error('[Telegram] Failed to download photo:', err);
      }
    });

    this.bot.on('message:document', async (ctx: Context) => {
      if (!ctx.message?.document || !ctx.from) return;

      const doc = ctx.message.document;
      // Check if it's an image document (sometimes images are sent as documents)
      const isImage = doc.mime_type?.startsWith('image/');
      const ext = this.extFromMime(doc.mime_type) ?? doc.file_name?.split('.').pop() ?? 'bin';

      try {
        const localPath = await this.downloadTelegramFile(doc.file_id, ext, isImage ? 'scooby-images' : 'scooby-docs');

        const msg: InboundMessage = {
          channelType: 'telegram',
          conversationId: String(ctx.chat!.id),
          senderId: String(ctx.from.id),
          senderName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
          text: ctx.message.caption ?? '',
          timestamp: new Date(ctx.message.date * 1000),
          replyToMessageId: ctx.message.reply_to_message?.message_id
            ? String(ctx.message.reply_to_message.message_id) : undefined,
          attachments: [{
            type: isImage ? 'photo' : 'document',
            localPath,
            mimeType: doc.mime_type,
            fileName: doc.file_name,
            fileId: doc.file_id,
          }],
          raw: ctx.message,
        };

        for (const handler of this.handlers) {
          await handler(msg);
        }
      } catch (err) {
        console.error('[Telegram] Failed to download document:', err);
      }
    });
  }

  private async downloadTelegramFile(fileId: string, ext: string, subdir = 'scooby-audio'): Promise<string> {
    const file = await this.bot.api.getFile(fileId);
    if (!file.file_path) throw new Error('Telegram returned no file_path');

    const url = `https://api.telegram.org/file/bot${this.config.botToken}/${file.file_path}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download file: ${response.status}`);

    const dir = join(tmpdir(), subdir);
    await mkdir(dir, { recursive: true });
    const localPath = join(dir, `${randomUUID()}.${ext}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(localPath, buffer);
    return localPath;
  }

  private extFromMime(mimeType?: string): string | undefined {
    if (!mimeType) return undefined;
    const map: Record<string, string> = {
      // Audio types
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/ogg': 'ogg',
      'audio/flac': 'flac',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      // Image types
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/bmp': 'bmp',
    };
    return map[mimeType];
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
    const useMarkdown = message.format === 'markdown';

    // Handle attachments first
    if (message.attachments?.length) {
      for (const attachment of message.attachments) {
        await this.sendAttachment(chatId, attachment, useMarkdown, message.replyToMessageId);
      }
      // If there's also text beyond just attachment captions, send it
      if (message.text.trim()) {
        await this.sendText(chatId, message.text, useMarkdown, message.replyToMessageId);
      }
      return;
    }

    await this.sendText(chatId, message.text, useMarkdown, message.replyToMessageId);
  }

  private async sendAttachment(
    chatId: number,
    attachment: OutboundAttachment,
    useMarkdown: boolean,
    replyToMessageId?: string,
  ): Promise<void> {
    let fileSource: InputFile | undefined;

    if (attachment.localPath) {
      const buffer = await readFile(attachment.localPath);
      fileSource = new InputFile(buffer, attachment.fileName);
    } else if (attachment.data) {
      const buffer = Buffer.from(attachment.data, 'base64');
      fileSource = new InputFile(buffer, attachment.fileName);
    }

    if (!fileSource) {
      console.warn('[Telegram] Attachment has no localPath or data');
      return;
    }

    const caption = attachment.caption
      ? (useMarkdown ? escapeMarkdownV2(attachment.caption) : attachment.caption)
      : undefined;

    const replyTo = replyToMessageId ? Number(replyToMessageId) : undefined;

    switch (attachment.type) {
      case 'photo':
        await this.bot.api.sendPhoto(chatId, fileSource, {
          caption,
          parse_mode: useMarkdown && caption ? 'MarkdownV2' : undefined,
          reply_to_message_id: replyTo,
        });
        break;
      case 'document':
        await this.bot.api.sendDocument(chatId, fileSource, {
          caption,
          parse_mode: useMarkdown && caption ? 'MarkdownV2' : undefined,
          reply_to_message_id: replyTo,
        });
        break;
      case 'audio':
        await this.bot.api.sendAudio(chatId, fileSource, {
          caption,
          parse_mode: useMarkdown && caption ? 'MarkdownV2' : undefined,
          reply_to_message_id: replyTo,
        });
        break;
      case 'video':
        await this.bot.api.sendVideo(chatId, fileSource, {
          caption,
          parse_mode: useMarkdown && caption ? 'MarkdownV2' : undefined,
          reply_to_message_id: replyTo,
        });
        break;
    }
  }

  private async sendText(
    chatId: number,
    text: string,
    useMarkdown: boolean,
    replyToMessageId?: string,
  ): Promise<void> {
    const escapedText = useMarkdown ? escapeMarkdownV2(text) : text;

    // Telegram has 4096 char limit per message
    const MAX_LEN = 4096;
    if (escapedText.length <= MAX_LEN) {
      await this.bot.api.sendMessage(chatId, escapedText, {
        parse_mode: useMarkdown ? 'MarkdownV2' : undefined,
        reply_to_message_id: replyToMessageId ? Number(replyToMessageId) : undefined,
      });
    } else {
      // Split into chunks at newline boundaries where possible
      const chunks = this.splitMessage(escapedText, MAX_LEN);
      for (const chunk of chunks) {
        await this.bot.api.sendMessage(chatId, chunk, {
          parse_mode: useMarkdown ? 'MarkdownV2' : undefined,
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

/**
 * Escape text for Telegram MarkdownV2 format.
 *
 * MarkdownV2 requires these characters to be escaped with a preceding backslash
 * when they appear outside of formatting entities:
 *   _ * [ ] ( ) ~ ` > # + - = | { } . !
 *
 * The agent produces standard markdown, so we escape everything outside of
 * code blocks (``` ... ```) and inline code (` ... `), which Telegram renders
 * literally and where escaping would be visible.
 */
function escapeMarkdownV2(text: string): string {
  // Split on code fences and inline code to avoid escaping inside them.
  // Matches triple-backtick blocks first, then single-backtick spans.
  const parts = text.split(/(```[\s\S]*?```|`[^`]*`)/);
  return parts
    .map((part, i) => {
      // Odd indices are the captured code blocks/spans — leave them alone
      if (i % 2 === 1) return part;
      // Even indices are regular text — escape reserved characters
      return part.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    })
    .join('');
}
