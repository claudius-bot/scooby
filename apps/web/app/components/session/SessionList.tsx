'use client';

import type { SessionInfo } from '../../hooks/useSessions';
import { SessionItem } from './SessionItem';

interface SessionListProps {
  sessions: SessionInfo[];
  onSelect: (id: string) => void;
}

export function SessionList({ sessions, onSelect }: SessionListProps) {
  const sorted = [...sessions].sort(
    (a, b) =>
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-sm text-gray-500">
        No sessions yet
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      <h2 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Sessions
      </h2>
      {sorted.map((session) => (
        <SessionItem
          key={session.id}
          session={session}
          onClick={() => onSelect(session.id)}
        />
      ))}
    </div>
  );
}
