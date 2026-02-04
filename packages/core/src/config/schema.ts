import { z } from "zod";

// ── Model candidate ──────────────────────────────────────────────────
export const ModelCandidateSchema = z.object({
  provider: z.string(),
  model: z.string(),
  maxTokens: z.number().optional(),
});

export type ModelCandidate = z.infer<typeof ModelCandidateSchema>;

// ── Model group (fast / slow) ────────────────────────────────────────
export const ModelGroupSchema = z.object({
  candidates: z.array(ModelCandidateSchema),
});

export type ModelGroup = z.infer<typeof ModelGroupSchema>;

// ── Embedding reference ──────────────────────────────────────────────
export const EmbeddingModelSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

export type EmbeddingModel = z.infer<typeof EmbeddingModelSchema>;

// ── Top-level models block ───────────────────────────────────────────
export const ModelsConfigSchema = z.object({
  fast: ModelGroupSchema,
  slow: ModelGroupSchema,
  embedding: EmbeddingModelSchema.optional(),
});

export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;

// ── Workspace permissions ────────────────────────────────────────────
export const WorkspacePermissionsConfigSchema = z.object({
  allowedTools: z.array(z.string()).optional(),
  deniedTools: z.array(z.string()).optional(),
  sandbox: z.boolean().default(false),
});

export type WorkspacePermissionsConfig = z.infer<typeof WorkspacePermissionsConfigSchema>;

// ── Workspace entry ──────────────────────────────────────────────────
export const WorkspaceConfigSchema = z.object({
  id: z.string(),
  path: z.string(),
  activeAgent: z.string().optional(),
  models: ModelsConfigSchema.optional(),
  telegram: z.object({ chatIds: z.array(z.number()) }).optional(),
  permissions: WorkspacePermissionsConfigSchema.optional(),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

// ── Channels ─────────────────────────────────────────────────────────
export const ChannelsConfigSchema = z.object({
  telegram: z.object({ botToken: z.string() }).optional(),
  webchat: z.object({ enabled: z.boolean() }).optional(),
});

export type ChannelsConfig = z.infer<typeof ChannelsConfigSchema>;

// ── Gateway ──────────────────────────────────────────────────────────
export const GatewayConfigSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.number().default(3000),
  websocket: z.object({ path: z.string().default("/ws") }).optional(),
});

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

// ── Session ──────────────────────────────────────────────────────────
export const SessionConfigSchema = z.object({
  idleResetMinutes: z.number().default(30),
  dailyResetHour: z.number().optional(),
  maxTranscriptLines: z.number().default(500),
});

export type SessionConfig = z.infer<typeof SessionConfigSchema>;

// ── Cron entry ───────────────────────────────────────────────────────
export const CronEntrySchema = z.object({
  id: z.string(),
  workspace: z.string(),
  type: z.enum(["every", "at", "cron"]),
  schedule: z.string(),
  prompt: z.string(),
  enabled: z.boolean().default(true),
});

export type CronEntry = z.infer<typeof CronEntrySchema>;

// ── Heartbeat ────────────────────────────────────────────────────────
export const HeartbeatConfigSchema = z.object({
  intervalMinutes: z.number().default(5),
});

export type HeartbeatConfig = z.infer<typeof HeartbeatConfigSchema>;

// ── Root config ──────────────────────────────────────────────────────
export const ScoobyConfigSchema = z.object({
  models: ModelsConfigSchema,
  workspaces: z.array(WorkspaceConfigSchema),
  channels: ChannelsConfigSchema.optional(),
  gateway: GatewayConfigSchema.optional(),
  session: SessionConfigSchema.optional(),
  cron: z.array(CronEntrySchema).optional(),
  heartbeat: HeartbeatConfigSchema.optional(),
});

export type ScoobyConfig = z.infer<typeof ScoobyConfigSchema>;
