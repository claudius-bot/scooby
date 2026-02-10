'use client';

import {
  createContext,
  useContext,
  createElement,
  type ReactNode,
} from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
  type UseQueryOptions,
  type UseQueryResult,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';
import { createGatewayClient, type GatewayClient, type GatewayClientConfig } from './client.js';

// ── Context ───────────────────────────────────────────────────────────

const GatewayContext = createContext<GatewayClient | null>(null);

function useClient(): GatewayClient {
  const client = useContext(GatewayContext);
  if (!client) throw new Error('useGateway must be used within a <GatewayProvider>');
  return client;
}

// ── Provider ──────────────────────────────────────────────────────────

export interface GatewayProviderProps {
  config: GatewayClientConfig;
  queryClient?: QueryClient;
  children: ReactNode;
}

export function GatewayProvider({ config, queryClient, children }: GatewayProviderProps) {
  const client = createGatewayClient(config);
  const qc = queryClient ?? new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1 },
    },
  });

  return createElement(
    GatewayContext.Provider,
    { value: client },
    createElement(QueryClientProvider, { client: qc }, children),
  );
}

// ── Helper types ──────────────────────────────────────────────────────

type QueryOpts<T> = Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>;
type MutOpts<TData, TInput> = Omit<UseMutationOptions<TData, Error, TInput>, 'mutationFn'>;

// ── Hook factory: query with no parameters ────────────────────────────

function q<T>(
  keyFn: () => unknown[],
  fetcher: (client: GatewayClient) => Promise<T>,
): (opts?: QueryOpts<T>) => UseQueryResult<T, Error> {
  return (opts?) => {
    const client = useClient();
    return useQuery<T, Error>({
      queryKey: keyFn(),
      queryFn: () => fetcher(client),
      ...opts,
    });
  };
}

// ── Hook factory: query with parameters ───────────────────────────────

function qParam<TParam, T>(
  keyFn: (p: TParam) => unknown[],
  fetcher: (client: GatewayClient, p: TParam) => Promise<T>,
): (params: TParam, opts?: QueryOpts<T>) => UseQueryResult<T, Error> {
  return (params, opts?) => {
    const client = useClient();
    return useQuery<T, Error>({
      queryKey: keyFn(params),
      queryFn: () => fetcher(client, params),
      ...opts,
    });
  };
}

// ── Hook factory: mutation ────────────────────────────────────────────

function m<TData, TInput>(
  mutationFn: (client: GatewayClient, input: TInput) => Promise<TData>,
): (opts?: MutOpts<TData, TInput>) => UseMutationResult<TData, Error, TInput> {
  return (opts?) => {
    const client = useClient();
    return useMutation<TData, Error, TInput>({
      mutationFn: (input) => mutationFn(client, input),
      ...opts,
    });
  };
}

// ── Infer return types from client methods ────────────────────────────

type Awaited_<T> = T extends Promise<infer U> ? U : T;
type ClientReturn<K extends keyof GatewayClient, M extends keyof GatewayClient[K]> =
  GatewayClient[K][M] extends (...args: any[]) => infer R ? Awaited_<R> : never;

// ── useGateway ────────────────────────────────────────────────────────
// tRPC-style hook tree: useGateway.workspaces.list(), etc.

