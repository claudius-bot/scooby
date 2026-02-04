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
