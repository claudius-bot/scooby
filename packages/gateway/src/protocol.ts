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

// Method parameter types
export interface ChatSendParams {
  workspaceId: string;
  text: string;
  conversationId?: string;
}

export interface ChatHistoryParams {
  workspaceId: string;
  sessionId: string;
  limit?: number;
}

export interface SessionListParams {
  workspaceId: string;
}

export interface SessionGetParams {
  workspaceId: string;
  sessionId: string;
}

export interface SubscribeParams {
  topics: string[];
  workspaceId?: string;
}

export interface UnsubscribeParams {
  topics: string[];
}

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
