import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModelV1, EmbeddingModel } from 'ai';

type ProviderFactory = {
  languageModel(modelId: string): LanguageModelV1;
  embeddingModel?(modelId: string): EmbeddingModel<string>;
};

const providers = new Map<string, ProviderFactory>();

function getOrCreateProvider(name: string): ProviderFactory {
  const cached = providers.get(name);
  if (cached) return cached;

  let factory: ProviderFactory;

  switch (name) {
    case 'openai': {
      const openai = createOpenAI();
      factory = {
        languageModel: (modelId: string) => openai.languageModel(modelId),
        embeddingModel: (modelId: string) => openai.textEmbeddingModel(modelId),
      };
      break;
    }
    case 'anthropic': {
      const anthropic = createAnthropic();
      factory = {
        languageModel: (modelId: string) => anthropic.languageModel(modelId),
      };
      break;
    }
    default:
      throw new Error(`Unknown AI provider: "${name}". Supported providers: openai, anthropic`);
  }

  providers.set(name, factory);
  return factory;
}

export function getLanguageModel(provider: string, model: string): LanguageModelV1 {
  return getOrCreateProvider(provider).languageModel(model);
}

export function getEmbeddingModel(provider: string, model: string): EmbeddingModel<string> {
  const p = getOrCreateProvider(provider);
  if (!p.embeddingModel) {
    throw new Error(`Provider "${provider}" does not support embeddings`);
  }
  return p.embeddingModel(model);
}
