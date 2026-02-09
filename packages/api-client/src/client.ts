import { z } from 'zod';
import {
  WorkspaceSummarySchema,
  WorkspaceDetailSchema,
  AgentDetailSchema,
  AgentFilesSchema,
  SessionMetadataSchema,
  TranscriptEntrySchema,
  ToolSummarySchema,
  FileEntrySchema,
  SystemStatusSchema,
  WorkspaceCronEntrySchema,
  CronRunRecordSchema,
  UsageSummarySchema,
  type WorkspaceSummary,
  type WorkspaceDetail,
  type AgentDetail,
  type AgentFiles,
  type SessionMetadata,
  type TranscriptEntry,
  type ToolSummary,
  type FileEntry,
  type SystemStatus,
  type WorkspaceCronEntry,
  type CronRunRecord,
  type UsageSummary,
} from '@scooby/schemas';

// ── Response schemas (match the JSON envelope from the gateway) ───────

const WorkspacesResponseSchema = z.object({ workspaces: z.array(WorkspaceSummarySchema) });
const AgentsResponseSchema = z.object({ agents: z.array(AgentDetailSchema) });
const SessionsResponseSchema = z.object({ sessions: z.array(SessionMetadataSchema) });
const TranscriptResponseSchema = z.object({ transcript: z.array(TranscriptEntrySchema) });
const ToolsResponseSchema = z.object({ tools: z.array(ToolSummarySchema), universalTools: z.array(z.string()).default([]) });
const FilesResponseSchema = z.object({ files: z.array(FileEntrySchema) });
const MemoryFilesResponseSchema = z.object({ files: z.array(z.object({ name: z.string(), path: z.string(), size: z.number() })) });
const MemorySearchResponseSchema = z.object({ results: z.array(z.object({ source: z.string(), content: z.string(), score: z.number() })) });
const MemoryFileContentResponseSchema = z.object({ content: z.string() });
const ChannelBindingSchema = z.object({
  channelType: z.string(),
  conversationId: z.string(),
  workspaceId: z.string(),
  boundAt: z.string(),
});
const ChannelBindingsResponseSchema = z.object({ bindings: z.array(ChannelBindingSchema) });
const CronJobsResponseSchema = z.object({ jobs: z.array(WorkspaceCronEntrySchema) });
const CronHistoryResponseSchema = z.object({ history: z.array(CronRunRecordSchema) });
const FileContentResponseSchema = z.object({ content: z.string(), path: z.string() });
const OkResponseSchema = z.object({ ok: z.boolean() });
const WriteMemoryResponseSchema = z.object({ chunks: z.number() });
const HealthResponseSchema = z.object({ status: z.string(), timestamp: z.string() });

// Re-export response types for convenience
export type MemorySearchResult = { source: string; content: string; score: number };
export type MemoryFileInfo = { name: string; path: string; size: number };
export type FileContent = { content: string; path: string };
export type ChannelBinding = z.infer<typeof ChannelBindingSchema>;
export type HealthStatus = { status: string; timestamp: string };

// ── Client config ─────────────────────────────────────────────────────

export interface GatewayClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
}

// ── Error ─────────────────────────────────────────────────────────────

export class GatewayApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Gateway API error ${status}: ${typeof body === 'object' && body && 'error' in body ? (body as any).error : 'Unknown error'}`);
    this.name = 'GatewayApiError';
  }
}

// ── Internal fetch helper ─────────────────────────────────────────────

async function request<T>(
  config: GatewayClientConfig,
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const url = `${config.baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...config.headers,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new GatewayApiError(res.status, body);
  }

  const json = await res.json();
  return schema.parse(json);
}

// ── Typed client factory ──────────────────────────────────────────────

