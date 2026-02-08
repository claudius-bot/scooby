import { z } from "zod";

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * A tiered pricing bracket (e.g. first 32k tokens at one rate, next 96k at another).
 */
export const PricingTierSchema = z.object({
  /** Cost per token as a decimal string */
  cost: z.string(),
  /** Lower bound of the tier (inclusive), in tokens */
  min: z.number(),
  /** Upper bound of the tier (exclusive), in tokens. Absent for the final tier. */
  max: z.number().optional(),
});

export type PricingTier = z.infer<typeof PricingTierSchema>;

/**
 * Token and image pricing for a model.
 * All cost values are decimal strings representing USD per token (or per image).
 */
export const ModelPricingSchema = z.object({
  /** Cost per input token */
  input: z.string().optional(),
  /** Cost per output token */
  output: z.string().optional(),
  /** Cost per image (image-generation models) */
  image: z.string().optional(),
  /** Cost per cached-read input token */
  input_cache_read: z.string().optional(),
  /** Cost per cache-write input token */
  input_cache_write: z.string().optional(),
  /** Cost per web search invocation */
  web_search: z.string().optional(),
  /** Tiered input pricing by context length */
  input_tiers: z.array(PricingTierSchema).optional(),
  /** Tiered output pricing by context length */
  output_tiers: z.array(PricingTierSchema).optional(),
  /** Tiered cache-read pricing */
  input_cache_read_tiers: z.array(PricingTierSchema).optional(),
  /** Tiered cache-write pricing */
  input_cache_write_tiers: z.array(PricingTierSchema).optional(),
});

export type ModelPricing = z.infer<typeof ModelPricingSchema>;

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export const ModelTypeSchema = z.enum(["language", "embedding", "image"]);
export type ModelType = z.infer<typeof ModelTypeSchema>;

export const ModelTagSchema = z.enum([
  "reasoning",
  "tool-use",
  "vision",
  "file-input",
  "implicit-caching",
  "image-generation",
]);
export type ModelTag = z.infer<typeof ModelTagSchema>;

/**
 * A model entry from the Vercel AI Gateway `/v1/models` endpoint.
 */
export const ModelSchema = z.object({
  /** Unique model identifier, e.g. "anthropic/claude-sonnet-4" */
  id: z.string(),
  /** Object type (always "model") */
  object: z.literal("model"),
  /** Unix timestamp of when this entry was created */
  created: z.number(),
  /** Provider slug, e.g. "anthropic", "openai" */
  owned_by: z.string(),
  /** Human-readable display name, e.g. "Claude Sonnet 4" */
  name: z.string(),
  /** Description of capabilities */
  description: z.string(),
  /** Maximum input context window in tokens */
  context_window: z.number(),
  /** Maximum output tokens */
  max_tokens: z.number(),
  /** Model category */
  type: ModelTypeSchema,
  /** Capability tags */
  tags: z.array(z.string()).default([]),
  /** Pricing information */
  pricing: ModelPricingSchema,
});

export type Model = z.infer<typeof ModelSchema>;

/**
 * The full response shape from `/v1/models`.
 */
export const ModelsResponseSchema = z.object({
  object: z.literal("list").optional(),
  data: z.array(ModelSchema),
});

export type ModelsResponse = z.infer<typeof ModelsResponseSchema>;
