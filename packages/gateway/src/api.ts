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

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    return c.json({ error: err.message }, 500);
  });

  return app;
}
