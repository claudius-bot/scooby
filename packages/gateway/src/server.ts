import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { serve, type ServerType } from '@hono/node-server';
import { ConnectionManager } from './connections.js';
import { createApi, type ApiContext } from './api.js';
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
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private connections: ConnectionManager;
  private methodHandlers = new Map<string, WsMethodHandler>();
  private app: Hono;

  constructor(
    private config: GatewayConfig,
    apiContext: ApiContext,
  ) {
    this.connections = new ConnectionManager();

    const api = createApi(apiContext);

    this.app = new Hono();
    this.app.route('/', api);

    // Catch-all 404 for unmatched routes
    this.app.notFound((c) => {
      return c.json({ error: 'Not found' }, 404);
    });
  }

  private setupWebSocket(server: Server): void {
    this.wss = new WebSocketServer({ server, path: this.config.wsPath });

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

  getApp(): Hono {
    return this.app;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      const nodeServer = serve(
        {
          fetch: this.app.fetch,
          port: this.config.port,
          hostname: this.config.host,
        },
        (info) => {
          console.log(`[Gateway] Server listening on ${this.config.host}:${info.port}`);
          console.log(`[Gateway] WebSocket path: ${this.config.wsPath}`);
          this.connections.startHeartbeat();
          resolve();
        },
      );

      this.server = nodeServer as Server;
      this.setupWebSocket(this.server);
    });
  }

  async stop(): Promise<void> {
    this.connections.dispose();
    return new Promise((resolve, reject) => {
      if (this.wss) {
        this.wss.close(() => {
          if (this.server) {
            this.server.close((err) => {
              if (err) reject(err);
              else resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}
