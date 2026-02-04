'use client';

import type { ChatMessage } from '../../hooks/useChat';
import { StreamingText } from './StreamingText';
import { ToolCallCard } from './ToolCallCard';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'tool') {
    return (
      <div className="mx-auto max-w-2xl">
        <ToolCallCard
          toolName={message.toolName || 'unknown'}
          args={message.toolArgs}
          result={message.toolResult}
        />
      </div>
    );
  }

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <span className="rounded bg-gray-800 px-3 py-1 text-xs text-gray-400">
          {message.content}
        </span>
      </div>
    );
  }

  const timestamp = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-800 text-gray-100'
        }`}
      >
        <div className="mb-1 flex items-center gap-2">
          <span
            className={`text-xs font-medium ${
              isUser ? 'text-blue-200' : 'text-gray-400'
            }`}
          >
            {isUser ? 'You' : 'Assistant'}
          </span>
          <span
            className={`text-xs ${
              isUser ? 'text-blue-300' : 'text-gray-500'
            }`}
          >
            {timestamp}
          </span>
        </div>
        <div className="text-sm leading-relaxed">
          {message.role === 'assistant' ? (
            <StreamingText
              content={message.content}
              streaming={message.streaming}
            />
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}
