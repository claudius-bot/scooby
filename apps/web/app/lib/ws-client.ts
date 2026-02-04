type EventHandler = (data: unknown) => void;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private requestId = 0;
  private pending = new Map<string, PendingRequest>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _status: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
  private statusListeners = new Set<(status: string) => void>();

  constructor(url: string) {
    this.url = url;
  }

  get status() {
    return this._status;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.setStatus('disconnected');
      this.reconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        this.handleMessage(event.data);
      }
    };

    this.ws.onclose = () => {
      this.setStatus('disconnected');
      this.reconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, so reconnection is handled there
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // prevent reconnect
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
    // Reject all pending requests
    for (const [id, req] of this.pending) {
      clearTimeout(req.timeout);
      req.reject(new Error('Connection closed'));
      this.pending.delete(id);
    }
    this.setStatus('disconnected');
  }

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const id = String(++this.requestId);

    const message: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params ? { params } : {}),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out: ${method}`));
      }, 30_000);

      this.pending.set(id, { resolve, reject, timeout });
      this.ws!.send(JSON.stringify(message));
    });
  }

  on(event: string, handler: EventHandler): () => void {
    let handlers = this.eventHandlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(event, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers!.delete(handler);
      if (handlers!.size === 0) {
        this.eventHandlers.delete(event);
      }
    };
  }

  onStatus(listener: (status: string) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(status: 'connecting' | 'connected' | 'disconnected'): void {
    this._status = status;
    this.statusListeners.forEach((l) => l(status));
  }

  private handleMessage(raw: string): void {
    let parsed: JsonRpcResponse | JsonRpcNotification;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    // Response to a pending request
    if ('id' in parsed && parsed.id != null) {
      const response = parsed as JsonRpcResponse;
      const pending = this.pending.get(String(response.id));
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(String(response.id));
        if (response.error) {
          pending.reject(new Error(response.error.message));
        } else {
          pending.resolve(response.result);
        }
      }
      return;
    }

    // Server-pushed event (event/data format)
    if ('event' in parsed) {
      const event = parsed as unknown as { event: string; data: unknown };
      const handlers = this.eventHandlers.get(event.event);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(event.data);
          } catch {
            // swallow handler errors
          }
        });
      }
      return;
    }

    // JSON-RPC notification (method/params format)
    if ('method' in parsed) {
      const notification = parsed as JsonRpcNotification;
      const handlers = this.eventHandlers.get(notification.method);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(notification.params);
          } catch {
            // swallow handler errors
          }
        });
      }
    }
  }

  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
