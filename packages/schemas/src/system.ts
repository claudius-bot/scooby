import { z } from "zod";

/**
 * Summary of a registered tool, exposed via the API.
 */
export const ToolSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
  modelGroup: z.enum(["fast", "slow"]).optional(),
});

export type ToolSummary = z.infer<typeof ToolSummarySchema>;

/**
 * A file or directory entry in a workspace listing.
 */
export const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "directory"]),
  size: z.number(),
  modifiedAt: z.string(),
});

export type FileEntry = z.infer<typeof FileEntrySchema>;

/**
 * Aggregated system status snapshot.
 */
export const SystemStatusSchema = z.object({
  uptime: z.number(),
  activeConnections: z.number(),
  workspaceCount: z.number(),
  activeSessionCount: z.number(),
  channels: z.array(z.string()),
  models: z.object({
    fast: z.array(z.string()),
    slow: z.array(z.string()),
  }),
});

export type SystemStatus = z.infer<typeof SystemStatusSchema>;
