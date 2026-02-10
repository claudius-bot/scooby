'use client';

import type { AgentDetail } from '@scooby/schemas';
import { Avatar } from '@/components/avatar';
import { resolveAvatarUrl } from '@/lib/utils';

interface ChatEmptyStateProps {
  agent?: AgentDetail | null;
  onSuggestionClick: (text: string) => void;
}

const DEFAULT_SUGGESTIONS = [
  'What can you help me with?',
  'Summarize recent activity',
  'What tools do you have access to?',
];

export function ChatEmptyState({ agent, onSuggestionClick }: ChatEmptyStateProps) {
  const name = agent?.name ?? 'Assistant';
  const about = agent?.about;

  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <Avatar
        src={resolveAvatarUrl(agent?.avatar)}
        name={name}
        className="size-16 rounded-2xl"
      />
      <h2 className="mt-4 text-2xl font-semibold text-neutral-900" style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}>
        How can I help you today?
      </h2>
      {about && (
        <p className="mt-2 max-w-md text-center text-sm text-neutral-400">{about}</p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {DEFAULT_SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestionClick(s)}
            className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 hover:border-neutral-300"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
