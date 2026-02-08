import { z } from 'zod';

// JSON-RPC-like protocol
export interface WsRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface WsResponse {
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface WsEvent {
  event: string;
  data: unknown;
}

// Methods
export type WsMethod =
  | 'chat.send'
  | 'chat.history'
  | 'session.list'
  | 'session.get'
  | 'workspace.list'
  | 'workspace.get'
  | 'subscribe'
  | 'unsubscribe';

// ── Method parameter schemas ─────────────────────────────────────────────

export const ChatSendAttachmentSchema = z.object({
  name: z.string(),
  type: z.string(),
  dataUrl: z.string(),
});

export const ChatSendParamsSchema = z.object({
  workspaceId: z.string(),
  text: z.string(),
  conversationId: z.string().optional(),
  attachments: z.array(ChatSendAttachmentSchema).optional(),
});

export const ChatHistoryParamsSchema = z.object({
  workspaceId: z.string(),
  sessionId: z.string(),
  limit: z.number().optional(),
});

export const SessionListParamsSchema = z.object({
  workspaceId: z.string(),
});

export const SessionGetParamsSchema = z.object({
  workspaceId: z.string(),
  sessionId: z.string(),
});

export const SubscribeParamsSchema = z.object({
  topics: z.array(z.string()),
  workspaceId: z.string().optional(),
});

export const UnsubscribeParamsSchema = z.object({
  topics: z.array(z.string()),
});

// ── Inferred types ───────────────────────────────────────────────────────

export type ChatSendAttachment = z.infer<typeof ChatSendAttachmentSchema>;
export type ChatSendParams = z.infer<typeof ChatSendParamsSchema>;
export type ChatHistoryParams = z.infer<typeof ChatHistoryParamsSchema>;
export type SessionListParams = z.infer<typeof SessionListParamsSchema>;
export type SessionGetParams = z.infer<typeof SessionGetParamsSchema>;
export type SubscribeParams = z.infer<typeof SubscribeParamsSchema>;
export type UnsubscribeParams = z.infer<typeof UnsubscribeParamsSchema>;

// Event types pushed by server
export type ServerEvent =
  | 'chat.text-delta'
  | 'chat.tool-call'
  | 'chat.tool-result'
  | 'chat.done'
  | 'chat.error'
  | 'chat.model-switch'
  | 'chat.message'
  | 'session.created'
  | 'session.archived'
  | 'session.agent-switched'
  | 'workspace.updated'
  | 'cron.executed'
  | 'system.health';

/**
 * Known subscription topic names for wildcard expansion.
 */
export const SUBSCRIPTION_TOPICS = [
  'session.created',
  'session.archived',
  'session.agent-switched',
  'workspace.updated',
  'cron.executed',
  'system.health',
] as const;

export function createResponse(id: string, result: unknown): WsResponse {
  return { id, result };
}

export function createError(id: string, code: number, message: string): WsResponse {
  return { id, error: { code, message } };
}

export function createEvent(event: string, data: unknown): WsEvent {
  return { event, data };
}

export function parseMessage(raw: string): WsRequest | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.id && parsed.method) return parsed as WsRequest;
    return null;
  } catch {
    return null;
  }
}
