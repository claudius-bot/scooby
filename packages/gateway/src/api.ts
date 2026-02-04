import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ApiContext {
  listWorkspaces: () => Promise<Array<{ id: string; agent: { name: string; creature: string; vibe: string; emoji: string; avatar: string } }>>;
  getWorkspace: (id: string) => Promise<{ id: string; path: string; agent: any } | null>;
  listSessions: (workspaceId: string) => Promise<any[]>;
  getTranscript: (workspaceId: string, sessionId: string, limit?: number) => Promise<any[]>;
  handleWebhook: (workspaceId: string, body: any) => Promise<any>;
}

export function createApiHandler(ctx: ApiContext) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    try {
      // GET /api/health
      if (path === '/api/health' && req.method === 'GET') {
        sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
        return true;
      }

      // GET /api/workspaces
      if (path === '/api/workspaces' && req.method === 'GET') {
        const workspaces = await ctx.listWorkspaces();
        sendJson(res, 200, { workspaces });
        return true;
      }

      // GET /api/workspaces/:id
      const workspaceMatch = path.match(/^\/api\/workspaces\/([^\/]+)$/);
      if (workspaceMatch && req.method === 'GET') {
        const workspace = await ctx.getWorkspace(workspaceMatch[1]);
        if (!workspace) {
          sendJson(res, 404, { error: 'Workspace not found' });
          return true;
        }
        sendJson(res, 200, workspace);
        return true;
      }

      // GET /api/workspaces/:id/sessions
      const sessionsMatch = path.match(/^\/api\/workspaces\/([^\/]+)\/sessions$/);
      if (sessionsMatch && req.method === 'GET') {
        const sessions = await ctx.listSessions(sessionsMatch[1]);
        sendJson(res, 200, { sessions });
        return true;
      }

      // GET /api/workspaces/:id/sessions/:sessionId/transcript
      const transcriptMatch = path.match(/^\/api\/workspaces\/([^\/]+)\/sessions\/([^\/]+)\/transcript$/);
      if (transcriptMatch && req.method === 'GET') {
        const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined;
        const transcript = await ctx.getTranscript(transcriptMatch[1], transcriptMatch[2], limit);
        sendJson(res, 200, { transcript });
        return true;
      }

      // POST /api/webhook/:workspaceId
      const webhookMatch = path.match(/^\/api\/webhook\/([^\/]+)$/);
      if (webhookMatch && req.method === 'POST') {
        const body = await readBody(req);
        const result = await ctx.handleWebhook(webhookMatch[1], body);
        sendJson(res, 200, result);
        return true;
      }

      return false; // not handled
    } catch (err: any) {
      sendJson(res, 500, { error: err.message });
      return true;
    }
  };
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}
