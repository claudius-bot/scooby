import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGateway, type LanguageModel, type EmbeddingModel } from 'ai';

type ProviderFactory = {
  languageModel(modelId: string): LanguageModel;
  embeddingModel?(modelId: string): EmbeddingModel;
};

const providers = new Map<string, ProviderFactory>();

// Gateway config set at startup
let gatewayConfig: { apiKey?: string; baseURL?: string } | undefined;

export function setAiGatewayConfig(config: { apiKey?: string; baseURL?: string } | undefined): void {
  gatewayConfig = config;
  // Clear cached gateway provider so it picks up new config
  providers.delete('gateway');
}

function getOrCreateProvider(name: string): ProviderFactory {
  const cached = providers.get(name);
  if (cached) return cached;

  let factory: ProviderFactory;

  switch (name) {
    case 'openai': {
      const openai = createOpenAI();
      factory = {
        languageModel: (modelId: string) => openai.languageModel(modelId),
        embeddingModel: (modelId: string) => openai.embeddingModel(modelId),
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
    case 'gateway': {
      const gw = createGateway({
        apiKey: gatewayConfig?.apiKey ?? process.env.AI_GATEWAY_API_KEY,
        ...(gatewayConfig?.baseURL ? { baseURL: gatewayConfig.baseURL } : {}),
      });
      factory = {
        languageModel: (modelId: string) => gw.languageModel(modelId),
        embeddingModel: (modelId: string) => gw.embeddingModel(modelId),
      };
      break;
    }
    default:
      throw new Error(`Unknown AI provider: "${name}". Supported providers: openai, anthropic, gateway`);
  }

  providers.set(name, factory);
  return factory;
}

export function getLanguageModel(provider: string, model: string): LanguageModel {
  return getOrCreateProvider(provider).languageModel(model);
}

export function getEmbeddingModel(provider: string, model: string): EmbeddingModel {
  const p = getOrCreateProvider(provider);
  if (!p.embeddingModel) {
    throw new Error(`Provider "${provider}" does not support embeddings`);
  }
  return p.embeddingModel(model);
}
