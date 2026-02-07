import { z } from "zod";

/**
 * Public-facing subset of an agent's profile, used in API responses,
 * WebSocket events, and the web app.
 */
export const AgentProfileSummarySchema = z.object({
  name: z.string(),
  vibe: z.string(),
  emoji: z.string(),
  avatar: z.string(),
});

export type AgentProfileSummary = z.infer<typeof AgentProfileSummarySchema>;

/**
 * Schema for an agent definition file (agent.json) in standalone agents/.
 */
export const AgentDefinitionSchema = z.object({
  name: z.string(),
  id: z.string(),
  emoji: z.string(),
  avatar: z.string().default(''),
  about: z.string(),
  model: z.string().default('fast'),
  fallbackModel: z.string().optional(),
  tools: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  universal: z.boolean().default(true),
});

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
