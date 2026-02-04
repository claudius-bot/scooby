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
