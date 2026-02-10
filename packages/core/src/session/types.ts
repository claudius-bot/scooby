export interface SessionMetadata {
  id: string;
  workspaceId: string;
  channelType: string;
  conversationId: string;
  createdAt: string;          // ISO 8601
  lastActiveAt: string;       // ISO 8601
  messageCount: number;
  status: 'active' | 'idle' | 'archived';
  agentId?: string;
}

export type TranscriptContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; path: string; mediaType?: string };

export interface TranscriptEntry {
  timestamp: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | TranscriptContentPart[];
  metadata?: {
    toolName?: string;
    toolCallId?: string;
    modelUsed?: string;
    modelGroup?: 'fast' | 'slow';
    tokenUsage?: { prompt: number; completion: number };
    escalated?: boolean;
    escalationReason?: string;
    /** Agent that generated this message */
    agentId?: string;
    agentName?: string;
    /** Where the message originated, e.g. 'cron' for scheduled task delivery */
    source?: string;
    cronJobId?: string;
    cronJobName?: string;
  };
}

export type SessionKey = string;  // `${channelType}:${conversationId}`

export function makeSessionKey(channelType: string, conversationId: string): SessionKey {
  return `${channelType}:${conversationId}`;
}
