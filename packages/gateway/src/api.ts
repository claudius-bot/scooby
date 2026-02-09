import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';

export interface ApiContext {
  listWorkspaces: () => Promise<Array<{ id: string; agent: { name: string; vibe: string; emoji: string; avatar: string } }>>;
  getWorkspace: (id: string) => Promise<{ id: string; path: string; agent: any } | null>;
  listSessions: (workspaceId: string) => Promise<any[]>;
  getTranscript: (workspaceId: string, sessionId: string, limit?: number) => Promise<any[]>;
  handleWebhook: (workspaceId: string, body: any) => Promise<any>;
  getUsage: (workspaceId: string, days?: number) => Promise<any>;
  handlePhoneCallWebhook?: (body: any) => Promise<{ ok: boolean }>;

  // Read callbacks
  listAgents?: () => Promise<any[]>;
  getAgent?: (id: string) => Promise<any | null>;
  getAgentAvatar?: (id: string) => Promise<{ data: ArrayBuffer; contentType: string } | null>;
  getWorkspaceDetail?: (id: string) => Promise<any | null>;
  listWorkspaceFiles?: (workspaceId: string, subpath?: string) => Promise<any[]>;
  readWorkspaceFile?: (workspaceId: string, filePath: string) => Promise<{ content: string; path: string } | null>;
  searchMemory?: (workspaceId: string, query: string, limit?: number) => Promise<any[]>;
  listMemoryFiles?: (workspaceId: string) => Promise<any[]>;
  readMemoryFile?: (workspaceId: string, fileName: string) => Promise<string | null>;
  listCronJobs?: (workspaceId: string) => Promise<any[]>;
  getCronHistory?: (workspaceId: string, limit?: number) => Promise<any[]>;
  listChannelBindings?: (workspaceId: string) => Promise<any[]>;
  listTools?: () => Promise<any[]>;
  getUniversalTools?: () => string[];
  getSession?: (workspaceId: string, sessionId: string) => Promise<any | null>;
  getSystemStatus?: () => Promise<any>;

  // Agent read/write callbacks
  getAgentFiles?: (id: string) => Promise<{ identity: string; soul: string; tools: string } | null>;
  updateAgent?: (id: string, updates: Record<string, unknown>) => Promise<{ ok: boolean }>;
  updateAgentFile?: (id: string, fileName: string, content: string) => Promise<{ ok: boolean }>;

  // Write callbacks
  updateWorkspaceConfig?: (workspaceId: string, updates: Record<string, unknown>) => Promise<{ ok: boolean }>;
  writeWorkspaceFile?: (workspaceId: string, filePath: string, content: string) => Promise<{ ok: boolean }>;
  writeMemory?: (workspaceId: string, source: string, content: string) => Promise<{ chunks: number }>;
  deleteMemory?: (workspaceId: string, sourcePrefix: string) => Promise<{ ok: boolean }>;
  addCronJob?: (workspaceId: string, job: any) => Promise<{ ok: boolean }>;
  removeCronJob?: (workspaceId: string, jobId: string) => Promise<{ ok: boolean }>;
  triggerCronJob?: (workspaceId: string, jobId: string) => Promise<{ ok: boolean }>;
  archiveSession?: (workspaceId: string, sessionId: string) => Promise<{ ok: boolean }>;
  setSessionAgent?: (workspaceId: string, sessionId: string, agentId: string) => Promise<{ ok: boolean }>;
}

