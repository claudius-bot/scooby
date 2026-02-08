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

/**
 * Detailed agent info for API responses (extends AgentDefinition with runtime data).
 */
export const AgentDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string(),
  avatar: z.string(),
  about: z.string(),
  model: z.string(),
  fallbackModel: z.string().optional(),
  tools: z.array(z.string()),
  skills: z.array(z.string()),
  universal: z.boolean(),
});

export type AgentDetail = z.infer<typeof AgentDetailSchema>;

export const AgentFilesSchema = z.object({
  identity: z.string(),
  soul: z.string(),
  tools: z.string(),
});
export type AgentFiles = z.infer<typeof AgentFilesSchema>;

export const AgentUpdateSchema = z.object({
  name: z.string().optional(),
  emoji: z.string().optional(),
  about: z.string().optional(),
  model: z.string().optional(),
  fallbackModel: z.string().nullable().optional(),
  tools: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  universal: z.boolean().optional(),
});
export type AgentUpdate = z.infer<typeof AgentUpdateSchema>;
