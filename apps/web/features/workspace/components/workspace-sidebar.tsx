'use client';

import type { WorkspaceSummary } from '@scooby/schemas';
import { AgentAvatar } from './agent-avatar';

interface WorkspaceSidebarProps {
  workspaces: WorkspaceSummary[];
  activeId?: string;
  onSelect: (id: string) => void;
}

export function WorkspaceSidebar({ workspaces, activeId, onSelect }: WorkspaceSidebarProps) {
  return (
    <nav className="space-y-1 p-2">
      <h2 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Workspaces
      </h2>
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          onClick={() => onSelect(ws.id)}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
            ws.id === activeId
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
          }`}
        >
          <AgentAvatar agent={ws.agent} />
          <span className="truncate">{ws.agent.name}</span>
        </button>
      ))}
    </nav>
  );
}
