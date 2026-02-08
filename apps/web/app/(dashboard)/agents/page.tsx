'use client';

import { useEffect } from 'react';
import { useQueryState, parseAsString } from 'nuqs';
import { useGateway } from '@scooby/api-client/react';
import { Bot } from 'lucide-react';
import { AgentCard } from '@/features/agents/components/agent-card';
import { AgentDetailView } from '@/features/agents/components/agent-detail-view';

// ---------------------------------------------------------------------------
// Skeletons & empty state
// ---------------------------------------------------------------------------

function SidebarSkeleton() {
  return (
    <div className="space-y-1 p-1.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 animate-pulse">
          <div className="size-7 rounded-md skeleton" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-16 skeleton rounded" />
            <div className="h-2.5 w-10 skeleton rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="flex items-start gap-4">
        <div className="size-12 rounded-xl skeleton" />
        <div className="space-y-2 pt-1">
          <div className="h-5 w-32 skeleton rounded" />
          <div className="h-3.5 w-56 skeleton rounded" />
        </div>
      </div>
      <div className="h-10 w-96 skeleton rounded" />
      <div className="h-[460px] skeleton rounded-lg" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="empty-state-icon">
        <Bot className="h-7 w-7 text-neutral-400" />
      </div>
      <p className="text-sm font-medium text-neutral-500">No agents configured</p>
      <p className="mt-1 text-xs text-neutral-400">
        Add agent definitions to the agents directory to get started
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const { data: agents, isLoading } = useGateway.agents.list();
  const { data: tools = [] } = useGateway.tools.list();

  const [activeId, setActiveId] = useQueryState(
    'agent',
    parseAsString.withDefault(''),
  );

  // Auto-select first agent when nothing is selected or selection is invalid
  const hasValidSelection = !!(agents && agents.length > 0 && agents.find((a) => a.id === activeId));

  useEffect(() => {
    if (agents && agents.length > 0 && !hasValidSelection) {
      setActiveId(agents[0].id);
    }
  }, [agents, hasValidSelection, setActiveId]);

  const activeAgent = agents?.find((a) => a.id === activeId);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)]">
        <div className="w-[200px] shrink-0 border-r border-neutral-200 bg-neutral-50">
          <div className="px-4 py-3">
            <div className="h-4 w-16 skeleton rounded" />
          </div>
          <SidebarSkeleton />
        </div>
        <div className="flex-1 p-6">
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-[200px] shrink-0 border-r border-neutral-200 bg-neutral-50 overflow-y-auto">
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            Agents
          </h2>
        </div>
        <div className="px-1.5 pb-4 space-y-0.5">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isActive={agent.id === activeAgent?.id}
              onClick={() => setActiveId(agent.id)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto p-6">
        <div className="max-w-[1100px]">
          {activeAgent ? (
            <AgentDetailView
              key={activeAgent.id}
              agent={activeAgent}
              availableTools={tools}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-sm text-neutral-400">
              Select an agent
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
