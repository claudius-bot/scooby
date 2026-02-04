import { z } from "zod";

export const SessionMetadataSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  channelType: z.string(),
  conversationId: z.string(),
  createdAt: z.string(),
  lastActiveAt: z.string(),
  messageCount: z.number(),
  status: z.enum(["active", "idle", "archived"]),
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

export const TranscriptEntrySchema = z.object({
  timestamp: z.string(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
  metadata: z
    .object({
      toolName: z.string().optional(),
      toolCallId: z.string().optional(),
      modelUsed: z.string().optional(),
      modelGroup: z.enum(["fast", "slow"]).optional(),
      tokenUsage: z
        .object({ prompt: z.number(), completion: z.number() })
        .optional(),
    })
    .optional(),
});

export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;
