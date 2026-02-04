import { z } from "zod";

export const UsageRecordSchema = z.object({
  timestamp: z.string(),
  workspaceId: z.string(),
  sessionId: z.string(),
  provider: z.string(),
  model: z.string(),
  agentName: z.string(),
  modelGroup: z.enum(["fast", "slow"]),
  tokens: z.object({
    input: z.number(),
    output: z.number(),
    total: z.number(),
  }),
  cost: z
    .object({
      input: z.number(),
      output: z.number(),
      total: z.number(),
    })
    .optional(),
  channelType: z.string().optional(),
});

export type UsageRecord = z.infer<typeof UsageRecordSchema>;

export const UsageSummarySchema = z.object({
  totals: z.object({
    tokens: z.object({ input: z.number(), output: z.number(), total: z.number() }),
    cost: z.object({ input: z.number(), output: z.number(), total: z.number() }),
    requests: z.number(),
  }),
  byModel: z.record(
    z.object({
      tokens: z.object({ input: z.number(), output: z.number(), total: z.number() }),
      cost: z.object({ input: z.number(), output: z.number(), total: z.number() }),
      requests: z.number(),
    }),
  ),
  byDay: z.record(
    z.object({
      tokens: z.object({ input: z.number(), output: z.number(), total: z.number() }),
      cost: z.object({ input: z.number(), output: z.number(), total: z.number() }),
      requests: z.number(),
    }),
  ),
  byAgent: z.record(
    z.object({
      tokens: z.object({ input: z.number(), output: z.number(), total: z.number() }),
      cost: z.object({ input: z.number(), output: z.number(), total: z.number() }),
      requests: z.number(),
    }),
  ),
});

export type UsageSummary = z.infer<typeof UsageSummarySchema>;
