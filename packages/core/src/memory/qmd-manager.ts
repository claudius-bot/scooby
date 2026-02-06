import { execFile } from 'node:child_process';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join, resolve, normalize, relative, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import type { QmdConfig } from '../config/schema.js';
import type { TranscriptEntry } from '../session/types.js';
import type { MemorySearchProvider, MemorySearchResult } from './search-provider.js';
import { sessionToMarkdown } from './session-export.js';

const execFileAsync = promisify(execFile);

export interface QmdManagerConfig {
  workspaceId: string;
  workspacePath: string;
  qmdConfig: QmdConfig;
}

interface CollectionInfo {
  name: string;
  path: string;
}

/**
 * QMD-backed memory search provider.
 * Shells out to the `qmd` CLI for collection management, update, embed, and query.
 */
export class QmdMemoryManager implements MemorySearchProvider {
  readonly backendName = 'qmd';

  private xdgConfigDir: string;
  private xdgCacheDir: string;
  private sessionsDir: string;
  private qmdCommand: string;
  private config: QmdConfig;
  private workspaceId: string;
  private workspacePath: string;

  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private embedInterval: ReturnType<typeof setInterval> | null = null;
  private lastEmbedTime = 0;
  private docDb: Database.Database | null = null;
  private collectionPaths = new Map<string, string>();

  private constructor(managerConfig: QmdManagerConfig) {
    this.workspaceId = managerConfig.workspaceId;
    this.workspacePath = managerConfig.workspacePath;
    this.config = managerConfig.qmdConfig;
    this.qmdCommand = this.config.command ?? 'qmd';
    this.xdgConfigDir = join(managerConfig.workspacePath, 'data', 'qmd', 'xdg-config');
    this.xdgCacheDir = join(managerConfig.workspacePath, 'data', 'qmd', 'xdg-cache');
    this.sessionsDir = join(managerConfig.workspacePath, 'data', 'qmd', 'sessions');
  }

  /**
   * Creates and initializes a QmdMemoryManager.
   * Returns null if QMD is not available or initialization fails.
   */
  static async create(config: QmdManagerConfig): Promise<QmdMemoryManager | null> {
    const mgr = new QmdMemoryManager(config);
    try {
      await mgr.setupDirs();
      const available = await mgr.checkQmdAvailable();
      if (!available) {
        console.warn(`[Scooby] qmd command not found, QMD backend unavailable`);
        return null;
      }
      await mgr.bootstrapCollections();
      if (config.qmdConfig.update?.onBoot !== false) {
        await mgr.runUpdate().catch(err =>
          console.warn(`[Scooby] QMD initial update failed:`, err));
      }
      // Start embed interval
      const embedIntervalMs = config.qmdConfig.update?.embedIntervalMs ?? 3600000;
      if (embedIntervalMs > 0) {
        mgr.embedInterval = setInterval(() => {
          mgr.runEmbed().catch(err =>
            console.error(`[Scooby] QMD embed error:`, err));
        }, embedIntervalMs);
      }
      return mgr;
    } catch (err) {
      console.error(`[Scooby] QMD initialization failed:`, err);
      return null;
    }
  }

  private async setupDirs(): Promise<void> {
    await mkdir(this.xdgConfigDir, { recursive: true });
    await mkdir(this.xdgCacheDir, { recursive: true });
    await mkdir(this.sessionsDir, { recursive: true });
  }

  private async checkQmdAvailable(): Promise<boolean> {
    try {
      await this.exec(['--version'], 5000);
      return true;
    } catch {
      return false;
    }
  }

  private async bootstrapCollections(): Promise<void> {
    // Get existing collections
    let existing: string[] = [];
    try {
      const { stdout } = await this.exec(['collection', 'list', '--json']);
      const parsed = JSON.parse(stdout);
      existing = Array.isArray(parsed) ? parsed.map((c: any) => c.name ?? c) : [];
    } catch {
      // No existing collections
    }

    const toAdd: Array<{ path: string; name: string; pattern?: string }> = [];

    // Default: memory/ dir
    if (this.config.includeDefaultMemory !== false) {
      const memoryDir = resolve(this.workspacePath, 'memory');
      await mkdir(memoryDir, { recursive: true });
      toAdd.push({ path: memoryDir, name: 'memory', pattern: '**/*.md' });
    }

    // Extra configured paths
    for (const p of this.config.paths ?? []) {
      const absPath = isAbsolute(p.path) ? p.path : resolve(this.workspacePath, p.path);
      toAdd.push({ path: absPath, name: p.name ?? p.path, pattern: p.pattern });
    }

    // Sessions dir if enabled
    if (this.config.sessions?.enabled) {
      toAdd.push({ path: this.sessionsDir, name: 'sessions', pattern: '**/*.md' });
    }

    for (const col of toAdd) {
      if (existing.includes(col.name)) {
        this.collectionPaths.set(col.name, col.path);
        continue;
      }
      try {
        const args = ['collection', 'add', col.path, '--name', col.name];
        if (col.pattern) {
          args.push('--mask', col.pattern);
        }
        await this.exec(args);
        this.collectionPaths.set(col.name, col.path);
      } catch (err) {
        console.warn(`[Scooby] Failed to add QMD collection "${col.name}":`, err);
      }
    }
  }

  private async exec(
    args: string[],
    timeoutMs?: number,
  ): Promise<{ stdout: string; stderr: string }> {
    const timeout = timeoutMs ?? this.config.limits?.timeoutMs ?? 4000;
    const env = {
      ...process.env,
      XDG_CONFIG_HOME: this.xdgConfigDir,
      XDG_CACHE_HOME: this.xdgCacheDir,
    };
    try {
      const { stdout, stderr } = await execFileAsync(this.qmdCommand, args, {
        timeout,
        env,
        maxBuffer: 1024 * 1024,
      });
      return { stdout, stderr };
    } catch (err: any) {
      throw new Error(
        `qmd ${args[0]} failed: ${err.stderr || err.message}`,
      );
    }
  }

