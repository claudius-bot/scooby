'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from './useWebSocket';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: string;
  modelGroup?: 'fast' | 'slow';
  streaming?: boolean;
}

export function useChat(workspaceId: string) {
  const { status, request, on } = useWebSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [modelGroup, setModelGroup] = useState<'fast' | 'slow'>('fast');
  const streamingRef = useRef('');

  useEffect(() => {
    const unsubs = [
      on('chat.text-delta', (data: unknown) => {
        const d = data as { content: string };
        streamingRef.current += d.content;
        const currentContent = streamingRef.current;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.streaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: currentContent },
            ];
          }
          return prev;
        });
      }),

      on('chat.tool-call', (data: unknown) => {
        const d = data as { toolName: string; args: unknown };
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'tool' as const,
            content: '',
            timestamp: new Date().toISOString(),
            toolName: d.toolName,
            toolArgs: d.args,
          },
        ]);
      }),

      on('chat.tool-result', (data: unknown) => {
        const d = data as { toolName: string; result: string };
        setMessages((prev) => {
          const idx = prev.findLastIndex(
            (m) => m.toolName === d.toolName && !m.toolResult,
          );
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], toolResult: d.result };
            return updated;
          }
          return prev;
        });
      }),

      on('chat.model-switch', (data: unknown) => {
        const d = data as { to: string };
        setModelGroup(d.to === 'slow' ? 'slow' : 'fast');
      }),

      on('chat.done', () => {
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
        );
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [on]);

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Add streaming placeholder for assistant
      streamingRef.current = '';
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        streaming: true,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsStreaming(true);

      try {
        await request('chat.send', { workspaceId, text });
      } catch {
        setIsStreaming(false);
      }
    },
    [workspaceId, request],
  );

  return {
    messages,
    sendMessage,
    isStreaming,
    modelGroup,
    connectionStatus: status,
  };
}
