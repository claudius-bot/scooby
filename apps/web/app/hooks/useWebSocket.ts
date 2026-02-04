'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { WsClient } from '../lib/ws-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000/ws';

export function useWebSocket() {
  const clientRef = useRef<WsClient | null>(null);
  const [status, setStatus] = useState<string>('disconnected');

  useEffect(() => {
    const client = new WsClient(WS_URL);
    clientRef.current = client;

    const unsub = client.onStatus(setStatus);
    client.connect();

    return () => {
      unsub();
      client.disconnect();
    };
  }, []);

  const request = useCallback(
    async (method: string, params?: Record<string, unknown>) => {
      if (!clientRef.current) throw new Error('Not connected');
      return clientRef.current.request(method, params);
    },
    [],
  );

  const on = useCallback(
    (event: string, handler: (data: unknown) => void) => {
      if (!clientRef.current) return () => {};
      return clientRef.current.on(event, handler);
    },
    [],
  );

  return { status, request, on, client: clientRef };
}
