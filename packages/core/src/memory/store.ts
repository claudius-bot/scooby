import Database from 'better-sqlite3';

export interface MemoryChunk {
  id: string;
  workspaceId: string;
  source: string;
  content: string;
  chunkIndex: number;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  chunk: MemoryChunk;
  score: number;
  matchType: 'vector' | 'keyword' | 'hybrid';
}

export class MemoryStore {
  private db: Database.Database;
  private vecAvailable = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sqliteVec = require('sqlite-vec');
      sqliteVec.load(this.db);
      this.vecAvailable = true;
    } catch {
      // sqlite-vec not available — vector search will be disabled
    }
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source TEXT NOT NULL,
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON chunks(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(workspace_id, source);
    `);

    // FTS5 for keyword search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        content,
        content_rowid='rowid',
        tokenize='porter'
      );
    `);
  }

  /**
   * Create the sqlite-vec virtual table once the embedding dimensions are known.
   */
  ensureVectorTable(dimensions: number): void {
    if (!this.vecAvailable) return;
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunk_embeddings USING vec0(
          chunk_id TEXT PRIMARY KEY,
          embedding float[${dimensions}]
        );
      `);
    } catch {
      // Table may already exist with the correct schema
    }
  }

  insertChunk(chunk: MemoryChunk, embedding: number[]): void {
    const insertChunkStmt = this.db.prepare(`
      INSERT OR REPLACE INTO chunks (id, workspace_id, source, content, chunk_index, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertFts = this.db.prepare(`
      INSERT OR REPLACE INTO chunks_fts (rowid, content)
      VALUES ((SELECT rowid FROM chunks WHERE id = ?), ?)
    `);

    const transaction = this.db.transaction(() => {
      insertChunkStmt.run(
        chunk.id,
        chunk.workspaceId,
        chunk.source,
        chunk.content,
        chunk.chunkIndex,
        chunk.metadata ? JSON.stringify(chunk.metadata) : null,
      );
      insertFts.run(chunk.id, chunk.content);

      if (this.vecAvailable) {
        const insertVec = this.db.prepare(`
          INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding)
          VALUES (?, ?)
        `);
        insertVec.run(chunk.id, new Float32Array(embedding));
      }
    });

    transaction();
  }

  deleteBySource(workspaceId: string, source: string): void {
    const chunks = this.db
      .prepare('SELECT id FROM chunks WHERE workspace_id = ? AND source = ?')
      .all(workspaceId, source) as Array<{ id: string }>;

    const deleteChunkStmt = this.db.prepare('DELETE FROM chunks WHERE id = ?');

    const transaction = this.db.transaction(() => {
      for (const c of chunks) {
        deleteChunkStmt.run(c.id);
        if (this.vecAvailable) {
          this.db.prepare('DELETE FROM chunk_embeddings WHERE chunk_id = ?').run(c.id);
        }
      }
    });

    transaction();
  }

  deleteBySourcePrefix(workspaceId: string, sourcePrefix: string): void {
    const chunks = this.db
      .prepare('SELECT id FROM chunks WHERE workspace_id = ? AND source LIKE ?')
      .all(workspaceId, `${sourcePrefix}%`) as Array<{ id: string }>;

    const deleteChunkStmt = this.db.prepare('DELETE FROM chunks WHERE id = ?');

    const transaction = this.db.transaction(() => {
      for (const c of chunks) {
        deleteChunkStmt.run(c.id);
        if (this.vecAvailable) {
          this.db.prepare('DELETE FROM chunk_embeddings WHERE chunk_id = ?').run(c.id);
        }
      }
    });

    transaction();
  }

  vectorSearch(workspaceId: string, embedding: number[], limit: number = 6): SearchResult[] {
    if (!this.vecAvailable) return [];

    const rows = this.db
      .prepare(
        `SELECT ce.chunk_id, ce.distance,
                c.workspace_id, c.source, c.content, c.chunk_index, c.metadata
         FROM chunk_embeddings ce
         JOIN chunks c ON c.id = ce.chunk_id
         WHERE c.workspace_id = ?
         ORDER BY ce.embedding <-> ?
         LIMIT ?`,
      )
      .all(workspaceId, new Float32Array(embedding), limit) as Array<{
      chunk_id: string;
      distance: number;
      workspace_id: string;
      source: string;
      content: string;
      chunk_index: number;
      metadata: string | null;
    }>;

    return rows.map((r) => ({
      chunk: {
        id: r.chunk_id,
        workspaceId: r.workspace_id,
        source: r.source,
        content: r.content,
        chunkIndex: r.chunk_index,
        metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : undefined,
      },
      score: 1 - r.distance,
      matchType: 'vector' as const,
    }));
  }

  private sanitizeFtsQuery(query: string): string {
    // Remove FTS5 special characters and wrap each word in double quotes
    const words = query
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);
    if (words.length === 0) return '""';
    return words.map((w) => `"${w}"`).join(' ');
  }

  keywordSearch(workspaceId: string, query: string, limit: number = 6): SearchResult[] {
    const sanitized = this.sanitizeFtsQuery(query);
    const rows = this.db
      .prepare(
        `SELECT c.id, c.workspace_id, c.source, c.content, c.chunk_index, c.metadata,
                bm25(chunks_fts) as rank
         FROM chunks_fts f
         JOIN chunks c ON c.rowid = f.rowid
         WHERE chunks_fts MATCH ? AND c.workspace_id = ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(sanitized, workspaceId, limit) as Array<{
      id: string;
      workspace_id: string;
      source: string;
      content: string;
      chunk_index: number;
      metadata: string | null;
      rank: number;
    }>;

    return rows.map((r) => ({
      chunk: {
        id: r.id,
        workspaceId: r.workspace_id,
        source: r.source,
        content: r.content,
        chunkIndex: r.chunk_index,
        metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : undefined,
      },
      score: Math.abs(r.rank),
      matchType: 'keyword' as const,
    }));
  }

  hybridSearch(
    workspaceId: string,
    embedding: number[],
    query: string,
    limit: number = 6,
  ): SearchResult[] {
    const vectorResults = this.vectorSearch(workspaceId, embedding, limit * 2);
    const keywordResults = this.keywordSearch(workspaceId, query, limit * 2);

    // Weighted merge: 70% vector + 30% keyword
    const merged = new Map<string, SearchResult>();

    // Normalize vector scores
    const maxVecScore = Math.max(...vectorResults.map((r) => r.score), 0.001);
    for (const r of vectorResults) {
      const normalizedScore = (r.score / maxVecScore) * 0.7;
      merged.set(r.chunk.id, { ...r, score: normalizedScore, matchType: 'hybrid' });
    }

    // Normalize keyword scores and merge
    const maxKwScore = Math.max(...keywordResults.map((r) => r.score), 0.001);
    for (const r of keywordResults) {
      const normalizedScore = (r.score / maxKwScore) * 0.3;
      const existing = merged.get(r.chunk.id);
      if (existing) {
        existing.score += normalizedScore;
      } else {
        merged.set(r.chunk.id, { ...r, score: normalizedScore, matchType: 'hybrid' });
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  close(): void {
    this.db.close();
  }
}
