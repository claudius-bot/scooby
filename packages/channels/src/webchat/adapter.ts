import { readFile } from 'node:fs/promises';
import type { ChannelAdapter, InboundMessage, OutboundMessage, OutboundAttachment, MessageHandler } from '../types.js';

export interface WebChatConnection {
  id: string;
  workspaceId: string;
  send(data: unknown): void;
}

export class WebChatAdapter implements ChannelAdapter {
  type = 'webchat' as const;
  outputFormat = 'markdown' as const;
  private handlers: MessageHandler[] = [];
  private connections = new Map<string, WebChatConnection>();

  async start(): Promise<void> {
    console.log('[WebChat] Adapter ready');
  }

  async stop(): Promise<void> {
    this.connections.clear();
  }

  async send(message: OutboundMessage): Promise<void> {
    // Find connection for this conversation
    const conn = this.connections.get(message.conversationId);
    if (!conn) {
      console.warn(`[WebChat] No connection for conversation ${message.conversationId}`);
      return;
    }

    // Prepare attachments with base64 data if they only have localPath
    const attachments = message.attachments
      ? await Promise.all(message.attachments.map(a => this.prepareAttachment(a)))
      : undefined;

    conn.send({
      event: 'chat.message',
      data: {
        conversationId: message.conversationId,
        text: message.text,
        format: message.format ?? 'text',
        attachments,
      },
    });
  }

  private async prepareAttachment(attachment: OutboundAttachment): Promise<{
    type: string;
    data?: string;
    mimeType?: string;
    fileName?: string;
    caption?: string;
  }> {
    let data = attachment.data;

    // If we have a local path but no base64 data, read the file
    if (!data && attachment.localPath) {
      const buffer = await readFile(attachment.localPath);
      data = buffer.toString('base64');
    }

    return {
      type: attachment.type,
      data,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
      caption: attachment.caption,
    };
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  // Called by gateway when a WebSocket message arrives
  async handleInbound(msg: InboundMessage): Promise<void> {
    for (const handler of this.handlers) {
      await handler(msg);
    }
  }

  // Called by gateway to register/unregister connections
  registerConnection(conn: WebChatConnection): void {
    this.connections.set(conn.id, conn);
  }

  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  // Send streaming event to a specific connection
  sendStreamEvent(conversationId: string, event: unknown): void {
    const conn = this.connections.get(conversationId);
    if (conn) {
      conn.send(event);
    }
  }
}
