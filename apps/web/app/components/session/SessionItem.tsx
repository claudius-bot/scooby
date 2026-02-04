'use client';

import type { SessionInfo } from '../../hooks/useSessions';

interface SessionItemProps {
  session: SessionInfo;
  onClick: () => void;
}

export function SessionItem({ session, onClick }: SessionItemProps) {
  const date = new Date(session.lastActiveAt);
  const formattedDate = date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const statusColor =
    session.status === 'active'
      ? 'bg-green-500'
      : session.status === 'idle'
        ? 'bg-yellow-500'
        : 'bg-gray-500';

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-800/50"
    >
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusColor}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="truncate text-gray-300">
            {session.channelType}
          </span>
          <span className="ml-2 shrink-0 text-xs text-gray-500">
            {formattedDate}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {session.messageCount} message{session.messageCount !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-gray-600">{formattedTime}</span>
        </div>
      </div>
    </button>
  );
}
