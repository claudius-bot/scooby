import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export interface DynamicWorkspaceInfo {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  createdBy?: {
    channelType: string;
    conversationId: string;
  };
}

/**
 * Manages dynamically created workspaces.
 */
export class WorkspaceManager {
  private workspaces = new Map<string, DynamicWorkspaceInfo>();
  private persistPath: string | null = null;
  private baseWorkspacesDir: string;

  constructor(baseWorkspacesDir: string) {
    this.baseWorkspacesDir = baseWorkspacesDir;
  }

  /**
   * Set the path for persisting workspace metadata.
   */
  setPath(path: string): void {
    this.persistPath = path;
  }

  /**
   * Load workspace metadata from disk.
   */
  async load(): Promise<void> {
    if (!this.persistPath) return;

    try {
      const data = await readFile(this.persistPath, 'utf-8');
      const entries: DynamicWorkspaceInfo[] = JSON.parse(data);
      for (const entry of entries) {
        this.workspaces.set(entry.id, entry);
      }
      console.log(`[WorkspaceManager] Loaded ${entries.length} dynamic workspaces`);
    } catch {
      // File doesn't exist or is invalid, start fresh
    }
  }

  /**
   * Save workspace metadata to disk.
   */
  private async save(): Promise<void> {
    if (!this.persistPath) return;

    const entries = Array.from(this.workspaces.values());

    try {
      await mkdir(dirname(this.persistPath), { recursive: true });
      await writeFile(this.persistPath, JSON.stringify(entries, null, 2));
    } catch (err) {
      console.error('[WorkspaceManager] Failed to save:', err);
    }
  }

  /**
   * Create a new workspace with the given name.
   * Returns the workspace info.
   */
  async createWorkspace(
    name: string,
    createdBy?: { channelType: string; conversationId: string }
  ): Promise<DynamicWorkspaceInfo> {
    // Generate a URL-safe ID from the name
    const baseId = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Ensure uniqueness by adding a suffix if needed
    let id = baseId;
    let counter = 1;
    while (this.workspaces.has(id) || await this.workspacePathExists(id)) {
      id = `${baseId}-${counter}`;
      counter++;
    }

    const workspacePath = join(this.baseWorkspacesDir, id);

    // Create workspace directory structure
    await this.createWorkspaceStructure(workspacePath, name);

    const info: DynamicWorkspaceInfo = {
      id,
      name,
      path: workspacePath,
      createdAt: new Date().toISOString(),
      createdBy,
    };

    this.workspaces.set(id, info);
    await this.save();

    console.log(`[WorkspaceManager] Created workspace "${name}" (${id})`);
    return info;
  }

  /**
   * Get info about a dynamic workspace.
   */
  getWorkspace(id: string): DynamicWorkspaceInfo | undefined {
    return this.workspaces.get(id);
  }

  /**
   * Get all dynamic workspaces.
   */
  listWorkspaces(): DynamicWorkspaceInfo[] {
    return Array.from(this.workspaces.values());
  }

  /**
   * Find a workspace by name (case-insensitive).
   */
  findByName(name: string): DynamicWorkspaceInfo | undefined {
    const lowerName = name.toLowerCase();
    for (const ws of this.workspaces.values()) {
      if (ws.name.toLowerCase() === lowerName) {
        return ws;
      }
    }
    return undefined;
  }

  /**
   * Check if a workspace ID exists.
   */
  has(id: string): boolean {
    return this.workspaces.has(id);
  }

  private async workspacePathExists(id: string): Promise<boolean> {
    const path = join(this.baseWorkspacesDir, id);
    try {
      await readFile(join(path, 'IDENTITY.md'));
      return true;
    } catch {
      return false;
    }
  }

  private async createWorkspaceStructure(workspacePath: string, name: string): Promise<void> {
    // Create required directories
    const dirs = [
      workspacePath,
      join(workspacePath, 'sessions'),
      join(workspacePath, 'sessions', 'transcripts'),
      join(workspacePath, 'data'),
      join(workspacePath, 'memory'),
    ];

    await Promise.all(dirs.map((d) => mkdir(d, { recursive: true })));

    // Create minimal IDENTITY.md
    const identityContent = `---
name: "${name}"
vibe: friendly assistant
emoji: "🤖"
avatar: ""
---

You are ${name}, a helpful AI assistant.
`;

    await writeFile(join(workspacePath, 'IDENTITY.md'), identityContent);
  }
}