  private async runUpdate(): Promise<void> {
    await this.exec(['update'], 30000);
    // Clear doc cache after update
    this.closeDocDb();
  }

  private async runEmbed(): Promise<void> {
    const now = Date.now();
    const embedIntervalMs = this.config.update?.embedIntervalMs ?? 3600000;
    if (now - this.lastEmbedTime < embedIntervalMs) return;
    await this.exec(['embed'], 60000);
    this.lastEmbedTime = now;
  }

  private getDocDb(): Database.Database {
    if (!this.docDb) {
      const dbPath = join(this.xdgCacheDir, 'qmd', 'qmd.db');
      this.docDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    }
    return this.docDb;
  }

  private closeDocDb(): void {
    if (this.docDb) {
      this.docDb.close();
      this.docDb = null;
    }
  }

  private resolveDocPath(docid: string): { collection: string; path: string } | null {
    try {
      const db = this.getDocDb();
      const row = db.prepare(
        'SELECT collection, path FROM documents WHERE hash = ? AND active = 1',
      ).get(docid) as { collection: string; path: string } | undefined;
      if (!row) return null;
      return { collection: row.collection, path: row.path };
    } catch {
      return null;
    }
  }

  async search(
    _workspaceId: string,
    query: string,
    limit?: number,
  ): Promise<MemorySearchResult[]> {
    const maxResults = limit ?? this.config.limits?.maxResults ?? 6;
    const maxSnippetChars = this.config.limits?.maxSnippetChars ?? 700;

    const { stdout } = await this.exec(
      ['query', query, '--json', '-n', String(maxResults)],
    );

    let results: any[];
    try {
      results = JSON.parse(stdout);
      if (!Array.isArray(results)) results = [];
    } catch {
      return [];
    }

    const mapped: MemorySearchResult[] = [];
    let totalChars = 0;
    const maxInjectedChars = this.config.limits?.maxInjectedChars ?? 4000;

    for (const r of results) {
      const content = typeof r.snippet === 'string'
        ? r.snippet.slice(0, maxSnippetChars)
        : typeof r.content === 'string'
          ? r.content.slice(0, maxSnippetChars)
          : '';

      if (totalChars + content.length > maxInjectedChars) break;
      totalChars += content.length;

      const docInfo = r.docid ? this.resolveDocPath(r.docid) : null;
      const source = docInfo
        ? `${docInfo.collection}/${docInfo.path}`
        : r.source ?? r.docid ?? 'unknown';

      const result: MemorySearchResult = {
        source,
        content,
        score: typeof r.score === 'number' ? r.score : 0.5,
        matchType: 'qmd',
      };

      if (docInfo) {
        result.citation = {
          path: `qmd/${source}`,
          startLine: typeof r.line === 'number' ? r.line : undefined,
        };
      }

      mapped.push(result);
    }

    return mapped;
  }

  async getContextForPrompt(
    workspaceId: string,
    query: string,
  ): Promise<string[]> {
    const results = await this.search(workspaceId, query);
    return results.map(r => `[${r.source}] ${r.content}`);
  }

  async index(
    _workspaceId: string,
    _source: string,
    _content: string,
  ): Promise<number> {
    // QMD manages its own indexing — trigger an update cycle
    this.triggerUpdate();
    return 0;
  }

  deleteBySourcePrefix(_workspaceId: string, _sourcePrefix: string): void {
    // QMD manages deletions via its own file-watching — trigger update
    this.triggerUpdate();
  }

  async reindex(_workspaceId: string, _memoryDir: string): Promise<number> {
    await this.runUpdate();
    return 0;
  }

  async readFile(relPath: string, workspacePath: string): Promise<string | null> {
    // relPath looks like "qmd/<collection>/<file path>"
    const stripped = relPath.replace(/^qmd\//, '');
    const slashIdx = stripped.indexOf('/');
    if (slashIdx === -1) return null;

    const collectionName = stripped.slice(0, slashIdx);
    const filePath = stripped.slice(slashIdx + 1);

    // Resolve collection root
    const collectionRoot = this.collectionPaths.get(collectionName);
    if (!collectionRoot) return null;

    const fullPath = resolve(collectionRoot, filePath);
    const normalizedFull = normalize(fullPath);
    const normalizedRoot = normalize(collectionRoot);

    // Path traversal check — must stay within collection root
    if (!normalizedFull.startsWith(normalizedRoot)) return null;

    // Additional check: must also stay within workspace
    const normalizedWorkspace = normalize(workspacePath);
    if (!normalizedFull.startsWith(normalizedWorkspace)) return null;

    try {
      return await readFile(fullPath, 'utf-8');
    } catch {
      return null;
    }
  }

  async exportSession(
    sessionId: string,
    entries: TranscriptEntry[],
  ): Promise<void> {
    const md = sessionToMarkdown(sessionId, entries);
    const filePath = join(this.sessionsDir, `${sessionId}.md`);
    await writeFile(filePath, md, 'utf-8');
    this.triggerUpdate();
  }

  triggerUpdate(): void {
    const debounceMs = this.config.update?.debounceMs ?? 15000;
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => {
      this.runUpdate().catch(err =>
        console.error('[Scooby] QMD debounced update failed:', err));
    }, debounceMs);
  }

  close(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    if (this.embedInterval) {
      clearInterval(this.embedInterval);
      this.embedInterval = null;
    }
    this.closeDocDb();
  }
}
