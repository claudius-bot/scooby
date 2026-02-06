/**
 * Model pricing in USD per 1M tokens.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o-2024-11-20': { input: 2.50, output: 10.00 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'gpt-image-1': { input: 5.00, output: 0.00 },
  'whisper-1': { input: 0.006, output: 0.00 }, // per minute, approximate
  // Anthropic
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
  'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  // Google
  'gemini-2.0-flash-preview-image-generation': { input: 0.10, output: 0.40 },
};

/**
 * Estimate cost for a given model and token counts.
 * Returns zero cost if the model isn't in the pricing table.
 */
export function estimateCost(
  model: string,
  tokens: { input: number; output: number },
): { input: number; output: number; total: number } {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return { input: 0, output: 0, total: 0 };
  }

  const inputCost = (tokens.input / 1_000_000) * pricing.input;
  const outputCost = (tokens.output / 1_000_000) * pricing.output;

  return {
    input: inputCost,
    output: outputCost,
    total: inputCost + outputCost,
  };
}
