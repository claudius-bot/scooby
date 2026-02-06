import { z } from "zod";

// ── Model candidate ──────────────────────────────────────────────────
export const ModelCandidateSchema = z.object({
  provider: z.string(),
  model: z.string(),
  maxTokens: z.number().optional(),
});

export type ModelCandidate = z.infer<typeof ModelCandidateSchema>;

// ── Model group (fast / slow) ────────────────────────────────────────
export const ModelGroupConfigSchema = z.object({
  candidates: z.array(ModelCandidateSchema),
});

export type ModelGroupConfig = z.infer<typeof ModelGroupConfigSchema>;

// ── Embedding reference ──────────────────────────────────────────────
export const EmbeddingModelConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

export type EmbeddingModelConfig = z.infer<typeof EmbeddingModelConfigSchema>;

// ── Top-level models block ───────────────────────────────────────────
export const ModelsConfigSchema = z.object({
  fast: ModelGroupConfigSchema,
  slow: ModelGroupConfigSchema,
  embedding: EmbeddingModelConfigSchema.optional(),
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
export const HeartbeatSettingsSchema = z.object({
  intervalMinutes: z.number().default(5),
});

export type HeartbeatSettings = z.infer<typeof HeartbeatSettingsSchema>;

// ── AI Gateway (Vercel) ─────────────────────────────────────────────
export const AiGatewayConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
});

export type AiGatewayConfig = z.infer<typeof AiGatewayConfigSchema>;

// ── QMD config ──────────────────────────────────────────────────────
export const QmdConfigSchema = z.object({
  command: z.string().default('qmd'),
  includeDefaultMemory: z.boolean().default(true),
  paths: z.array(z.object({
    path: z.string(),
    name: z.string().optional(),
    pattern: z.string().optional(),
  })).default([]),
  sessions: z.object({
    enabled: z.boolean().default(false),
    retentionDays: z.number().optional(),
  }).default({}),
  update: z.object({
    debounceMs: z.number().default(15000),
    embedIntervalMs: z.number().default(3600000),
    onBoot: z.boolean().default(true),
  }).default({}),
  limits: z.object({
    maxResults: z.number().default(6),
    maxSnippetChars: z.number().default(700),
    maxInjectedChars: z.number().default(4000),
    timeoutMs: z.number().default(4000),
  }).default({}),
  scope: z.object({
    dmOnly: z.boolean().default(true),
  }).default({}),
});

export type QmdConfig = z.infer<typeof QmdConfigSchema>;

// ── Memory config ───────────────────────────────────────────────────
export const MemoryConfigSchema = z.object({
  backend: z.enum(['builtin', 'qmd']).default('builtin'),
  citations: z.enum(['auto', 'on', 'off']).default('auto'),
  qmd: QmdConfigSchema.optional(),
});

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

// ── Root config ──────────────────────────────────────────────────────
export const ScoobyConfigSchema = z.object({
  models: ModelsConfigSchema,
  workspaces: z.array(WorkspaceConfigSchema),
  channels: ChannelsConfigSchema.optional(),
  gateway: GatewayConfigSchema.optional(),
  aiGateway: AiGatewayConfigSchema.optional(),
  session: SessionConfigSchema.optional(),
  cron: z.array(CronEntrySchema).optional(),
  heartbeat: HeartbeatSettingsSchema.optional(),
  memory: MemoryConfigSchema.optional(),
});

export type ScoobyConfig = z.infer<typeof ScoobyConfigSchema>;
