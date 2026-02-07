import { z } from "zod";
import { AgentProfileSummarySchema } from "./agent.js";

export const WorkspaceSummarySchema = z.object({
  id: z.string(),
  agent: AgentProfileSummarySchema,
});

export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>;

/**
 * Detailed workspace info for the API.
 */
export const WorkspaceDetailSchema = z.object({
  id: z.string(),
  path: z.string(),
  agent: AgentProfileSummarySchema,
  defaultAgent: z.string().optional(),
  permissions: z.object({
    allowedTools: z.array(z.string()).nullable(),
    deniedTools: z.array(z.string()),
    sandbox: z.boolean(),
  }),
  heartbeat: z.object({
    enabled: z.boolean(),
    intervalMinutes: z.number().optional(),
  }).optional(),
  modelOverrides: z.record(z.unknown()).optional(),
});

export type WorkspaceDetail = z.infer<typeof WorkspaceDetailSchema>;
