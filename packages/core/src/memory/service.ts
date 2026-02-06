import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MemoryStore, type SearchResult } from './store.js';
import { EmbeddingService } from './embeddings.js';
import { chunkText } from './chunker.js';

export interface MemoryServiceConfig {
  dbPath: string;
  embeddingConfig: { provider: string; model: string };
  dimensions?: number;
  minScore?: number;
  defaultLimit?: number;
}

export class MemoryService {
  private store: MemoryStore;
  private embeddings: EmbeddingService;
  private dimensions: number;
  private minScore: number;
  private defaultLimit: number;

  constructor(config: MemoryServiceConfig) {
    this.store = new MemoryStore(config.dbPath);
    this.embeddings = new EmbeddingService(config.embeddingConfig);
    this.dimensions = config.dimensions ?? 1536;
    this.minScore = config.minScore ?? 0.35;
    this.defaultLimit = config.defaultLimit ?? 6;
    this.store.ensureVectorTable(this.dimensions);
  }

  /**
   * Index a piece of content for a given workspace and source identifier.
   * Any previously stored chunks for the same source are replaced.
   * Returns the number of chunks created.
   */
  async index(workspaceId: string, source: string, content: string): Promise<number> {
    // Remove existing chunks for this source so we get a clean re-index
    this.store.deleteBySource(workspaceId, source);

    const chunks = chunkText(content);
    if (chunks.length === 0) return 0;

    // Embed all chunks in a single batch call
    const texts = chunks.map((c) => c.content);
    const embeddings = await this.embeddings.embedBatch(texts);

    for (let i = 0; i < chunks.length; i++) {
      this.store.insertChunk(
        {
          id: randomUUID(),
          workspaceId,
          source,
          content: chunks[i].content,
          chunkIndex: chunks[i].index,
        },
        embeddings[i],
      );
    }

    return chunks.length;
  }

  /**
   * Hybrid search across all indexed chunks in a workspace.
   * Results below `minScore` are filtered out.
   */
  async search(workspaceId: string, query: string, limit?: number): Promise<SearchResult[]> {
    const queryEmbedding = await this.embeddings.embedText(query);
    const results = this.store.hybridSearch(
      workspaceId,
      queryEmbedding,
      query,
      limit ?? this.defaultLimit,
    );
    return results.filter((r) => r.score >= this.minScore);
  }

  /**
   * Re-index every `.md` file found in the given directory.
   * Returns the total number of chunks created across all files.
   */
  async reindex(workspaceId: string, memoryDir: string): Promise<number> {
    let totalChunks = 0;

    try {
      const files = await readdir(memoryDir);
      const mdFiles = files.filter((f) => f.endsWith('.md'));
      const contents = await Promise.all(
        mdFiles.map((f) =>
          readFile(join(memoryDir, f), 'utf-8').then((content) => ({ file: f, content }))
        ),
      );
      for (const { file, content } of contents) {
        totalChunks += await this.index(workspaceId, file, content);
      }
    } catch {
      // Memory directory may not exist yet -- that is fine
    }

    return totalChunks;
  }

  /**
   * Convenience helper: search and format results as context strings
   * ready to inject into a prompt.
   */
  async getContextForPrompt(workspaceId: string, query: string): Promise<string[]> {
    const results = await this.search(workspaceId, query);
    return results.map((r) => `[${r.chunk.source}] ${r.chunk.content}`);
  }

  close(): void {
    this.store.close();
  }
}
