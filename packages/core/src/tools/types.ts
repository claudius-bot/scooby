import { z } from 'zod';
import type { PermissionContext } from './permissions.js';
import type { MemoryService } from '../memory/service.js';
import type { MemorySearchProvider } from '../memory/search-provider.js';
import type { WorkspaceCronScheduler } from '../automation/scheduler.js';

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

export interface AgentRegistryRef {
  get(id: string): import('../workspace/types.js').AgentProfile | undefined;
  list(): import('../workspace/types.js').AgentProfile[];
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
  memoryService?: MemoryService;
  memoryProvider?: MemorySearchProvider;
  citationsEnabled?: boolean;
  cronScheduler?: WorkspaceCronScheduler;
  agentRegistry?: AgentRegistryRef;
  setSessionAgent?: (agentId: string) => Promise<void>;
  /**
   * Maximum characters allowed in a single tool result, derived from the
   * active model's context window.  Set by the AgentRunner before tool
   * execution begins.  The ToolRegistry caps results to this limit.
   */
  maxToolResultChars?: number;
}

export interface ScoobyToolDefinition<TInput extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: TInput;
  modelGroup?: 'fast' | 'slow';
  execute: (input: z.infer<TInput>, ctx: ToolContext) => Promise<string>;
}
