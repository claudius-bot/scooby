import { z } from "zod";
import { AgentProfileSummarySchema } from "./agent.js";

export const WorkspaceSummarySchema = z.object({
  id: z.string(),
  agent: AgentProfileSummarySchema,
});

export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>;
