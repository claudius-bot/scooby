'use client';

import type { ChatMessage as ChatMessageType } from '@/hooks/useChatSession';
import { Avatar } from '@/components/avatar';
import { resolveAvatarUrl } from '@/lib/utils';
import { MarkdownRenderer } from './markdown-renderer';
import { ToolCallCard } from './tool-call-card-v2';
import { BouncingDots, BlinkingCursor } from './streaming-cursor';
import { Brain, Paperclip } from 'lucide-react';

interface ChatMessageProps {
  message: ChatMessageType;
  showAvatar?: boolean;
}

export function ChatMessage({ message, showAvatar = false }: ChatMessageProps) {
  // Tool messages
  if (message.role === 'tool') {
    return (
      <div className="mx-auto max-w-3xl px-4">
        <ToolCallCard
          toolName={message.toolName || 'unknown'}
          args={message.toolArgs}
          result={message.toolResult}
        />
      </div>
    );
  }

  // Compaction divider
  if (message.role === 'system' && message.content.startsWith('__compaction:')) {
    return (
      <div className="divider-text my-4 select-none text-neutral-400">
        Older messages compacted
      </div>
    );
  }

  // System messages
  if (message.role === 'system') {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] text-neutral-400">
          {message.content}
        </span>
      </div>
    );
  }

  const isUser = message.role === 'user';

  const timestamp = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // User messages
  if (isUser) {
    return (
      <div className="group flex justify-end">
        <div className="max-w-[80%]">
          {/* File attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
              {message.attachments.map((att, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-lg bg-neutral-200 px-2 py-1 text-[11px] text-neutral-600"
                >
                  <Paperclip className="size-3" />
                  {att.name}
                </span>
              ))}
            </div>
          )}
          <div className="rounded-2xl bg-neutral-100 px-4 py-2.5 text-neutral-900">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
          </div>
          <span className="mt-0.5 block text-right text-[11px] text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100">
            {timestamp}
          </span>
        </div>
      </div>
    );
  }

  // Assistant messages — use the per-message agent data
  const agent = message.agent;

  return (
    <div className="group">
      {message.modelGroup === 'slow' && (
        <div className="mb-1.5 ml-9">
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-600 border border-purple-100">
            <Brain className="size-3" />
            Deep thinking
          </span>
        </div>
      )}
      <div className="flex items-start gap-2.5">
        {showAvatar ? (
          <div className="shrink-0">
            <Avatar
              src={resolveAvatarUrl(agent?.avatar)}
              name={agent?.name ?? 'Assistant'}
              className="size-7 rounded-lg"
            />
          </div>
        ) : (
          <div className="size-7 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          {showAvatar && agent?.name && (
            <span className="mb-0.5 block text-[11px] font-medium text-neutral-500">
              {agent.emoji} {agent.name}
            </span>
          )}
          {message.streaming && !message.content ? (
            <BouncingDots />
          ) : (
            <div className="text-sm text-neutral-900">
              <MarkdownRenderer content={message.content} />
              {message.streaming && <BlinkingCursor />}
            </div>
          )}
          <span className="mt-0.5 block text-[11px] text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100">
            {timestamp}
          </span>
        </div>
      </div>
    </div>
  );
}
