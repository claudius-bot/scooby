import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { ConnectionManager } from './connections.js';
import { createApiHandler, type ApiContext } from './api.js';
import { parseMessage, createResponse, createError, createEvent, type WsRequest } from './protocol.js';

export interface GatewayConfig {
  host: string;
  port: number;
  wsPath: string;
}

export type WsMethodHandler = (
  connectionId: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

export class GatewayServer {
  private server: Server;
  private wss: WebSocketServer;
  private connections: ConnectionManager;
  private methodHandlers = new Map<string, WsMethodHandler>();
  private apiHandler: ReturnType<typeof createApiHandler>;

  constructor(
    private config: GatewayConfig,
    apiContext: ApiContext,
  ) {
    this.connections = new ConnectionManager();
    this.apiHandler = createApiHandler(apiContext);

    this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const handled = await this.apiHandler(req, res);
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    this.wss = new WebSocketServer({ server: this.server, path: config.wsPath });
    this.setupWebSocket();
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const connId = randomUUID();
      const conn = this.connections.add(connId, ws);

      console.log(`[Gateway] WebSocket connected: ${connId}`);

      ws.on('pong', () => {
        conn.alive = true;
        conn.lastPingAt = new Date();
      });

      ws.on('message', async (raw: Buffer) => {
        const message = parseMessage(raw.toString('utf-8'));
        if (!message) {
          this.connections.send(connId, createError('unknown', -32700, 'Parse error'));
          return;
        }
        await this.handleWsMessage(connId, message);
      });

      ws.on('close', () => {
        console.log(`[Gateway] WebSocket disconnected: ${connId}`);
        this.connections.remove(connId);
      });

      ws.on('error', (err) => {
        console.error(`[Gateway] WebSocket error for ${connId}:`, err.message);
      });
    });
  }

  private async handleWsMessage(connectionId: string, message: WsRequest): Promise<void> {
    const handler = this.methodHandlers.get(message.method);
    if (!handler) {
      this.connections.send(connectionId, createError(message.id, -32601, `Method not found: ${message.method}`));
      return;
    }

    try {
      const result = await handler(connectionId, message.params || {});
      this.connections.send(connectionId, createResponse(message.id, result));
    } catch (err: any) {
      this.connections.send(connectionId, createError(message.id, -32000, err.message));
    }
  }

  registerMethod(method: string, handler: WsMethodHandler): void {
    this.methodHandlers.set(method, handler);
  }

  sendEvent(connectionId: string, event: string, data: unknown): void {
    this.connections.send(connectionId, createEvent(event, data));
  }

  broadcastEvent(workspaceId: string, event: string, data: unknown): void {
    this.connections.broadcast(workspaceId, createEvent(event, data));
  }

  getConnections(): ConnectionManager {
    return this.connections;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`[Gateway] Server listening on ${this.config.host}:${this.config.port}`);
        console.log(`[Gateway] WebSocket path: ${this.config.wsPath}`);
        this.connections.startHeartbeat();
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.connections.dispose();
    return new Promise((resolve, reject) => {
      this.wss.close(() => {
        this.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }
}
