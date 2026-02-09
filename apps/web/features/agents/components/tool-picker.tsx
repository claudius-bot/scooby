'use client';

import type { ToolSummary } from '@scooby/schemas';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface ToolPickerProps {
  availableTools: ToolSummary[];
  selectedTools: string[];
  universalTools: string[];
  onChange: (tools: string[]) => void;
}

/** Map tool name prefix to a human-friendly group label. */
const TOOL_GROUPS: Record<string, string> = {
  file: 'Files',
  shell: 'Runtime',
  web: 'Web',
  memory: 'Memory',
  scratchpad: 'Scratchpad',
  send: 'Messaging',
  phone: 'Phone',
  browser: 'Browser',
  image: 'Media',
  audio: 'Media',
  tts: 'Media',
  cron: 'Scheduling',
  agent: 'Agents',
};

function getToolGroup(name: string): string {
  for (const [prefix, label] of Object.entries(TOOL_GROUPS)) {
    if (name.startsWith(prefix)) return label;
  }
  return 'Other';
}

export function ToolPicker({
  availableTools,
  selectedTools,
  universalTools,
  onChange,
}: ToolPickerProps) {
  const universalSet = new Set(universalTools);

  const toggle = (toolName: string) => {
    if (selectedTools.includes(toolName)) {
      onChange(selectedTools.filter((t) => t !== toolName));
    } else {
      onChange([...selectedTools, toolName]);
    }
  };

  const enableAll = () => onChange(availableTools.map((t) => t.name));
  const disableAll = () => onChange([]);

  if (availableTools.length === 0) {
    return <p className="text-sm text-neutral-400 py-6 text-center">No tools available</p>;
  }

  // Group tools
  const grouped = new Map<string, ToolSummary[]>();
  for (const tool of availableTools) {
    const group = getToolGroup(tool.name);
    const existing = grouped.get(group) ?? [];
    existing.push(tool);
    grouped.set(group, existing);
  }

  const selectedCount = selectedTools.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          <span className="font-semibold text-neutral-900 tabular-nums">{selectedCount}</span>/
          {availableTools.length} tools enabled
          {universalTools.length > 0 && (
            <span className="text-neutral-400"> + {universalTools.length} universal</span>
          )}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={enableAll}
            className="px-2.5 py-1 text-[12px] font-medium text-neutral-600 rounded-md border border-neutral-200 hover:bg-neutral-50 transition-colors"
          >
            Enable All
          </button>
          <button
            onClick={disableAll}
            className="px-2.5 py-1 text-[12px] font-medium text-neutral-600 rounded-md border border-neutral-200 hover:bg-neutral-50 transition-colors"
          >
            Disable All
          </button>
        </div>
      </div>

      {/* Grouped tool grid */}
      {Array.from(grouped.entries()).map(([group, tools]) => {
        const groupSelected = tools.filter(
          (t) => selectedTools.includes(t.name) || universalSet.has(t.name)
        ).length;
        return (
          <div key={group}>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-[13px] font-semibold text-neutral-900">{group}</h4>
              <span className="text-[11px] text-neutral-400 tabular-nums">
                {groupSelected}/{tools.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {tools.map((tool) => {
                const isUniversal = universalSet.has(tool.name);
                const checked = isUniversal || selectedTools.includes(tool.name);
                return (
                  <div
                    key={tool.name}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                      isUniversal
                        ? 'border-accent-200 bg-accent-50/50'
                        : checked
                          ? 'border-neutral-200 bg-white'
                          : 'border-neutral-100 bg-neutral-50/50'
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p
                          className={cn(
                            'text-[13px] font-medium',
                            isUniversal
                              ? 'text-accent-700'
                              : checked
                                ? 'text-neutral-900'
                                : 'text-neutral-500'
                          )}
                        >
                          {tool.name}
                        </p>
                        {isUniversal && (
                          <span className="text-[10px] font-medium text-accent-600 bg-accent-100 px-1.5 py-0.5 rounded-full leading-none">
                            always on
                          </span>
                        )}
                      </div>
                      {tool.description && (
                        <p className="text-[11px] text-neutral-400 truncate leading-tight mt-0.5">
                          {tool.description}
                        </p>
                      )}
                    </div>
                    {isUniversal ? (
                      <div
                        className="shrink-0 w-9 h-5 rounded-full bg-accent-500 flex items-center justify-end px-0.5 cursor-not-allowed"
                        title="Universal tool — always available to all agents"
                      >
                        <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </div>
                    ) : (
                      <Switch
                        checked={checked}
                        onCheckedChange={() => toggle(tool.name)}
                        className="shrink-0"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
