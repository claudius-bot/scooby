'use client';

import { useReducer, useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { useInvalidate } from '@scooby/api-client/react';

// ── Types ──────────────────────────────────────────────────────────────

export interface ChatMessageAgent {
  id: string;
  name: string;
  emoji: string;
  avatar: string;
}

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
  agent?: ChatMessageAgent;
  attachments?: Array<{ name: string; type: string; dataUrl: string }>;
}

type Status = 'idle' | 'loading' | 'ready' | 'streaming' | 'error';

interface State {
  status: Status;
  messages: ChatMessage[];
  currentSessionId: string | null;
  modelGroup: 'fast' | 'slow';
  error: string | null;
}

// ── Actions ────────────────────────────────────────────────────────────

type Action =
  | { type: 'SELECT_SESSION'; sessionId: string }
  | { type: 'SESSION_LOADED'; sessionId: string; messages: ChatMessage[] }
  | { type: 'NEW_CONVERSATION' }
  | { type: 'SEND_MESSAGE'; userMsg: ChatMessage; assistantMsg: ChatMessage }
  | { type: 'SET_SESSION_ID'; sessionId: string }
  | { type: 'TEXT_DELTA'; content: string }
  | { type: 'TOOL_CALL'; message: ChatMessage }
  | { type: 'TOOL_RESULT'; toolName: string; result: string }
  | { type: 'MODEL_SWITCH'; to: 'fast' | 'slow' }
  | { type: 'STREAM_DONE' }
  | { type: 'STREAM_ERROR'; error: string };

const initialState: State = {
  status: 'idle',
  messages: [],
  currentSessionId: null,
  modelGroup: 'fast',
  error: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SELECT_SESSION':
      return { ...state, status: 'loading', error: null };

    case 'SESSION_LOADED':
      return {
        ...state,
        status: 'ready',
        currentSessionId: action.sessionId,
        messages: action.messages,
        error: null,
      };

    case 'NEW_CONVERSATION':
      return { ...initialState };

    case 'SEND_MESSAGE':
      return {
        ...state,
        status: 'streaming',
        messages: [...state.messages, action.userMsg, action.assistantMsg],
        error: null,
      };

    case 'SET_SESSION_ID':
      return { ...state, currentSessionId: action.sessionId };

    case 'TEXT_DELTA': {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.streaming) {
        msgs[msgs.length - 1] = { ...last, content: action.content };
      }
      return { ...state, messages: msgs };
    }

    case 'TOOL_CALL':
      return { ...state, messages: [...state.messages, action.message] };

    case 'TOOL_RESULT': {
      const msgs = [...state.messages];
      const idx = msgs.findLastIndex(
        (m) => m.toolName === action.toolName && !m.toolResult,
      );
      if (idx >= 0) {
        msgs[idx] = { ...msgs[idx], toolResult: action.result };
      }
      return { ...state, messages: msgs };
    }

    case 'MODEL_SWITCH':
      return { ...state, modelGroup: action.to };

    case 'STREAM_DONE':
      return {
        ...state,
        status: 'ready',
        messages: state.messages.map((m) =>
          m.streaming ? { ...m, streaming: false } : m,
        ),
      };

    case 'STREAM_ERROR':
      return {
        ...state,
        status: 'error',
        error: action.error,
        messages: state.messages.map((m) =>
          m.streaming ? { ...m, streaming: false } : m,
        ),
      };

    default:
      return state;
  }
}

// ── Hook ───────────────────────────────────────────────────────────────

interface UseChatSessionOptions {
  workspaceId: string;
  agentId?: string;
}

