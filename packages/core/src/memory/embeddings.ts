import { embed, embedMany } from 'ai';
import { getEmbeddingModel } from '../ai/provider.js';

export interface EmbeddingConfig {
  provider: string;
  model: string;
}

export class EmbeddingService {
  private config: EmbeddingConfig;

  constructor(config: EmbeddingConfig) {
    this.config = config;
  }

  async embedText(text: string): Promise<number[]> {
    const model = getEmbeddingModel(this.config.provider, this.config.model);
    const result = await embed({ model, value: text });
    return result.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const model = getEmbeddingModel(this.config.provider, this.config.model);
    const result = await embedMany({ model, values: texts });
    return result.embeddings;
  }
}
