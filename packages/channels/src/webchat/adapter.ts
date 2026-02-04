import type { ChannelAdapter, InboundMessage, OutboundMessage, MessageHandler } from '../types.js';

export interface WebChatConnection {
  id: string;
  workspaceId: string;
  send(data: unknown): void;
}

export class WebChatAdapter implements ChannelAdapter {
  type = 'webchat' as const;
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
    conn.send({
      event: 'chat.message',
      data: {
        conversationId: message.conversationId,
        text: message.text,
        format: message.format ?? 'text',
      },
    });
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
