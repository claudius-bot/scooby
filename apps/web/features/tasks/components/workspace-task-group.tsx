'use client';

import type { WorkspaceSummary } from '@scooby/schemas';
import type { CronJob, CronRun } from './types';
import { TaskRow } from './task-row';
import { ChevronDown, ChevronRight, FolderCog } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/badge';
import { resolveAvatarUrl } from '@/lib/utils';

interface WorkspaceTaskGroupProps {
  workspace: WorkspaceSummary;
  jobs: CronJob[];
  history: CronRun[];
  onToggleJob?: (workspaceId: string, jobId: string, enabled: boolean) => void;
  onRemoveJob?: (workspaceId: string, jobId: string) => void;
  onEditJob?: (workspaceId: string, job: CronJob) => void;
}

export function WorkspaceTaskGroup({
  workspace,
  jobs,
  history,
  onToggleJob,
  onRemoveJob,
  onEditJob,
}: WorkspaceTaskGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const activeCount = jobs.filter((j) => j.enabled !== false).length;
  const runningCount = jobs.filter((j) => !!j.state?.runningAtMs).length;
  const errorCount = jobs.filter((j) => j.state?.lastStatus === 'error').length;

  return (
    <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
      {/* Group header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50/60 transition-colors text-left"
      >
        <div className="p-1 rounded text-neutral-400">
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </div>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FolderCog className="h-4 w-4 text-neutral-500 shrink-0" />
          <span className="text-sm font-semibold text-neutral-900 truncate">
            {workspace.agent.name}
          </span>
          <span className="text-[11px] text-neutral-400 font-mono truncate">
            {workspace.id.length > 24 ? `...${workspace.id.slice(-20)}` : workspace.id}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {runningCount > 0 && (
            <Badge variant="blue" size="xs" text={`${runningCount} running`} />
          )}
          {errorCount > 0 && (
            <Badge variant="red" size="xs" text={`${errorCount} error`} />
          )}
          <Badge
            variant="gray"
            size="xs"
            text={`${activeCount}/${jobs.length} active`}
          />
        </div>
      </button>

      {/* Job rows */}
      {!collapsed && (
        <div className="border-t border-neutral-100">
          {jobs.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-[12px] text-neutral-400">
              No tasks configured for this workspace
            </div>
          ) : (
            jobs.map((job) => (
              <TaskRow
                key={job.id}
                entry={job}
                workspaceId={workspace.id}
                agentName={workspace.agent.name}
                agentAvatar={resolveAvatarUrl(workspace.agent.avatar)}
                history={history}
                onToggle={(jobId, enabled) => onToggleJob?.(workspace.id, jobId, enabled)}
                onRemove={(jobId) => onRemoveJob?.(workspace.id, jobId)}
                onEdit={(j) => onEditJob?.(workspace.id, j)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
