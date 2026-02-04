import { z } from 'zod';

export interface ToolContext {
  workspace: { id: string; path: string };
  session: { id: string; workspaceId: string };
  permissions: {
    allowedTools: Set<string> | null;
    deniedTools: Set<string>;
    sandbox: boolean;
    workspacePath: string;
  };
  sendMessage: (channelType: string, msg: OutboundMessage) => Promise<void>;
}

export interface OutboundMessage {
  conversationId: string;
  text: string;
  replyToMessageId?: string;
  format?: 'text' | 'markdown';
}

export interface ScoobyToolDefinition<TInput extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: TInput;
  modelGroup?: 'fast' | 'slow';
  execute: (input: z.infer<TInput>, ctx: ToolContext) => Promise<string>;
}
