import type { InboundMessage } from '@scooby/channels';
import type { ScoobyConfig } from '@scooby/core';

export interface RouteResult {
  workspaceId: string;
}

export class MessageRouter {
  // Telegram chatId -> workspaceId
  private telegramRoutes = new Map<string, string>();
  // Default workspace for unrouted messages
  private defaultWorkspaceId: string | null = null;

  constructor(config: ScoobyConfig) {
    // Build Telegram routing table from config
    for (const ws of config.workspaces) {
      if (ws.telegram?.chatIds) {
        for (const chatId of ws.telegram.chatIds) {
          this.telegramRoutes.set(String(chatId), ws.id);
        }
      }
    }

    // First workspace is the default
    if (config.workspaces.length > 0) {
      this.defaultWorkspaceId = config.workspaces[0].id;
    }
  }

  route(msg: InboundMessage): RouteResult | null {
    if (msg.channelType === 'telegram') {
      const workspaceId = this.telegramRoutes.get(msg.conversationId);
      if (workspaceId) return { workspaceId };
      // Fall through to default
    }

    if (msg.channelType === 'webchat') {
      // WebChat messages include workspace ID in the conversation ID
      // Format: workspaceId:sessionId
      const parts = msg.conversationId.split(':');
      if (parts.length >= 1 && parts[0]) {
        return { workspaceId: parts[0] };
      }
    }

    // Use default workspace
    if (this.defaultWorkspaceId) {
      return { workspaceId: this.defaultWorkspaceId };
    }

    return null;
  }
}
