import { WebSocket } from 'ws';
import type { WsResponse, WsEvent } from './protocol.js';

export interface Connection {
  id: string;
  ws: WebSocket;
  workspaceId?: string;
  sessionId?: string;
  connectedAt: Date;
  lastPingAt: Date;
  alive: boolean;
  subscriptions: Set<string>;
}

export class ConnectionManager {
  private connections = new Map<string, Connection>();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  add(id: string, ws: WebSocket): Connection {
    const conn: Connection = {
      id,
      ws,
      connectedAt: new Date(),
      lastPingAt: new Date(),
      alive: true,
      subscriptions: new Set(),
    };
    this.connections.set(id, conn);
    return conn;
  }

  remove(id: string): void {
    this.connections.delete(id);
  }

  get(id: string): Connection | undefined {
    return this.connections.get(id);
  }

  bindWorkspace(connectionId: string, workspaceId: string, sessionId?: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.workspaceId = workspaceId;
      if (sessionId) conn.sessionId = sessionId;
    }
  }

  getByWorkspace(workspaceId: string): Connection[] {
    return Array.from(this.connections.values()).filter(c => c.workspaceId === workspaceId);
  }

  send(connectionId: string, data: WsResponse | WsEvent): void {
    const conn = this.connections.get(connectionId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(data));
    }
  }

  broadcast(workspaceId: string, data: WsEvent): void {
    for (const conn of this.getByWorkspace(workspaceId)) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify(data));
      }
    }
  }

  subscribe(connectionId: string, topic: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.subscriptions.add(topic);
    }
  }

  unsubscribe(connectionId: string, topic: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.subscriptions.delete(topic);
    }
  }

  broadcastToTopic(topic: string, data: WsEvent, workspaceId?: string): void {
    for (const conn of this.connections.values()) {
      if (!conn.subscriptions.has(topic)) continue;
      if (workspaceId && conn.workspaceId && conn.workspaceId !== workspaceId) continue;
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify(data));
      }
    }
  }

  startHeartbeat(intervalMs: number = 30000): void {
    this.pingInterval = setInterval(() => {
      for (const [id, conn] of this.connections) {
        if (!conn.alive) {
          conn.ws.terminate();
          this.connections.delete(id);
          continue;
        }
        conn.alive = false;
        conn.ws.ping();
      }
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  get count(): number {
    return this.connections.size;
  }

  dispose(): void {
    this.stopHeartbeat();
    for (const conn of this.connections.values()) {
      conn.ws.close();
    }
    this.connections.clear();
  }
}
