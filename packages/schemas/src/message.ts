import { z } from "zod";

/**
 * A message sent from the agent / system to a channel.
 */
export const OutboundMessageSchema = z.object({
  conversationId: z.string(),
  text: z.string(),
  replyToMessageId: z.string().optional(),
  format: z.enum(["text", "markdown"]).optional(),
});

export type OutboundMessage = z.infer<typeof OutboundMessageSchema>;

/**
 * Attachment on an inbound message.
 */
export const AttachmentSchema = z.object({
  type: z.enum(["photo", "document", "audio", "video", "sticker", "voice"]),
  fileId: z.string().optional(),
  url: z.string().optional(),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
  localPath: z.string().optional(),
  duration: z.number().optional(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

/**
 * A message received from a channel.
 */
export const InboundMessageSchema = z.object({
  channelType: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  text: z.string(),
  timestamp: z.coerce.date(),
  replyToMessageId: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
  raw: z.unknown().optional(),
});

export type InboundMessage = z.infer<typeof InboundMessageSchema>;
