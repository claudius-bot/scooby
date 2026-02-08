'use client';

import { useState, useEffect } from 'react';
import type { AgentDetail, ToolSummary } from '@scooby/schemas';
import { useGateway, useInvalidate } from '@scooby/api-client/react';
import { cn, formatModelName, resolveAvatarUrl } from '@/lib/utils';
import { Avatar } from '@/components/avatar';
import { AgentFileEditor } from './agent-file-editor';
import { ToolPicker } from './tool-picker';
import { ModelPicker } from './model-picker';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { Wrench, Globe, Save, Scroll, User, Cpu, Settings } from 'lucide-react';

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'soul', label: 'Soul', icon: Scroll },
  { id: 'identity', label: 'Identity', icon: User },
  { id: 'tools-md', label: 'Tools Prompt', icon: Cpu },
  { id: 'tools', label: 'Tool Access', icon: Wrench },
  { id: 'config', label: 'Config', icon: Settings },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AgentDetailViewProps {
  agent: AgentDetail;
  availableTools: ToolSummary[];
}

export function AgentDetailView({ agent, availableTools }: AgentDetailViewProps) {
  const { data: files, isLoading: filesLoading } = useGateway.agents.files({ id: agent.id });
  const [activeTab, setActiveTab] = useState<TabId>('soul');

  // Config form state
  const [model, setModel] = useState(agent.model);
  const [fallbackModel, setFallbackModel] = useState(agent.fallbackModel ?? '');
  const [tools, setTools] = useState(agent.tools);
  const [universal, setUniversal] = useState(agent.universal);
  const invalidate = useInvalidate();
  const updateMutation = useGateway.agents.update();

  // Sync form state when agent changes
  useEffect(() => {
    setModel(agent.model);
    setFallbackModel(agent.fallbackModel ?? '');
    setTools(agent.tools);
    setUniversal(agent.universal);
  }, [agent.id, agent.model, agent.fallbackModel, agent.tools, agent.universal]);

  const configDirty =
    model !== agent.model ||
    fallbackModel !== (agent.fallbackModel ?? '') ||
    JSON.stringify(tools) !== JSON.stringify(agent.tools) ||
    universal !== agent.universal;

  const handleSaveConfig = () => {
    updateMutation.mutate(
      {
        id: agent.id,
        updates: { model, fallbackModel: fallbackModel || null, tools, universal },
      },
      {
        onSuccess: () => {
          toast.success('Configuration saved');
          invalidate.agent(agent.id);
          invalidate.agents();
        },
        onError: (err) => {
          toast.error(`Failed to save: ${err.message}`);
        },
      },
    );
  };

  // Count for Tools tab badge
  const toolCount = `${tools.length}`;

  return (
    <div className="animate-fade-in">
      {/* ── Agent header ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-4 mb-5">
        <Avatar
          src={resolveAvatarUrl(agent.avatar)}
          name={agent.name}
          className="size-12 rounded-xl"
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="title text-xl text-neutral-900">{agent.name}</h2>
          {agent.about && (
            <p className="mt-0.5 text-sm text-neutral-500">{agent.about}</p>
          )}
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-neutral-200 mb-5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors rounded-t-md',
                isActive
                  ? 'text-neutral-900'
                  : 'text-neutral-400 hover:text-neutral-600',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.id === 'tools' && (
                <span className={cn(
                  'ml-0.5 text-[11px] tabular-nums px-1.5 py-0.5 rounded-full',
                  isActive ? 'bg-neutral-100 text-neutral-700' : 'bg-neutral-100/60 text-neutral-400',
                )}>
                  {toolCount}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────── */}

      {/* Soul tab */}
      {activeTab === 'soul' && (
        filesLoading ? <EditorSkeleton /> : (
          <AgentFileEditor
            agentId={agent.id}
            fileName="soul"
            initialContent={files?.soul ?? ''}
          />
        )
      )}

      {/* Identity tab */}
      {activeTab === 'identity' && (
        filesLoading ? <EditorSkeleton /> : (
          <AgentFileEditor
            agentId={agent.id}
            fileName="identity"
            initialContent={files?.identity ?? ''}
          />
        )
      )}

      {/* Tools Prompt tab (TOOLS.md file) */}
      {activeTab === 'tools-md' && (
        filesLoading ? <EditorSkeleton /> : (
          <AgentFileEditor
            agentId={agent.id}
            fileName="tools"
            initialContent={files?.tools ?? ''}
          />
        )
      )}

      {/* Tool Access tab — grid of tools with switches */}
      {activeTab === 'tools' && (
        <ToolPicker
          availableTools={availableTools}
          selectedTools={tools}
          onChange={setTools}
        />
      )}

      {/* Config tab */}
      {activeTab === 'config' && (
        <div className="max-w-2xl space-y-6">
          {/* Models */}
          <section className="space-y-4">
            <h4 className="text-[13px] font-semibold text-neutral-900">Models</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ModelPicker value={model} onChange={setModel} label="Default Model" />
              <ModelPicker
                value={fallbackModel}
                onChange={setFallbackModel}
                label="Fallback Model"
                allowClear
              />
            </div>
          </section>

          {/* Settings */}
          <section className="space-y-4">
            <h4 className="text-[13px] font-semibold text-neutral-900">Settings</h4>
            <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3">
              <div>
                <p className="text-sm text-neutral-900">Universal tools</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Include shared tools available to all agents
                </p>
              </div>
              <Switch checked={universal} onCheckedChange={setUniversal} />
            </div>
          </section>
        </div>
      )}

      {/* ── Floating save bar ─────────────────────────────────────────── */}
      {(activeTab === 'tools' || activeTab === 'config') && configDirty && (
        <div className="sticky bottom-4 mt-6 flex items-center justify-between rounded-lg border border-neutral-200 bg-white/95 backdrop-blur-sm px-4 py-3 shadow-lg">
          <p className="text-sm text-neutral-500">You have unsaved changes</p>
          <button
            onClick={handleSaveConfig}
            disabled={updateMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function EditorSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-3 w-20 bg-neutral-100 rounded" />
      <div className="h-[420px] bg-neutral-50 rounded-lg border border-neutral-100" />
    </div>
  );
}
