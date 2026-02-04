import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

interface ChannelAccessEntry {
  channelType: string;
  conversationId: string;
  workspaceIds: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Tracks which channels have access to which workspaces.
 * A channel can have access to multiple workspaces but can only
 * be connected to one at a time (for message routing).
 */
export class ChannelAccessStore {
  // channelKey -> Set of workspace IDs the channel has access to
  private access = new Map<string, Set<string>>();
  private persistPath: string | null = null;

  /**
   * Set the path for persisting access data.
   */
  setPath(path: string): void {
    this.persistPath = path;
  }

  /**
   * Load access data from disk.
   */
  async load(): Promise<void> {
    if (!this.persistPath) return;

    try {
      const data = await readFile(this.persistPath, 'utf-8');
      const entries: ChannelAccessEntry[] = JSON.parse(data);
      for (const entry of entries) {
        const key = this.makeKey(entry.channelType, entry.conversationId);
        this.access.set(key, new Set(entry.workspaceIds));
      }
      console.log(`[ChannelAccess] Loaded access for ${entries.length} channels`);
    } catch {
      // File doesn't exist or is invalid, start fresh
    }
  }

  /**
   * Save access data to disk.
   */
  private async save(): Promise<void> {
    if (!this.persistPath) return;

    const entries: ChannelAccessEntry[] = [];
    const now = new Date().toISOString();

    for (const [key, workspaceIds] of this.access) {
      const [channelType, ...rest] = key.split(':');
      const conversationId = rest.join(':');
      entries.push({
        channelType,
        conversationId,
        workspaceIds: Array.from(workspaceIds),
        createdAt: now,
        updatedAt: now,
      });
    }

    try {
      await mkdir(dirname(this.persistPath), { recursive: true });
      await writeFile(this.persistPath, JSON.stringify(entries, null, 2));
    } catch (err) {
      console.error('[ChannelAccess] Failed to save:', err);
    }
  }

  /**
   * Grant a channel access to a workspace.
   */
  async grantAccess(channelType: string, conversationId: string, workspaceId: string): Promise<void> {
    const key = this.makeKey(channelType, conversationId);
    let workspaces = this.access.get(key);
    if (!workspaces) {
      workspaces = new Set();
      this.access.set(key, workspaces);
    }
    workspaces.add(workspaceId);
    await this.save();
  }

  /**
   * Revoke a channel's access to a workspace.
   */
  async revokeAccess(channelType: string, conversationId: string, workspaceId: string): Promise<void> {
    const key = this.makeKey(channelType, conversationId);
    const workspaces = this.access.get(key);
    if (workspaces) {
      workspaces.delete(workspaceId);
      if (workspaces.size === 0) {
        this.access.delete(key);
      }
      await this.save();
    }
  }

  /**
   * Check if a channel has access to a workspace.
   */
  hasAccess(channelType: string, conversationId: string, workspaceId: string): boolean {
    const key = this.makeKey(channelType, conversationId);
    const workspaces = this.access.get(key);
    return workspaces?.has(workspaceId) ?? false;
  }

  /**
   * Get all workspace IDs a channel has access to.
   */
  getAccessibleWorkspaces(channelType: string, conversationId: string): string[] {
    const key = this.makeKey(channelType, conversationId);
    const workspaces = this.access.get(key);
    return workspaces ? Array.from(workspaces) : [];
  }

  /**
   * Get all channels that have access to a workspace.
   */
  getChannelsWithAccess(workspaceId: string): Array<{ channelType: string; conversationId: string }> {
    const channels: Array<{ channelType: string; conversationId: string }> = [];
    for (const [key, workspaces] of this.access) {
      if (workspaces.has(workspaceId)) {
        const [channelType, ...rest] = key.split(':');
        channels.push({ channelType, conversationId: rest.join(':') });
      }
    }
    return channels;
  }

  private makeKey(channelType: string, conversationId: string): string {
    return `${channelType}:${conversationId}`;
  }
}