export const useGateway = {
  // ── Health ────────────────────────────────────────────────────────
  health: {
    check: q<ClientReturn<'health', 'check'>>(
      () => ['health'],
      (c) => c.health.check(),
    ),
  },

  // ── System ───────────────────────────────────────────────────────
  system: {
    status: q<ClientReturn<'system', 'status'>>(
      () => ['system', 'status'],
      (c) => c.system.status(),
    ),
  },

  // ── Agents ───────────────────────────────────────────────────────
  agents: {
    list: q<ClientReturn<'agents', 'list'>>(
      () => ['agents'],
      (c) => c.agents.list(),
    ),
    get: qParam<{ id: string }, ClientReturn<'agents', 'get'>>(
      (p) => ['agents', p.id],
      (c, p) => c.agents.get(p.id),
    ),
    files: qParam<{ id: string }, ClientReturn<'agents', 'files'>>(
      (p) => ['agents', p.id, 'files'],
      (c, p) => c.agents.files(p.id),
    ),
    update: m<ClientReturn<'agents', 'update'>, { id: string; updates: Record<string, unknown> }>(
      (c, input) => c.agents.update(input.id, input.updates),
    ),
    updateFile: m<ClientReturn<'agents', 'updateFile'>, { id: string; fileName: string; content: string }>(
      (c, input) => c.agents.updateFile(input.id, input.fileName, input.content),
    ),
  },

  // ── Tools ────────────────────────────────────────────────────────
  tools: {
    list: q<ClientReturn<'tools', 'list'>>(
      () => ['tools'],
      (c) => c.tools.list(),
    ),
  },

  // ── Workspaces ───────────────────────────────────────────────────
  workspaces: {
    list: q<ClientReturn<'workspaces', 'list'>>(
      () => ['workspaces'],
      (c) => c.workspaces.list(),
    ),
    get: qParam<{ id: string }, ClientReturn<'workspaces', 'get'>>(
      (p) => ['workspaces', p.id],
      (c, p) => c.workspaces.get(p.id),
    ),
    detail: qParam<{ id: string }, ClientReturn<'workspaces', 'detail'>>(
      (p) => ['workspaces', p.id, 'detail'],
      (c, p) => c.workspaces.detail(p.id),
    ),
    usage: qParam<{ id: string; days?: number }, ClientReturn<'workspaces', 'usage'>>(
      (p) => ['workspaces', p.id, 'usage', p.days],
      (c, p) => c.workspaces.usage(p.id, p.days),
    ),
    updateConfig: m<ClientReturn<'workspaces', 'updateConfig'>, { id: string; updates: Record<string, unknown> }>(
      (c, input) => c.workspaces.updateConfig(input.id, input.updates),
    ),
  },

  // ── Sessions ─────────────────────────────────────────────────────
  sessions: {
    list: qParam<{ workspaceId: string }, ClientReturn<'sessions', 'list'>>(
      (p) => ['workspaces', p.workspaceId, 'sessions'],
      (c, p) => c.sessions.list(p.workspaceId),
    ),
    get: qParam<{ workspaceId: string; sessionId: string }, ClientReturn<'sessions', 'get'>>(
      (p) => ['workspaces', p.workspaceId, 'sessions', p.sessionId],
      (c, p) => c.sessions.get(p.workspaceId, p.sessionId),
    ),
    transcript: qParam<{ workspaceId: string; sessionId: string; limit?: number }, ClientReturn<'sessions', 'transcript'>>(
      (p) => ['workspaces', p.workspaceId, 'sessions', p.sessionId, 'transcript', p.limit],
      (c, p) => c.sessions.transcript(p.workspaceId, p.sessionId, p.limit),
    ),
    archive: m<ClientReturn<'sessions', 'archive'>, { workspaceId: string; sessionId: string }>(
      (c, input) => c.sessions.archive(input.workspaceId, input.sessionId),
    ),
    setAgent: m<ClientReturn<'sessions', 'setAgent'>, { workspaceId: string; sessionId: string; agentId: string }>(
      (c, input) => c.sessions.setAgent(input.workspaceId, input.sessionId, input.agentId),
    ),
  },

  // ── Files ────────────────────────────────────────────────────────
  files: {
    list: qParam<{ workspaceId: string; subpath?: string }, ClientReturn<'files', 'list'>>(
      (p) => ['workspaces', p.workspaceId, 'files', p.subpath],
      (c, p) => c.files.list(p.workspaceId, p.subpath),
    ),
    read: qParam<{ workspaceId: string; filePath: string }, ClientReturn<'files', 'read'>>(
      (p) => ['workspaces', p.workspaceId, 'files', 'content', p.filePath],
      (c, p) => c.files.read(p.workspaceId, p.filePath),
    ),
    write: m<ClientReturn<'files', 'write'>, { workspaceId: string; filePath: string; content: string }>(
      (c, input) => c.files.write(input.workspaceId, input.filePath, input.content),
    ),
  },

  // ── Memory ───────────────────────────────────────────────────────
  memory: {
    search: qParam<{ workspaceId: string; query: string; limit?: number }, ClientReturn<'memory', 'search'>>(
      (p) => ['workspaces', p.workspaceId, 'memory', 'search', p.query, p.limit],
      (c, p) => c.memory.search(p.workspaceId, p.query, p.limit),
    ),
    listFiles: qParam<{ workspaceId: string }, ClientReturn<'memory', 'listFiles'>>(
      (p) => ['workspaces', p.workspaceId, 'memory', 'files'],
      (c, p) => c.memory.listFiles(p.workspaceId),
    ),
    readFile: qParam<{ workspaceId: string; fileName: string }, ClientReturn<'memory', 'readFile'>>(
      (p) => ['workspaces', p.workspaceId, 'memory', 'files', p.fileName],
      (c, p) => c.memory.readFile(p.workspaceId, p.fileName),
    ),
    write: m<ClientReturn<'memory', 'write'>, { workspaceId: string; source: string; content: string }>(
      (c, input) => c.memory.write(input.workspaceId, input.source, input.content),
    ),
    delete: m<ClientReturn<'memory', 'delete'>, { workspaceId: string; sourcePrefix: string }>(
      (c, input) => c.memory.delete(input.workspaceId, input.sourcePrefix),
    ),
  },

  // ── Channels ──────────────────────────────────────────────────────
  channels: {
    bindings: qParam<{ workspaceId: string }, ClientReturn<'channels', 'bindings'>>(
      (p) => ['workspaces', p.workspaceId, 'channel-bindings'],
      (c, p) => c.channels.bindings(p.workspaceId),
    ),
  },

  // ── Cron ─────────────────────────────────────────────────────────
  cron: {
    list: qParam<{ workspaceId: string }, ClientReturn<'cron', 'list'>>(
      (p) => ['workspaces', p.workspaceId, 'cron'],
      (c, p) => c.cron.list(p.workspaceId),
    ),
    history: qParam<{ workspaceId: string; limit?: number }, ClientReturn<'cron', 'history'>>(
      (p) => ['workspaces', p.workspaceId, 'cron', 'history', p.limit],
      (c, p) => c.cron.history(p.workspaceId, p.limit),
    ),
    add: m<ClientReturn<'cron', 'add'>, { workspaceId: string; job: Parameters<GatewayClient['cron']['add']>[1] }>(
      (c, input) => c.cron.add(input.workspaceId, input.job),
    ),
    remove: m<ClientReturn<'cron', 'remove'>, { workspaceId: string; jobId: string }>(
      (c, input) => c.cron.remove(input.workspaceId, input.jobId),
    ),
    trigger: m<ClientReturn<'cron', 'trigger'>, { workspaceId: string; jobId: string }>(
      (c, input) => c.cron.trigger(input.workspaceId, input.jobId),
    ),
  },
} as const;

