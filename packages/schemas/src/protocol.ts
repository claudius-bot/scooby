import { z } from "zod";

export const WsRequestSchema = z.object({
  id: z.string(),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

export type WsRequest = z.infer<typeof WsRequestSchema>;

export const WsResponseSchema = z.object({
  id: z.string(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export type WsResponse = z.infer<typeof WsResponseSchema>;

export const WsEventSchema = z.object({
  event: z.string(),
  data: z.unknown(),
});

export type WsEvent = z.infer<typeof WsEventSchema>;

/**
 * Parameters for the `subscribe` WebSocket method.
 */
export const SubscribeParamsSchema = z.object({
  topics: z.array(z.string()),
  workspaceId: z.string().optional(),
});

export type SubscribeParams = z.infer<typeof SubscribeParamsSchema>;

/**
 * Parameters for the `unsubscribe` WebSocket method.
 */
export const UnsubscribeParamsSchema = z.object({
  topics: z.array(z.string()),
});

export type UnsubscribeParams = z.infer<typeof UnsubscribeParamsSchema>;

/**
 * Known subscription topic names.
 */
export const SUBSCRIPTION_TOPICS = [
  'session.created',
  'session.archived',
  'session.agent-switched',
  'workspace.updated',
  'cron.executed',
  'system.health',
] as const;

export type SubscriptionTopic = (typeof SUBSCRIPTION_TOPICS)[number];