export function createGatewayClient(config: GatewayClientConfig) {
  const get = <T>(path: string, schema: z.ZodType<T>) =>
    request(config, path, schema);

  const post = <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    request(config, path, schema, {
      method: 'POST',
      body: body != null ? JSON.stringify(body) : undefined,
    });

  const put = <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    request(config, path, schema, {
      method: 'PUT',
      body: body != null ? JSON.stringify(body) : undefined,
    });

  const patch = <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    request(config, path, schema, {
      method: 'PATCH',
      body: body != null ? JSON.stringify(body) : undefined,
    });

  const del = <T>(path: string, schema: z.ZodType<T>) =>
    request(config, path, schema, { method: 'DELETE' });

  return {
    // ── Health ──────────────────────────────────────────────────────
    health: {
      check: () => get('/api/health', HealthResponseSchema),
    },

    // ── System ─────────────────────────────────────────────────────
    system: {
      status: () => get('/api/system/status', SystemStatusSchema),
    },

    // ── Agents ─────────────────────────────────────────────────────
    agents: {
      list: () => get('/api/agents', AgentsResponseSchema).then(r => r.agents),
      get: (id: string) => get(`/api/agents/${encodeURIComponent(id)}`, AgentDetailSchema),
      files: (id: string) => get(`/api/agents/${encodeURIComponent(id)}/files`, AgentFilesSchema),
      update: (id: string, updates: Record<string, unknown>) =>
        patch(`/api/agents/${encodeURIComponent(id)}`, OkResponseSchema, updates),
      updateFile: (id: string, fileName: string, content: string) =>
        put(`/api/agents/${encodeURIComponent(id)}/files/${encodeURIComponent(fileName)}`, OkResponseSchema, { content }),
    },

    // ── Tools ──────────────────────────────────────────────────────
    tools: {
      list: () => get('/api/tools', ToolsResponseSchema).then(r => ({ tools: r.tools, universalTools: r.universalTools })),
    },

    // ── Workspaces ─────────────────────────────────────────────────
    workspaces: {
      list: () => get('/api/workspaces', WorkspacesResponseSchema).then(r => r.workspaces),
      get: (id: string) => get(`/api/workspaces/${encodeURIComponent(id)}`, z.object({ id: z.string(), path: z.string(), agent: z.any() })),
      detail: (id: string) => get(`/api/workspaces/${encodeURIComponent(id)}/detail`, WorkspaceDetailSchema),
      usage: (id: string, days?: number) => {
        const q = days != null ? `?days=${days}` : '';
        return get(`/api/workspaces/${encodeURIComponent(id)}/usage${q}`, UsageSummarySchema);
      },
      updateConfig: (id: string, updates: Record<string, unknown>) =>
        patch(`/api/workspaces/${encodeURIComponent(id)}/config`, OkResponseSchema, updates),
    },

    // ── Sessions ───────────────────────────────────────────────────
    sessions: {
      list: (workspaceId: string) =>
        get(`/api/workspaces/${encodeURIComponent(workspaceId)}/sessions`, SessionsResponseSchema).then(r => r.sessions),
      get: (workspaceId: string, sessionId: string) =>
        get(`/api/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`, SessionMetadataSchema),
      transcript: (workspaceId: string, sessionId: string, limit?: number) => {
        const q = limit != null ? `?limit=${limit}` : '';
        return get(`/api/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/transcript${q}`, TranscriptResponseSchema).then(r => r.transcript);
      },
      archive: (workspaceId: string, sessionId: string) =>
        post(`/api/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/archive`, OkResponseSchema),
      setAgent: (workspaceId: string, sessionId: string, agentId: string) =>
        put(`/api/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/agent`, OkResponseSchema, { agentId }),
    },

    // ── Files ──────────────────────────────────────────────────────
    files: {
      list: (workspaceId: string, subpath?: string) => {
        const q = subpath ? `?path=${encodeURIComponent(subpath)}` : '';
        return get(`/api/workspaces/${encodeURIComponent(workspaceId)}/files${q}`, FilesResponseSchema).then(r => r.files);
      },
      read: (workspaceId: string, filePath: string) =>
        get(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/${filePath}`, FileContentResponseSchema),
      write: (workspaceId: string, filePath: string, content: string) =>
        put(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/${filePath}`, OkResponseSchema, { content }),
    },

    // ── Memory ─────────────────────────────────────────────────────
    memory: {
      search: (workspaceId: string, query: string, limit?: number) => {
        const params = new URLSearchParams({ q: query });
        if (limit != null) params.set('limit', String(limit));
        return get(`/api/workspaces/${encodeURIComponent(workspaceId)}/memory/search?${params}`, MemorySearchResponseSchema).then(r => r.results);
      },
      listFiles: (workspaceId: string) =>
        get(`/api/workspaces/${encodeURIComponent(workspaceId)}/memory/files`, MemoryFilesResponseSchema).then(r => r.files),
      readFile: (workspaceId: string, fileName: string) =>
        get(`/api/workspaces/${encodeURIComponent(workspaceId)}/memory/files/${encodeURIComponent(fileName)}`, MemoryFileContentResponseSchema).then(r => r.content),
      write: (workspaceId: string, source: string, content: string) =>
        post(`/api/workspaces/${encodeURIComponent(workspaceId)}/memory`, WriteMemoryResponseSchema, { source, content }),
      delete: (workspaceId: string, sourcePrefix: string) =>
        del(`/api/workspaces/${encodeURIComponent(workspaceId)}/memory/${encodeURIComponent(sourcePrefix)}`, OkResponseSchema),
    },

    // ── Channels ────────────────────────────────────────────────────
    channels: {
      bindings: (workspaceId: string) =>
        get(`/api/workspaces/${encodeURIComponent(workspaceId)}/channel-bindings`, ChannelBindingsResponseSchema).then(r => r.bindings),
    },

    // ── Cron ───────────────────────────────────────────────────────
    cron: {
      list: (workspaceId: string) =>
        get(`/api/workspaces/${encodeURIComponent(workspaceId)}/cron`, CronJobsResponseSchema).then(r => r.jobs),
      history: (workspaceId: string, limit?: number) => {
        const q = limit != null ? `?limit=${limit}` : '';
        return get(`/api/workspaces/${encodeURIComponent(workspaceId)}/cron/history${q}`, CronHistoryResponseSchema).then(r => r.history);
      },
      add: (workspaceId: string, job: Omit<WorkspaceCronEntry, 'state'>) =>
        post(`/api/workspaces/${encodeURIComponent(workspaceId)}/cron`, OkResponseSchema, job),
      remove: (workspaceId: string, jobId: string) =>
        del(`/api/workspaces/${encodeURIComponent(workspaceId)}/cron/${encodeURIComponent(jobId)}`, OkResponseSchema),
      trigger: (workspaceId: string, jobId: string) =>
        post(`/api/workspaces/${encodeURIComponent(workspaceId)}/cron/${encodeURIComponent(jobId)}/trigger`, OkResponseSchema),
    },
  } as const;
}

export type GatewayClient = ReturnType<typeof createGatewayClient>;
