'use client';

import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import {
  isToday,
  isYesterday,
  differenceInDays,
  formatDistanceToNow,
} from 'date-fns';
import { cn } from '@/lib/utils';
import type { SessionMetadata } from '@scooby/schemas';

// ── Types ──────────────────────────────────────────────────────────────

interface ChatSidebarProps {
  sessions: SessionMetadata[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  isLoading?: boolean;
}

interface SessionGroup {
  label: string;
  sessions: SessionMetadata[];
}

// ── Helpers ────────────────────────────────────────────────────────────

function groupSessions(sessions: SessionMetadata[]): SessionGroup[] {
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  );

  const groups: Record<string, SessionMetadata[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    Older: [],
  };

  for (const session of sorted) {
    const date = new Date(session.lastActiveAt);
    if (isToday(date)) {
      groups['Today'].push(session);
    } else if (isYesterday(date)) {
      groups['Yesterday'].push(session);
    } else if (differenceInDays(new Date(), date) <= 7) {
      groups['Previous 7 Days'].push(session);
    } else {
      groups['Older'].push(session);
    }
  }

  return Object.entries(groups)
    .filter(([, sessions]) => sessions.length > 0)
    .map(([label, sessions]) => ({ label, sessions }));
}

// ── Skeleton ───────────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg px-3 py-2.5">
          <div className="h-3.5 w-32 rounded skeleton" />
          <div className="mt-1.5 h-2.5 w-20 rounded skeleton" />
        </div>
      ))}
    </div>
  );
}

// ── Session Row ────────────────────────────────────────────────────────

function SessionRow({
  session,
  isActive,
  onClick,
}: {
  session: SessionMetadata;
  isActive: boolean;
  onClick: () => void;
}) {
  const relativeTime = formatDistanceToNow(new Date(session.lastActiveAt), {
    addSuffix: true,
  });

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-lg px-3 py-2.5 text-left transition-all',
        isActive
          ? 'bg-white shadow-sm ring-1 ring-accent-500/30'
          : 'hover:bg-white/50',
      )}
    >
      <div className="truncate text-[13px] font-medium text-neutral-700">
        {session.conversationId || 'New conversation'}
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-400">
        <span>{relativeTime}</span>
        <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium">
          {session.messageCount}
        </span>
      </div>
    </button>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────

export function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  isLoading,
}: ChatSidebarProps) {
  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-neutral-200 bg-neutral-50">
      {/* New Chat button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700"
        >
          <Plus className="size-4" />
          New Chat
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <SidebarSkeleton />
        ) : groups.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-neutral-400">
            No conversations yet
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.sessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    onClick={() => onSelectSession(session.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
