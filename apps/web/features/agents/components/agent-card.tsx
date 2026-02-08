'use client';

import type { AgentDetail } from '@scooby/schemas';
import { Avatar } from '@/components/avatar';
import { cn } from '@/lib/utils';
import { getGatewayUrl } from '@/lib/gateway-config';

function resolveAvatarUrl(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  const base = getGatewayUrl();
  return base ? `${base}${path}` : undefined;
}

interface AgentCardProps {
  agent: AgentDetail;
  isActive: boolean;
  onClick: () => void;
}

export function AgentCard({ agent, isActive, onClick }: AgentCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-md px-2.5 py-2 transition-all',
        isActive
          ? 'bg-white shadow-sm ring-1 ring-accent-500/30'
          : 'hover:bg-white/50',
      )}
    >
      <div className="flex items-center gap-2.5">
        <Avatar
          src={resolveAvatarUrl(agent.avatar)}
          name={agent.name}
          className="size-7 rounded-md shrink-0"
        />
        <span className={cn(
          'text-[13px] font-medium truncate',
          isActive ? 'text-neutral-900' : 'text-neutral-600',
        )}>
          {agent.name}
        </span>
        <span className={cn(
          'ml-auto shrink-0 text-[11px] tabular-nums rounded bg-neutral-100 px-1.5 py-0.5',
          isActive ? 'text-neutral-500' : 'text-neutral-400',
        )}>
          {agent.tools.length} tools
        </span>
      </div>
    </button>
  );
}
