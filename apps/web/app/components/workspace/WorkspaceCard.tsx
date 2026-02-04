'use client';

import type { WorkspaceInfo } from '../../hooks/useWorkspaces';

interface WorkspaceCardProps {
  workspace: WorkspaceInfo;
  onClick?: () => void;
}

export function WorkspaceCard({ workspace, onClick }: WorkspaceCardProps) {
  const { agent } = workspace;

  return (
    <button
      onClick={onClick}
      className="group w-full rounded-xl border border-gray-800 bg-gray-900 p-5 text-left transition-all hover:border-gray-600 hover:bg-gray-800/80"
    >
      <div className="mb-3 text-4xl">{agent.emoji}</div>
      <h3 className="text-lg font-semibold text-gray-100 group-hover:text-white">
        {agent.name}
      </h3>
      <p className="mt-2 text-xs text-gray-500">{agent.vibe}</p>
    </button>
  );
}