export function createApi(ctx: ApiContext) {
  const app = new Hono().basePath('/api');

  app.use('*', cors());

  // GET /api/health
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // GET /api/workspaces
  app.get('/workspaces', async (c) => {
    const workspaces = await ctx.listWorkspaces();
    return c.json({ workspaces });
  });

  // GET /api/workspaces/:id
  app.get('/workspaces/:id', async (c) => {
    const workspace = await ctx.getWorkspace(c.req.param('id'));
    if (!workspace) {
      throw new HTTPException(404, { message: 'Workspace not found' });
    }
    return c.json(workspace);
  });

  // GET /api/workspaces/:id/usage?days=30
  app.get('/workspaces/:id/usage', async (c) => {
    const days = c.req.query('days') ? Number(c.req.query('days')) : undefined;
    const usage = await ctx.getUsage(c.req.param('id'), days);
    return c.json(usage);
  });

  // GET /api/workspaces/:id/sessions
  app.get('/workspaces/:id/sessions', async (c) => {
    const sessions = await ctx.listSessions(c.req.param('id'));
    return c.json({ sessions });
  });

  // GET /api/workspaces/:id/sessions/:sessionId/transcript
  app.get('/workspaces/:id/sessions/:sessionId/transcript', async (c) => {
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
    const transcript = await ctx.getTranscript(c.req.param('id'), c.req.param('sessionId'), limit);
    return c.json({ transcript });
  });

  // POST /api/phone-call-webhook
  app.post('/phone-call-webhook', async (c) => {
    if (!ctx.handlePhoneCallWebhook) {
      return c.json({ error: 'Phone call webhooks not configured' }, 404);
    }
    const body = await c.req.json();
    const result = await ctx.handlePhoneCallWebhook(body);
    return c.json(result);
  });

  // POST /api/webhook/:workspaceId
  app.post('/webhook/:workspaceId', async (c) => {
    const body = await c.req.json();
    const result = await ctx.handleWebhook(c.req.param('workspaceId'), body);
    return c.json(result);
  });

  // ── New read routes ─────────────────────────────────────────────────

  // GET /api/agents
  app.get('/agents', async (c) => {
    if (!ctx.listAgents) return c.json({ error: 'Not implemented' }, 404);
    const agents = await ctx.listAgents();
    return c.json({ agents });
  });

  // GET /api/agents/:id
  app.get('/agents/:id', async (c) => {
    if (!ctx.getAgent) return c.json({ error: 'Not implemented' }, 404);
    const agent = await ctx.getAgent(c.req.param('id'));
    if (!agent) throw new HTTPException(404, { message: 'Agent not found' });
    return c.json(agent);
  });

  // GET /api/agents/:id/avatar — serve agent avatar image
  app.get('/agents/:id/avatar', async (c) => {
    if (!ctx.getAgentAvatar) return c.json({ error: 'Not implemented' }, 404);
    const result = await ctx.getAgentAvatar(c.req.param('id'));
    if (!result) throw new HTTPException(404, { message: 'Avatar not found' });
    c.header('Content-Type', result.contentType);
    c.header('Cache-Control', 'public, max-age=3600');
    return c.body(result.data);
  });

  // GET /api/agents/:id/files
  app.get('/agents/:id/files', async (c) => {
    if (!ctx.getAgentFiles) return c.json({ error: 'Not implemented' }, 404);
    const files = await ctx.getAgentFiles(c.req.param('id'));
    if (!files) throw new HTTPException(404, { message: 'Agent not found' });
    return c.json(files);
  });

  // PATCH /api/agents/:id
  app.patch('/agents/:id', async (c) => {
    if (!ctx.updateAgent) return c.json({ error: 'Not implemented' }, 404);
    const body = await c.req.json();
    const result = await ctx.updateAgent(c.req.param('id'), body);
    return c.json(result);
  });

  // PUT /api/agents/:id/files/:fileName
  app.put('/agents/:id/files/:fileName', async (c) => {
    if (!ctx.updateAgentFile) return c.json({ error: 'Not implemented' }, 404);
    const { content } = await c.req.json();
    const result = await ctx.updateAgentFile(c.req.param('id'), c.req.param('fileName'), content);
    return c.json(result);
  });

  // GET /api/tools
  app.get('/tools', async (c) => {
    if (!ctx.listTools) return c.json({ error: 'Not implemented' }, 404);
    const tools = await ctx.listTools();
    const universalTools = ctx.getUniversalTools?.() ?? [];
    return c.json({ tools, universalTools });
  });

  // GET /api/system/status
  app.get('/system/status', async (c) => {
    if (!ctx.getSystemStatus) return c.json({ error: 'Not implemented' }, 404);
    const status = await ctx.getSystemStatus();
    return c.json(status);
  });

  // GET /api/workspaces/:id/detail
  app.get('/workspaces/:id/detail', async (c) => {
    if (!ctx.getWorkspaceDetail) return c.json({ error: 'Not implemented' }, 404);
    const detail = await ctx.getWorkspaceDetail(c.req.param('id'));
    if (!detail) throw new HTTPException(404, { message: 'Workspace not found' });
    return c.json(detail);
  });

  // GET /api/workspaces/:id/memory/search?q=...&limit=10
  app.get('/workspaces/:id/memory/search', async (c) => {
    if (!ctx.searchMemory) return c.json({ error: 'Not implemented' }, 404);
    const query = c.req.query('q') ?? '';
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
    const results = await ctx.searchMemory(c.req.param('id'), query, limit);
    return c.json({ results });
  });

  // GET /api/workspaces/:id/memory/files
  app.get('/workspaces/:id/memory/files', async (c) => {
    if (!ctx.listMemoryFiles) return c.json({ error: 'Not implemented' }, 404);
    const files = await ctx.listMemoryFiles(c.req.param('id'));
    return c.json({ files });
  });

  // GET /api/workspaces/:id/memory/files/:name
  app.get('/workspaces/:id/memory/files/:name', async (c) => {
    if (!ctx.readMemoryFile) return c.json({ error: 'Not implemented' }, 404);
    const content = await ctx.readMemoryFile(c.req.param('id'), c.req.param('name'));
    if (content === null) throw new HTTPException(404, { message: 'Memory file not found' });
    return c.json({ content });
  });

  // GET /api/workspaces/:id/channel-bindings
  app.get('/workspaces/:id/channel-bindings', async (c) => {
    if (!ctx.listChannelBindings) return c.json({ error: 'Not implemented' }, 404);
    const bindings = await ctx.listChannelBindings(c.req.param('id'));
    return c.json({ bindings });
  });

  // GET /api/workspaces/:id/cron
  app.get('/workspaces/:id/cron', async (c) => {
    if (!ctx.listCronJobs) return c.json({ error: 'Not implemented' }, 404);
    const jobs = await ctx.listCronJobs(c.req.param('id'));
    return c.json({ jobs });
  });

  // GET /api/workspaces/:id/cron/history?limit=20
  app.get('/workspaces/:id/cron/history', async (c) => {
    if (!ctx.getCronHistory) return c.json({ error: 'Not implemented' }, 404);
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
    const history = await ctx.getCronHistory(c.req.param('id'), limit);
    return c.json({ history });
  });

  // GET /api/workspaces/:id/sessions/:sessionId
  app.get('/workspaces/:id/sessions/:sessionId', async (c) => {
    if (!ctx.getSession) return c.json({ error: 'Not implemented' }, 404);
    const session = await ctx.getSession(c.req.param('id'), c.req.param('sessionId'));
    if (!session) throw new HTTPException(404, { message: 'Session not found' });
    return c.json(session);
  });

  // GET /api/workspaces/:id/files (list directory)
  app.get('/workspaces/:id/files', async (c) => {
    if (!ctx.listWorkspaceFiles) return c.json({ error: 'Not implemented' }, 404);
    const subpath = c.req.query('path');
    const files = await ctx.listWorkspaceFiles(c.req.param('id'), subpath);
    return c.json({ files });
  });

  // GET /api/workspaces/:id/files/* (read file by wildcard path)
  app.get('/workspaces/:id/files/*', async (c) => {
    if (!ctx.readWorkspaceFile) return c.json({ error: 'Not implemented' }, 404);
    const filePath = c.req.path.replace(/^\/api\/workspaces\/[^/]+\/files\//, '');
    const result = await ctx.readWorkspaceFile(c.req.param('id'), filePath);
    if (!result) throw new HTTPException(404, { message: 'File not found' });
    return c.json(result);
  });

  // ── New write routes ────────────────────────────────────────────────

  // PATCH /api/workspaces/:id/config
  app.patch('/workspaces/:id/config', async (c) => {
    if (!ctx.updateWorkspaceConfig) return c.json({ error: 'Not implemented' }, 404);
    const body = await c.req.json();
    const result = await ctx.updateWorkspaceConfig(c.req.param('id'), body);
    return c.json(result);
  });

  // POST /api/workspaces/:id/memory
  app.post('/workspaces/:id/memory', async (c) => {
    if (!ctx.writeMemory) return c.json({ error: 'Not implemented' }, 404);
    const { source, content } = await c.req.json();
    const result = await ctx.writeMemory(c.req.param('id'), source, content);
    return c.json(result);
  });

  // DELETE /api/workspaces/:id/memory/:sourcePrefix
  app.delete('/workspaces/:id/memory/:sourcePrefix', async (c) => {
    if (!ctx.deleteMemory) return c.json({ error: 'Not implemented' }, 404);
    const result = await ctx.deleteMemory(c.req.param('id'), c.req.param('sourcePrefix'));
    return c.json(result);
  });

  // POST /api/workspaces/:id/cron
  app.post('/workspaces/:id/cron', async (c) => {
    if (!ctx.addCronJob) return c.json({ error: 'Not implemented' }, 404);
    const body = await c.req.json();
    const result = await ctx.addCronJob(c.req.param('id'), body);
    return c.json(result);
  });

  // DELETE /api/workspaces/:id/cron/:jobId
  app.delete('/workspaces/:id/cron/:jobId', async (c) => {
    if (!ctx.removeCronJob) return c.json({ error: 'Not implemented' }, 404);
    const result = await ctx.removeCronJob(c.req.param('id'), c.req.param('jobId'));
    return c.json(result);
  });

  // POST /api/workspaces/:id/cron/:jobId/trigger
  app.post('/workspaces/:id/cron/:jobId/trigger', async (c) => {
    if (!ctx.triggerCronJob) return c.json({ error: 'Not implemented' }, 404);
    const result = await ctx.triggerCronJob(c.req.param('id'), c.req.param('jobId'));
    return c.json(result);
  });

  // POST /api/workspaces/:id/sessions/:sessionId/archive
  app.post('/workspaces/:id/sessions/:sessionId/archive', async (c) => {
    if (!ctx.archiveSession) return c.json({ error: 'Not implemented' }, 404);
    const result = await ctx.archiveSession(c.req.param('id'), c.req.param('sessionId'));
    return c.json(result);
  });

  // PUT /api/workspaces/:id/sessions/:sessionId/agent
  app.put('/workspaces/:id/sessions/:sessionId/agent', async (c) => {
    if (!ctx.setSessionAgent) return c.json({ error: 'Not implemented' }, 404);
    const { agentId } = await c.req.json();
    const result = await ctx.setSessionAgent(c.req.param('id'), c.req.param('sessionId'), agentId);
    return c.json(result);
  });

  // PUT /api/workspaces/:id/files/* (write file by wildcard path)
  app.put('/workspaces/:id/files/*', async (c) => {
    if (!ctx.writeWorkspaceFile) return c.json({ error: 'Not implemented' }, 404);
    const filePath = c.req.path.replace(/^\/api\/workspaces\/[^/]+\/files\//, '');
    const { content } = await c.req.json();
    const result = await ctx.writeWorkspaceFile(c.req.param('id'), filePath, content);
    return c.json(result);
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    return c.json({ error: err.message }, 500);
  });

  return app;
}