// ── Invalidation helpers ──────────────────────────────────────────────

export function useInvalidate() {
  const qc = useQueryClient();
  return {
    workspaces: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
    workspace: (id: string) => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
    sessions: (workspaceId: string) => qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'sessions'] }),
    agents: () => qc.invalidateQueries({ queryKey: ['agents'] }),
    agent: (id: string) => qc.invalidateQueries({ queryKey: ['agents', id] }),
    agentFiles: (id: string) => qc.invalidateQueries({ queryKey: ['agents', id, 'files'] }),
    tools: () => qc.invalidateQueries({ queryKey: ['tools'] }),
    cron: (workspaceId: string) => qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'cron'] }),
    memory: (workspaceId: string) => qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'memory'] }),
    files: (workspaceId: string) => qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'files'] }),
    all: () => qc.invalidateQueries(),
  };
}

// ── Query key helpers (for manual usage) ──────────────────────────────

export const gatewayKeys = {
  health: () => ['health'] as const,
  system: { status: () => ['system', 'status'] as const },
  agents: {
    all: () => ['agents'] as const,
    detail: (id: string) => ['agents', id] as const,
    files: (id: string) => ['agents', id, 'files'] as const,
  },
  tools: { all: () => ['tools'] as const },
  workspaces: {
    all: () => ['workspaces'] as const,
    detail: (id: string) => ['workspaces', id, 'detail'] as const,
    usage: (id: string, days?: number) => ['workspaces', id, 'usage', days] as const,
  },
  sessions: {
    list: (workspaceId: string) => ['workspaces', workspaceId, 'sessions'] as const,
    detail: (workspaceId: string, sessionId: string) => ['workspaces', workspaceId, 'sessions', sessionId] as const,
    transcript: (workspaceId: string, sessionId: string) => ['workspaces', workspaceId, 'sessions', sessionId, 'transcript'] as const,
  },
  files: {
    list: (workspaceId: string) => ['workspaces', workspaceId, 'files'] as const,
    content: (workspaceId: string, filePath: string) => ['workspaces', workspaceId, 'files', 'content', filePath] as const,
  },
  memory: {
    search: (workspaceId: string, query: string) => ['workspaces', workspaceId, 'memory', 'search', query] as const,
    files: (workspaceId: string) => ['workspaces', workspaceId, 'memory', 'files'] as const,
  },
  cron: {
    list: (workspaceId: string) => ['workspaces', workspaceId, 'cron'] as const,
    history: (workspaceId: string) => ['workspaces', workspaceId, 'cron', 'history'] as const,
  },
} as const;
