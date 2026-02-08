import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { InboundMessage } from '@scooby/channels';
import type { ScoobyConfig } from '@scooby/core';

export interface RouteResult {
  workspaceId: string;
  /** Whether this is an explicitly bound route (not a default fallback). */
  explicit: boolean;
}

interface ChannelBinding {
  channelType: string;
  conversationId: string;
  workspaceId: string;
  boundAt: string;
}

export class MessageRouter {
  // Telegram chatId -> workspaceId (from config)
  private telegramRoutes = new Map<string, string>();
  // Dynamic bindings: `${channelType}:${conversationId}` -> workspaceId
  private dynamicBindings = new Map<string, string>();
  // Default workspace for unrouted messages
  private defaultWorkspaceId: string | null = null;
  // Path to persist bindings (optional)
  private bindingsPath: string | null = null;

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

  /**
   * Set path for persisting dynamic bindings.
   */
  setBindingsPath(path: string): void {
    this.bindingsPath = path;
  }

  /**
   * Load dynamic bindings from disk.
   */
  async loadBindings(): Promise<void> {
    if (!this.bindingsPath) return;

    try {
      const data = await readFile(this.bindingsPath, 'utf-8');
      const bindings: ChannelBinding[] = JSON.parse(data);
      for (const binding of bindings) {
        const key = `${binding.channelType}:${binding.conversationId}`;
        this.dynamicBindings.set(key, binding.workspaceId);
      }
      console.log(`[Router] Loaded ${bindings.length} channel bindings`);
    } catch {
      // File doesn't exist or is invalid, start fresh
    }
  }

  /**
   * Save dynamic bindings to disk.
   */
  private async saveBindings(): Promise<void> {
    if (!this.bindingsPath) return;

    const bindings: ChannelBinding[] = [];
    for (const [key, workspaceId] of this.dynamicBindings) {
      const [channelType, ...rest] = key.split(':');
      const conversationId = rest.join(':');
      bindings.push({
        channelType,
        conversationId,
        workspaceId,
        boundAt: new Date().toISOString(),
      });
    }

    try {
      await mkdir(dirname(this.bindingsPath), { recursive: true });
      await writeFile(this.bindingsPath, JSON.stringify(bindings, null, 2));
    } catch (err) {
      console.error('[Router] Failed to save bindings:', err);
    }
  }

  /**
   * Bind a channel to a workspace dynamically.
   */
  async bindChannel(channelType: string, conversationId: string, workspaceId: string): Promise<void> {
    const key = `${channelType}:${conversationId}`;
    this.dynamicBindings.set(key, workspaceId);
    await this.saveBindings();
    console.log(`[Router] Bound ${channelType}:${conversationId} to workspace ${workspaceId}`);
  }

  /**
   * Check if a channel has an explicit binding (config or dynamic).
   */
  hasExplicitBinding(channelType: string, conversationId: string): boolean {
    // Check dynamic bindings
    const key = `${channelType}:${conversationId}`;
    if (this.dynamicBindings.has(key)) {
      return true;
    }

    // Check config-based bindings
    if (channelType === 'telegram') {
      return this.telegramRoutes.has(conversationId);
    }

    // WebChat always has explicit binding (workspace in conversation ID)
    if (channelType === 'webchat') {
      return true;
    }

    return false;
  }

  /**
   * Return all known channel bindings (config + dynamic) for a given workspace.
   */
  getBindingsForWorkspace(workspaceId: string): ChannelBinding[] {
    const results: ChannelBinding[] = [];

    // Config-based Telegram bindings
    for (const [chatId, wsId] of this.telegramRoutes) {
      if (wsId === workspaceId) {
        results.push({ channelType: 'telegram', conversationId: chatId, workspaceId: wsId, boundAt: '' });
      }
    }

    // Dynamic bindings
    for (const [key, wsId] of this.dynamicBindings) {
      if (wsId !== workspaceId) continue;
      const [channelType, ...rest] = key.split(':');
      const conversationId = rest.join(':');
      // Skip if already covered by config
      if (results.some(b => b.channelType === channelType && b.conversationId === conversationId)) continue;
      results.push({ channelType, conversationId, workspaceId: wsId, boundAt: '' });
    }

    return results;
  }

  route(msg: InboundMessage): RouteResult | null {
    // Check dynamic bindings first
    const key = `${msg.channelType}:${msg.conversationId}`;
    const dynamicWorkspace = this.dynamicBindings.get(key);
    if (dynamicWorkspace) {
      return { workspaceId: dynamicWorkspace, explicit: true };
    }

    if (msg.channelType === 'telegram') {
      const workspaceId = this.telegramRoutes.get(msg.conversationId);
      if (workspaceId) return { workspaceId, explicit: true };
      // Fall through to default
    }

    if (msg.channelType === 'webchat') {
      // WebChat messages include workspace ID in the conversation ID
      // Format: workspaceId:sessionId
      const parts = msg.conversationId.split(':');
      if (parts.length >= 1 && parts[0]) {
        return { workspaceId: parts[0], explicit: true };
      }
    }

    // Use default workspace (not an explicit binding)
    if (this.defaultWorkspaceId) {
      return { workspaceId: this.defaultWorkspaceId, explicit: false };
    }

    return null;
  }
}
