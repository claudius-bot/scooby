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

// ── Delivery target (shared by cron + heartbeat) ─────────────────────
export const DeliveryTargetSchema = z.object({
  channel: z.string(),
  conversationId: z.string(),
});

export type DeliveryTarget = z.infer<typeof DeliveryTargetSchema>;

// ── Cron schedule (discriminated union) ──────────────────────────────
export const CronScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('every'), interval: z.string(), anchorMs: z.number().optional() }),
  z.object({ kind: z.literal('daily'), time: z.string() }),
  z.object({ kind: z.literal('cron'), expression: z.string() }),
  z.object({ kind: z.literal('at'), at: z.string() }),
]);

export type CronSchedule = z.infer<typeof CronScheduleSchema>;

// ── Per-workspace cron entry ─────────────────────────────────────────
export const CronJobStateSchema = z.object({
  nextRunAtMs: z.number().optional(),
  runningAtMs: z.number().optional(),
  lastStatus: z.enum(['success', 'error', 'skipped']).optional(),
});

export type CronJobState = z.infer<typeof CronJobStateSchema>;

export const WorkspaceCronEntrySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  agentId: z.string().optional(),
  schedule: CronScheduleSchema,
  prompt: z.string(),
  enabled: z.boolean().default(true),
  delivery: DeliveryTargetSchema.optional(),
  source: z.enum(['config', 'agent']).default('config'),
  createdAt: z.string().optional(),
  state: CronJobStateSchema.default({}),
});

export type WorkspaceCronEntry = z.infer<typeof WorkspaceCronEntrySchema>;

// ── Cron run history record ──────────────────────────────────────────
export const CronRunRecordSchema = z.object({
  jobId: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(['success', 'error', 'skipped']),
  response: z.string().optional(),
  error: z.string().optional(),
  delivered: z.boolean().default(false),
  sessionId: z.string().optional(),
  durationMs: z.number().optional(),
});

export type CronRunRecord = z.infer<typeof CronRunRecordSchema>;

// ── Active hours (for heartbeat) ─────────────────────────────────────
export const ActiveHoursSchema = z.object({
  start: z.string(),
  end: z.string(),
  timezone: z.string().default('UTC'),
});

export type ActiveHours = z.infer<typeof ActiveHoursSchema>;

// ── Per-workspace heartbeat config ───────────────────────────────────
export const WorkspaceHeartbeatConfigSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMinutes: z.number().default(30),
  delivery: DeliveryTargetSchema.optional(),
  activeHours: ActiveHoursSchema.optional(),
  suppressToken: z.string().default('HEARTBEAT_OK'),
});

export type WorkspaceHeartbeatConfig = z.infer<typeof WorkspaceHeartbeatConfigSchema>;

// ── Workspace entry ──────────────────────────────────────────────────
export const WorkspaceConfigSchema = z.object({
  id: z.string(),
  path: z.string(),
  defaultAgent: z.string().optional(),
  models: ModelsConfigSchema.optional(),
  telegram: z.object({ chatIds: z.array(z.number()) }).optional(),
  permissions: WorkspacePermissionsConfigSchema.optional(),
  cron: z.array(WorkspaceCronEntrySchema).optional(),
  heartbeat: WorkspaceHeartbeatConfigSchema.optional(),
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
  auth: z.object({
    token: z.string().optional(),
  }).optional(),
  http: z.object({
    endpoints: z.object({
      chatCompletions: z.object({
        enabled: z.boolean().default(false),
      }).optional(),
    }).optional(),
  }).optional(),
});

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

// ── Session ──────────────────────────────────────────────────────────
export const SessionConfigSchema = z.object({
  idleResetMinutes: z.number().default(30),
  dailyResetHour: z.number().optional(),
  maxTranscriptLines: z.number().default(500),
});

export type SessionConfig = z.infer<typeof SessionConfigSchema>;

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

// ── Skills config ───────────────────────────────────────────────────
export const SkillsConfigSchema = z.object({
  globalDir: z.string().optional(),
  entries: z.record(z.object({
    apiKey: z.string().optional(),
    env: z.record(z.string()).optional(),
  })).optional(),
}).optional();

export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

// ── Routing config ──────────────────────────────────────────────────
export const RoutingConfigSchema = z.object({
  model: z.string().optional(),
  prompt: z.string().optional(),
});

export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;

// ── Agents config ───────────────────────────────────────────────────
export const AgentsConfigSchema = z.object({
  dir: z.string().default('./agents'),
});

export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;

// ── Root config ──────────────────────────────────────────────────────
export const ScoobyConfigSchema = z.object({
  models: ModelsConfigSchema,
  workspaces: z.array(WorkspaceConfigSchema),
  channels: ChannelsConfigSchema.optional(),
  gateway: GatewayConfigSchema.optional(),
  aiGateway: AiGatewayConfigSchema.optional(),
  session: SessionConfigSchema.optional(),
  heartbeat: HeartbeatSettingsSchema.optional(),
  memory: MemoryConfigSchema.optional(),
  skills: SkillsConfigSchema,
  agents: AgentsConfigSchema.optional(),
  routing: RoutingConfigSchema.optional(),
  debug: z.boolean().default(false),
});

export type ScoobyConfig = z.infer<typeof ScoobyConfigSchema>;
