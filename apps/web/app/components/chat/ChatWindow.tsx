'use client';

import { useEffect, useRef } from 'react';
import { useChat } from '../../hooks/useChat';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';

interface ChatWindowProps {
  workspaceId: string;
}

export function ChatWindow({ workspaceId }: ChatWindowProps) {
  const { messages, sendMessage, isStreaming, modelGroup, connectionStatus } =
    useChat(workspaceId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      {/* Connection status bar */}
      <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            connectionStatus === 'connected'
              ? 'bg-green-500'
              : connectionStatus === 'connecting'
                ? 'bg-yellow-500'
                : 'bg-red-500'
          }`}
        />
        <span className="text-xs text-gray-400">
          {connectionStatus === 'connected'
            ? 'Connected'
            : connectionStatus === 'connecting'
              ? 'Connecting...'
              : 'Disconnected'}
        </span>
        {modelGroup === 'slow' && (
          <span className="ml-auto rounded bg-purple-900/50 px-2 py-0.5 text-xs text-purple-300">
            Deep thinking
          </span>
        )}
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-gray-500">
              Send a message to start the conversation.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 px-4 py-3">
        <ChatInput
          onSend={sendMessage}
          disabled={isStreaming || connectionStatus !== 'connected'}
        />
      </div>
    </div>
  );
}
