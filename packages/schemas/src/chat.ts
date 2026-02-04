import { z } from "zod";

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string(),
  workspaceId: z.string().optional(),
  sessionId: z.string().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