export function useChatSession({ workspaceId, agentId }: UseChatSessionOptions) {
  const { status: connectionStatus, request, on } = useWebSocket();
  const [state, dispatch] = useReducer(reducer, initialState);
  const streamingRef = useRef('');
  const invalidate = useInvalidate();

  // WebSocket event listeners
  useEffect(() => {
    const unsubs = [
      on('chat.text-delta', (data: unknown) => {
        const d = data as { content: string };
        streamingRef.current += d.content;
        dispatch({ type: 'TEXT_DELTA', content: streamingRef.current });
      }),

      on('chat.tool-call', (data: unknown) => {
        const d = data as { toolName: string; args: unknown };
        dispatch({
          type: 'TOOL_CALL',
          message: {
            id: crypto.randomUUID(),
            role: 'tool',
            content: '',
            timestamp: new Date().toISOString(),
            toolName: d.toolName,
            toolArgs: d.args,
          },
        });
      }),

      on('chat.tool-result', (data: unknown) => {
        const d = data as { toolName: string; result: string };
        dispatch({ type: 'TOOL_RESULT', toolName: d.toolName, result: d.result });
      }),

      on('chat.model-switch', (data: unknown) => {
        const d = data as { to: string };
        dispatch({ type: 'MODEL_SWITCH', to: d.to === 'slow' ? 'slow' : 'fast' });
      }),

      on('chat.done', () => {
        dispatch({ type: 'STREAM_DONE' });
        invalidate.sessions(workspaceId);
      }),

      on('chat.error', (data: unknown) => {
        const d = data as { message?: string };
        dispatch({ type: 'STREAM_ERROR', error: d.message ?? 'Stream error' });
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [on, workspaceId, invalidate]);

  // Select an existing session and load its transcript
  const selectSession = useCallback(
    async (sessionId: string) => {
      dispatch({ type: 'SELECT_SESSION', sessionId });
      try {
        const result = (await request('chat.history', {
          workspaceId,
          sessionId,
          limit: 200,
        })) as { transcript: Array<{
          timestamp: string;
          role: 'user' | 'assistant' | 'system' | 'tool';
          content: string;
          metadata?: {
            toolName?: string;
            toolCallId?: string;
            modelUsed?: string;
            modelGroup?: 'fast' | 'slow';
          };
        }> };

        const messages: ChatMessage[] = result.transcript.map((entry) => ({
          id: crypto.randomUUID(),
          role: entry.role,
          content: entry.content,
          timestamp: entry.timestamp,
          toolName: entry.metadata?.toolName,
          modelGroup: entry.metadata?.modelGroup,
        }));

        dispatch({ type: 'SESSION_LOADED', sessionId, messages });
      } catch (err) {
        dispatch({
          type: 'STREAM_ERROR',
          error: err instanceof Error ? err.message : 'Failed to load session',
        });
      }
    },
    [request, workspaceId],
  );

  // Send a new message
  const sendMessage = useCallback(
    async (
      text: string,
      options?: {
        files?: File[];
        agent?: ChatMessageAgent;
      },
    ) => {
      // Convert files to base64 data URLs
      let attachments: ChatMessage['attachments'];
      if (options?.files && options.files.length > 0) {
        attachments = await Promise.all(
          options.files.map(
            (file) =>
              new Promise<{ name: string; type: string; dataUrl: string }>(
                (resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () =>
                    resolve({
                      name: file.name,
                      type: file.type,
                      dataUrl: reader.result as string,
                    });
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                },
              ),
          ),
        );
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
        attachments,
      };

      streamingRef.current = '';
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        streaming: true,
        agent: options?.agent,
      };

      dispatch({ type: 'SEND_MESSAGE', userMsg, assistantMsg });

      try {
        const result = (await request('chat.send', {
          workspaceId,
          text,
          ...(agentId ? { agentId } : {}),
          ...(state.currentSessionId ? { sessionId: state.currentSessionId } : {}),
          ...(attachments ? { attachments } : {}),
        })) as { sessionId?: string };

        if (result?.sessionId && !state.currentSessionId) {
          dispatch({ type: 'SET_SESSION_ID', sessionId: result.sessionId });
        }
      } catch (err) {
        dispatch({
          type: 'STREAM_ERROR',
          error: err instanceof Error ? err.message : 'Failed to send message',
        });
      }
    },
    [workspaceId, agentId, request, state.currentSessionId],
  );

  // Start fresh conversation
  const newConversation = useCallback(() => {
    dispatch({ type: 'NEW_CONVERSATION' });
  }, []);

  // Retry last message
  const retry = useCallback(() => {
    const lastUserMsg = [...state.messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      sendMessage(lastUserMsg.content);
    }
  }, [state.messages, sendMessage]);

  return {
    messages: state.messages,
    state: state.status,
    modelGroup: state.modelGroup,
    connectionStatus,
    currentSessionId: state.currentSessionId,
    error: state.error,
    sendMessage,
    selectSession,
    newConversation,
    retry,
  };
}
