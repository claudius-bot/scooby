export interface Attachment {
  type: 'photo' | 'document' | 'audio' | 'video' | 'sticker';
  fileId?: string;
  url?: string;
  mimeType?: string;
  fileName?: string;
}

export interface InboundMessage {
  channelType: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Date;
  replyToMessageId?: string;
  attachments?: Attachment[];
  raw?: unknown;
}

export interface OutboundMessage {
  conversationId: string;
  text: string;
  replyToMessageId?: string;
  format?: 'text' | 'markdown';
}

export type MessageHandler = (msg: InboundMessage) => Promise<void>;

export interface ChannelAdapter {
  type: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: OutboundMessage): Promise<void>;
  onMessage(handler: MessageHandler): void;
}
