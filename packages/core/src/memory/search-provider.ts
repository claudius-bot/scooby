import type { TranscriptEntry } from '../session/types.js';
import type { MemoryService } from './service.js';

export interface MemorySearchResult {
  source: string;
  content: string;
  score: number;
  matchType: 'vector' | 'keyword' | 'hybrid' | 'qmd';
  citation?: { path: string; startLine?: number; endLine?: number };
}

export interface MemorySearchProvider {
  readonly backendName: string;
  search(workspaceId: string, query: string, limit?: number): Promise<MemorySearchResult[]>;
  getContextForPrompt(workspaceId: string, query: string): Promise<string[]>;
  index(workspaceId: string, source: string, content: string): Promise<number>;
  deleteBySourcePrefix(workspaceId: string, sourcePrefix: string): void;
  reindex(workspaceId: string, memoryDir: string): Promise<number>;
  readFile?(relPath: string, workspacePath: string): Promise<string | null>;
  exportSession?(sessionId: string, entries: TranscriptEntry[]): Promise<void>;
  triggerUpdate?(): void;
  close(): void;
}

/**
 * Adapter wrapping the existing MemoryService as a MemorySearchProvider.
 */
export class BuiltinSearchProvider implements MemorySearchProvider {
  readonly backendName = 'builtin';

  constructor(private service: MemoryService) {}

  async search(workspaceId: string, query: string, limit?: number): Promise<MemorySearchResult[]> {
    const results = await this.service.search(workspaceId, query, limit);
    return results.map(r => ({
      source: r.chunk.source,
      content: r.chunk.content,
      score: r.score,
      matchType: 'hybrid' as const,
    }));
  }

  async getContextForPrompt(workspaceId: string, query: string): Promise<string[]> {
    return this.service.getContextForPrompt(workspaceId, query);
  }

  async index(workspaceId: string, source: string, content: string): Promise<number> {
    return this.service.index(workspaceId, source, content);
  }

  deleteBySourcePrefix(workspaceId: string, sourcePrefix: string): void {
    this.service.deleteBySourcePrefix(workspaceId, sourcePrefix);
  }

  async reindex(workspaceId: string, memoryDir: string): Promise<number> {
    return this.service.reindex(workspaceId, memoryDir);
  }

  close(): void {
    this.service.close();
  }
}

/**
 * Wraps a primary provider (e.g. QMD) with a fallback (e.g. builtin).
 * On the first failure of the primary, permanently switches to the fallback.
 */
export class FallbackSearchProvider implements MemorySearchProvider {
  private failed = false;

  get backendName(): string {
    return this.failed ? this.fallback.backendName : this.primary.backendName;
  }

  constructor(
    private primary: MemorySearchProvider,
    private fallback: MemorySearchProvider,
  ) {}

  async search(workspaceId: string, query: string, limit?: number): Promise<MemorySearchResult[]> {
    if (this.failed) return this.fallback.search(workspaceId, query, limit);
    try {
      return await this.primary.search(workspaceId, query, limit);
    } catch (err) {
      this.switchToFallback(err);
      return this.fallback.search(workspaceId, query, limit);
    }
  }

  async getContextForPrompt(workspaceId: string, query: string): Promise<string[]> {
    if (this.failed) return this.fallback.getContextForPrompt(workspaceId, query);
    try {
      return await this.primary.getContextForPrompt(workspaceId, query);
    } catch (err) {
      this.switchToFallback(err);
      return this.fallback.getContextForPrompt(workspaceId, query);
    }
  }

  async index(workspaceId: string, source: string, content: string): Promise<number> {
    // Write to both so fallback has data if primary fails later
    const fallbackResult = await this.fallback.index(workspaceId, source, content);
    if (!this.failed) {
      try {
        await this.primary.index(workspaceId, source, content);
      } catch {
        // Primary index failure is non-fatal — fallback still indexed
      }
    }
    return fallbackResult;
  }

  deleteBySourcePrefix(workspaceId: string, sourcePrefix: string): void {
    this.fallback.deleteBySourcePrefix(workspaceId, sourcePrefix);
    if (!this.failed) {
      try {
        this.primary.deleteBySourcePrefix(workspaceId, sourcePrefix);
      } catch {
        // Non-fatal
      }
    }
  }

  async reindex(workspaceId: string, memoryDir: string): Promise<number> {
    const result = await this.fallback.reindex(workspaceId, memoryDir);
    if (!this.failed) {
      try {
        await this.primary.reindex(workspaceId, memoryDir);
      } catch {
        // Non-fatal
      }
    }
    return result;
  }

  get readFile() {
    const active = this.failed ? this.fallback : this.primary;
    return active.readFile?.bind(active);
  }

  get exportSession() {
    const active = this.failed ? this.fallback : this.primary;
    return active.exportSession?.bind(active);
  }

  triggerUpdate(): void {
    if (!this.failed) this.primary.triggerUpdate?.();
  }

  close(): void {
    this.primary.close();
    this.fallback.close();
  }

  private switchToFallback(err: unknown): void {
    this.failed = true;
    console.error('[Scooby] Primary memory provider failed, switching to fallback:', err);
  }
}
