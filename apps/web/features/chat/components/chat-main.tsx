'use client';

import { useMemo } from 'react';
import type { ChatMessage as ChatMessageType, ChatMessageAgent } from '@/hooks/useChatSession';
import type { AgentDetail } from '@scooby/schemas';
import { ConnectionStatus } from './connection-status';
import { ModelIndicator } from './model-indicator';
import { MessageThread } from './message-thread';
import { ChatMessage } from './chat-message';
import { ChatEmptyState } from './chat-empty-state';
import { ChatInputArea } from './chat-input-area';

interface ChatMainProps {
  messages: ChatMessageType[];
  status: string;
  modelGroup: 'fast' | 'slow';
  connectionStatus: string;
  isStreaming: boolean;
  agents: AgentDetail[];
  agentId?: string;
  onAgentChange: (id: string | undefined) => void;
  onSend: (text: string, options?: { files?: File[]; agent?: ChatMessageAgent }) => void;
  activeAgent?: AgentDetail | null;
}

export function ChatMain({
  messages,
  status,
  modelGroup,
  connectionStatus,
  isStreaming,
  agents,
  agentId,
  onAgentChange,
  onSend,
  activeAgent,
}: ChatMainProps) {
  // Compute which messages get avatars (first in a consecutive assistant group)
  const messageElements = useMemo(() => {
    return messages.map((msg, i) => {
      const prevRole = i > 0 ? messages[i - 1].role : null;
      const showAvatar = msg.role === 'assistant' && prevRole !== 'assistant';

      return (
        <div
          key={msg.id}
          className={
            msg.role === messages[i - 1]?.role ? 'mt-1' : i > 0 ? 'mt-6' : ''
          }
        >
          <ChatMessage
            message={msg}
            showAvatar={showAvatar}
          />
        </div>
      );
    });
  }, [messages]);

  // Last assistant content for TTS
  const lastAssistantContent = useMemo(() => {
    const last = [...messages].reverse().find(
      (m) => m.role === 'assistant' && m.content && !m.streaming,
    );
    return last?.content;
  }, [messages]);

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-2">
        <ConnectionStatus status={connectionStatus} />
        <div className="ml-auto">
          <ModelIndicator modelGroup={modelGroup} />
        </div>
      </div>

      {/* Message thread */}
      <MessageThread isStreaming={isStreaming} messageCount={messages.length}>
        {messages.length === 0 && status !== 'loading' ? (
          <ChatEmptyState agent={activeAgent} onSuggestionClick={(text) => onSend(text)} />
        ) : (
          <div>{messageElements}</div>
        )}
      </MessageThread>

      {/* Input area */}
      <div className="shrink-0 px-4 pb-4">
        <ChatInputArea
          onSend={onSend}
          isStreaming={isStreaming}
          connectionStatus={connectionStatus}
          agents={agents}
          agentId={agentId}
          onAgentChange={onAgentChange}
          lastAssistantContent={lastAssistantContent}
        />
      </div>
    </div>
  );
}
