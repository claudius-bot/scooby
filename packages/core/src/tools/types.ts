import { z } from 'zod';
import type { PermissionContext } from './permissions.js';

export interface OutboundAttachment {
  type: 'photo' | 'document' | 'audio' | 'video';
  localPath?: string;
  data?: string; // base64 encoded
  mimeType?: string;
  fileName?: string;
  caption?: string;
}

export interface OutboundMessage {
  conversationId: string;
  text: string;
  replyToMessageId?: string;
  format?: 'text' | 'markdown';
  attachments?: OutboundAttachment[];
}

export interface ToolContext {
  workspace: { id: string; path: string };
  session: { id: string; workspaceId: string };
  permissions: PermissionContext;
  conversation?: {
    channelType: string;
    conversationId: string;
  };
  sendMessage: (channelType: string, msg: OutboundMessage) => Promise<void>;
}

export interface ScoobyToolDefinition<TInput extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: TInput;
  modelGroup?: 'fast' | 'slow';
  execute: (input: z.infer<TInput>, ctx: ToolContext) => Promise<string>;
}
