'use client';

import { useState, useMemo, useCallback } from 'react';
import { useGateway, useInvalidate } from '@scooby/api-client/react';
import type { WorkspaceSummary } from '@scooby/schemas';
import type { AgentDetail } from '@scooby/schemas';
import type { CronJob, CronRun } from '@/features/tasks/components/types';
import { TitleActionHeader } from '@/components/title-action-header';
import { HeroStats } from '@/features/dashboard/components/hero-stats';
import { StatusDot } from '@/components/ui/status-dot';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { useModal } from '@/components/modal/provider';
import { ConfirmModal } from '@/components/modal/modals/confirm-modal';
import { WorkspaceTaskGroup } from '@/features/tasks/components/workspace-task-group';
import { TaskRow } from '@/features/tasks/components/task-row';
import { TaskFormModal } from '@/features/tasks/components/task-form-modal';
import { PillTabs, type PillTabItem } from '@/components/ui/pill-tabs';
import { formatNumber, resolveAvatarUrl, getRelativeTime } from '@/lib/utils';
import {
  Plus,
  RefreshCw,
  ListChecks,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  CalendarClock,
  LayoutList,
  Layers,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'grouped' | 'flat';
type StatusFilter = 'all' | 'active' | 'paused' | 'running' | 'error';

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function TasksSkeleton() {
  return (
    <div className="space-y-3 stagger-children">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
            <div className="h-4 w-4 skeleton rounded" />
            <div className="h-4 w-32 skeleton rounded" />
            <div className="flex-1" />
            <div className="h-4 w-20 skeleton rounded" />
          </div>
          <div className="border-t border-neutral-100">
            {Array.from({ length: 2 }).map((_, j) => (
              <div
                key={j}
                className="flex items-center gap-3 px-4 py-3 animate-pulse border-b border-neutral-100 last:border-b-0"
              >
                <div className="h-3 w-3 skeleton rounded" />
                <div className="h-2 w-2 skeleton rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 w-40 skeleton rounded" />
                  <div className="h-2.5 w-64 skeleton rounded" />
                </div>
                <div className="h-3 w-24 skeleton rounded" />
                <div className="h-4 w-14 skeleton rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ filtered }: { filtered?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="empty-state-icon">
        <ListChecks className="h-7 w-7 text-neutral-400" />
      </div>
      <p className="text-sm font-medium text-neutral-500">
        {filtered ? 'No tasks match your filters' : 'No tasks configured'}
      </p>
      <p className="mt-1 text-xs text-neutral-400 max-w-xs">
        {filtered
          ? 'Try adjusting your search or filter criteria'
          : 'Add cron jobs to your workspace configuration to automate agent tasks'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

const STATUS_FILTERS: PillTabItem<StatusFilter>[] = [
  { id: 'all', label: 'All', icon: LayoutList },
  { id: 'active', label: 'Active', icon: CheckCircle2 },
  { id: 'running', label: 'Running', icon: Zap },
  { id: 'error', label: 'Errors', icon: XCircle },
  { id: 'paused', label: 'Paused', icon: Clock },
];

// ---------------------------------------------------------------------------
// Recent activity item
// ---------------------------------------------------------------------------

function RecentRunItem({ run, jobName }: { run: CronRun; jobName: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-md hover:bg-neutral-50 transition-colors">
      <StatusDot
        variant={
          run.status === 'success' ? 'success' : run.status === 'error' ? 'error' : 'neutral'
        }
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-neutral-900">{jobName}</span>
          <span className="shrink-0 text-[11px] text-neutral-400 tabular-nums">
            {getRelativeTime(run.startedAt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge
            variant={run.status === 'success' ? 'green' : run.status === 'error' ? 'red' : 'gray'}
            size="xs"
            text={run.status}
          />
          {run.durationMs != null && (
            <span className="text-[11px] text-neutral-400 tabular-nums">
              {formatNumber(run.durationMs)}ms
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');

  const { data: workspaces = [], isLoading: wsLoading } = useGateway.workspaces.list();
  const { data: agents = [] } = useGateway.agents.list();
  const invalidate = useInvalidate();
  const modal = useModal();
  const addCron = useGateway.cron.add();
  const removeCron = useGateway.cron.remove();

  // Fetch cron jobs + history for each workspace
  const ws0 = workspaces[0]?.id ?? '';
  const ws1 = workspaces[1]?.id ?? '';
  const ws2 = workspaces[2]?.id ?? '';
  const ws3 = workspaces[3]?.id ?? '';
  const ws4 = workspaces[4]?.id ?? '';

  const cronQ0 = useGateway.cron.list({ workspaceId: ws0 }, { enabled: !!ws0 });
  const cronQ1 = useGateway.cron.list({ workspaceId: ws1 }, { enabled: !!ws1 });
  const cronQ2 = useGateway.cron.list({ workspaceId: ws2 }, { enabled: !!ws2 });
  const cronQ3 = useGateway.cron.list({ workspaceId: ws3 }, { enabled: !!ws3 });
  const cronQ4 = useGateway.cron.list({ workspaceId: ws4 }, { enabled: !!ws4 });

  const histQ0 = useGateway.cron.history({ workspaceId: ws0, limit: 20 }, { enabled: !!ws0 });
  const histQ1 = useGateway.cron.history({ workspaceId: ws1, limit: 20 }, { enabled: !!ws1 });
  const histQ2 = useGateway.cron.history({ workspaceId: ws2, limit: 20 }, { enabled: !!ws2 });
  const histQ3 = useGateway.cron.history({ workspaceId: ws3, limit: 20 }, { enabled: !!ws3 });
  const histQ4 = useGateway.cron.history({ workspaceId: ws4, limit: 20 }, { enabled: !!ws4 });

  const bindQ0 = useGateway.channels.bindings({ workspaceId: ws0 }, { enabled: !!ws0 });
  const bindQ1 = useGateway.channels.bindings({ workspaceId: ws1 }, { enabled: !!ws1 });
  const bindQ2 = useGateway.channels.bindings({ workspaceId: ws2 }, { enabled: !!ws2 });
  const bindQ3 = useGateway.channels.bindings({ workspaceId: ws3 }, { enabled: !!ws3 });
  const bindQ4 = useGateway.channels.bindings({ workspaceId: ws4 }, { enabled: !!ws4 });

  const isLoading =
    wsLoading ||
    cronQ0.isLoading ||
    cronQ1.isLoading ||
    cronQ2.isLoading ||
    cronQ3.isLoading ||
    cronQ4.isLoading;

  // Build workspace → jobs, history & bindings maps
  const workspaceCronMap = useMemo(() => {
    const map = new Map<string, { jobs: CronJob[]; history: CronRun[]; bindings: Array<{ channelType: string; conversationId: string }> }>();
    const cronQueries = [cronQ0, cronQ1, cronQ2, cronQ3, cronQ4];
    const histQueries = [histQ0, histQ1, histQ2, histQ3, histQ4];
    const bindQueries = [bindQ0, bindQ1, bindQ2, bindQ3, bindQ4];
    const wsIds = [ws0, ws1, ws2, ws3, ws4];

    wsIds.forEach((wsId, i) => {
      if (wsId) {
        map.set(wsId, {
          jobs: cronQueries[i].data ?? [],
          history: histQueries[i].data ?? [],
          bindings: bindQueries[i].data ?? [],
        });
      }
    });
    return map;
  }, [
    ws0,
    ws1,
    ws2,
    ws3,
    ws4,
    cronQ0.data,
    cronQ1.data,
    cronQ2.data,
    cronQ3.data,
    cronQ4.data,
    histQ0.data,
    histQ1.data,
    histQ2.data,
    histQ3.data,
    histQ4.data,
    bindQ0.data,
    bindQ1.data,
    bindQ2.data,
    bindQ3.data,
    bindQ4.data,
  ]);

  // Aggregate stats
  const allJobs = useMemo(() => {
    const jobs: (CronJob & { _wsId: string })[] = [];
    workspaceCronMap.forEach((v, wsId) => {
      v.jobs.forEach((j) => jobs.push({ ...j, _wsId: wsId }));
    });
    return jobs;
  }, [workspaceCronMap]);

  const allHistory = useMemo(() => {
    const runs: CronRun[] = [];
    workspaceCronMap.forEach((v) => {
      runs.push(...v.history);
    });
    return runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [workspaceCronMap]);

  const totalJobs = allJobs.length;
  const activeJobs = allJobs.filter((j) => j.enabled !== false).length;
  const runningJobs = allJobs.filter((j) => !!j.state?.runningAtMs).length;
  const errorJobs = allJobs.filter((j) => j.state?.lastStatus === 'error').length;
  const successRate =
    allHistory.length > 0
      ? Math.round(
          (allHistory.filter((r) => r.status === 'success').length / allHistory.length) * 100
        )
      : 0;

  // Filter jobs
  const filteredWorkspaces = useMemo(() => {
    return workspaces
      .map((ws) => {
        const data = workspaceCronMap.get(ws.id);
        if (!data) return null;

        let { jobs } = data;

        // Status filter
        if (statusFilter !== 'all') {
          jobs = jobs.filter((j) => {
            switch (statusFilter) {
              case 'active':
                return j.enabled !== false;
              case 'paused':
                return j.enabled === false;
              case 'running':
                return !!j.state?.runningAtMs;
              case 'error':
                return j.state?.lastStatus === 'error';
              default:
                return true;
            }
          });
        }

        // Search filter
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          jobs = jobs.filter(
            (j) =>
              (j.name ?? '').toLowerCase().includes(q) ||
              j.id.toLowerCase().includes(q) ||
              j.prompt.toLowerCase().includes(q)
          );
        }

        if (jobs.length === 0) return null;
        return { workspace: ws, jobs, history: data.history };
      })
      .filter(Boolean) as { workspace: WorkspaceSummary; jobs: CronJob[]; history: CronRun[] }[];
  }, [workspaces, workspaceCronMap, statusFilter, searchQuery]);

  const totalFilteredJobs = filteredWorkspaces.reduce((sum, g) => sum + g.jobs.length, 0);

  // Job name lookup for recent runs
  const jobNameMap = useMemo(() => {
    const map = new Map<string, string>();
    allJobs.forEach((j) => map.set(j.id, j.name || j.id));
    return map;
  }, [allJobs]);

  // Handlers
  const handleRefresh = () => {
    workspaces.forEach((ws) => invalidate.cron(ws.id));
  };

  const openCreateModal = useCallback(
    (workspaceId?: string) => {
      const targetWsId = workspaceId ?? workspaces[0]?.id;
      if (!targetWsId) return;

      const wsBindings = workspaceCronMap.get(targetWsId)?.bindings ?? [];
      modal.show(
        <TaskFormModal
          agents={agents}
          bindings={wsBindings}
          onSubmit={async (job) => {
            const payload = { ...job, source: job.source ?? 'config', enabled: job.enabled ?? true };
            await addCron.mutateAsync({
              workspaceId: targetWsId,
              job: payload as Parameters<typeof addCron.mutateAsync>[0]['job'],
            });
            invalidate.cron(targetWsId);
          }}
        />
      );
    },
    [workspaces, workspaceCronMap, agents, modal, addCron, invalidate]
  );

  const openEditModal = useCallback(
    (workspaceId: string, job: CronJob) => {
      const wsBindings = workspaceCronMap.get(workspaceId)?.bindings ?? [];
      modal.show(
        <TaskFormModal
          job={job}
          agents={agents}
          bindings={wsBindings}
          onSubmit={async (updated) => {
            const payload = { ...updated, source: updated.source ?? 'config', enabled: updated.enabled ?? true };
            // Remove old and re-add with updated data
            await removeCron.mutateAsync({ workspaceId, jobId: job.id });
            await addCron.mutateAsync({
              workspaceId,
              job: payload as Parameters<typeof addCron.mutateAsync>[0]['job'],
            });
            invalidate.cron(workspaceId);
          }}
        />
      );
    },
    [workspaceCronMap, agents, modal, addCron, removeCron, invalidate]
  );

  const handleToggleJob = useCallback(
    (workspaceId: string, jobId: string, enabled: boolean) => {
      // Find the existing job and re-add with toggled enabled state
      const data = workspaceCronMap.get(workspaceId);
      const job = data?.jobs.find((j) => j.id === jobId);
      if (!job) return;

      const { state, ...jobWithoutState } = job;
      const payload = { ...jobWithoutState, source: jobWithoutState.source ?? 'config', enabled };
      addCron.mutate(
        { workspaceId, job: payload as Parameters<typeof addCron.mutateAsync>[0]['job'] },
        { onSuccess: () => invalidate.cron(workspaceId) }
      );
    },
    [workspaceCronMap, addCron, invalidate]
  );

  const handleRemoveJob = useCallback(
    (workspaceId: string, jobId: string) => {
      const jobName = workspaceCronMap.get(workspaceId)?.jobs.find((j) => j.id === jobId)?.name ?? jobId;
      modal.show(
        <ConfirmModal
          title="Remove Task"
          description={`Are you sure you want to remove "${jobName}"? This action cannot be undone.`}
          onConfirm={() => {
            removeCron.mutate(
              { workspaceId, jobId },
              { onSuccess: () => invalidate.cron(workspaceId) }
            );
            modal.hide();
          }}
          buttonProps={{ variant: 'destructive', text: 'Remove' }}
        />
      );
    },
    [workspaceCronMap, modal, removeCron, invalidate]
  );

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-4">
      {/* Title row */}
      <TitleActionHeader
        title="Tasks"
        subtitle="Manage cron jobs, scheduled prompts, and automated agent work"
        actions={
          <div className="flex items-center gap-2">
            <Button
              className="h-10"
              tooltip="Refresh"
              variant="outline"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={handleRefresh}
            />
            <Button
              className="h-10"
              text="New Task"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => openCreateModal()}
              disabled={workspaces.length === 0}
            />
          </div>
        }
      />

      {/* Hero stat */}
      {/* <div className="mb-6">
        <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-3">
          Scheduled Tasks
        </p>
        {isLoading ? (
          <div className="h-20 w-48 skeleton rounded-lg" />
        ) : (
          <div className="stat-number text-7xl md:text-8xl text-neutral-900 tabular-nums">
            {formatNumber(totalJobs)}
            {runningJobs > 0 && <span className="stat-highlight"> live</span>}
          </div>
        )}
      </div> */}

      {/* Stats bar */}
      <HeroStats
        stats={[
          {
            label: 'Active',
            value: activeJobs,
            content: <StatusDot variant="success" pulse size="sm" />,
          },
          {
            label: 'Running',
            value: runningJobs,
            content: runningJobs > 0 ? <StatusDot variant="info" pulse size="sm" /> : undefined,
          },
          {
            label: 'Errors',
            value: errorJobs,
            variant: errorJobs > 0 ? 'danger' : 'default',
          },
          {
            label: 'Success Rate',
            value: allHistory.length > 0 ? `${successRate}%` : '—',
          },
        ]}
      />

      {/* Filter + search bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Status pills */}
        <PillTabs
          items={STATUS_FILTERS.map((f) =>
            f.id === 'error' && errorJobs > 0
              ? {
                  ...f,
                  right: (
                    <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-100 text-red-700 text-[10px] font-semibold tabular-nums">
                      {errorJobs}
                    </span>
                  ),
                }
              : f
          )}
          value={statusFilter}
          onChange={setStatusFilter}
        />

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-48 rounded-md border border-neutral-200 bg-white pl-8 pr-3 text-[12px] text-neutral-700 placeholder:text-neutral-400 focus:ring-1 focus:ring-neutral-300 focus:border-neutral-300 transition-colors"
            />
          </div>

          {/* View toggle */}
          <div className="icon-btn-group">
            <button
              onClick={() => setViewMode('grouped')}
              className={`icon-btn ${viewMode === 'grouped' ? 'icon-btn-active' : ''}`}
              title="Group by workspace"
            >
              <Layers className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('flat')}
              className={`icon-btn ${viewMode === 'flat' ? 'icon-btn-active' : ''}`}
              title="Flat list"
            >
              <LayoutList className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <TasksSkeleton />
      ) : totalFilteredJobs === 0 ? (
        <EmptyState filtered={searchQuery.length > 0 || statusFilter !== 'all'} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 items-start">
          {/* Task list */}
          <div className="space-y-3 stagger-children min-w-0">
            {viewMode === 'grouped' ? (
              filteredWorkspaces.map(({ workspace, jobs, history }) => (
                <WorkspaceTaskGroup
                  key={workspace.id}
                  workspace={workspace}
                  jobs={jobs}
                  history={history}
                  agents={agents}
                  onToggleJob={handleToggleJob}
                  onRemoveJob={handleRemoveJob}
                  onEditJob={openEditModal}
                />
              ))
            ) : (
              <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                {/* Column header */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-neutral-100 text-[10px] font-medium text-neutral-400 uppercase tracking-wider overflow-hidden">
                  <div className="w-5 shrink-0" />
                  <div className="w-5 shrink-0" />
                  <div className="flex-1 min-w-0">Task</div>
                  <div className="hidden xl:block shrink-0">Schedule</div>
                  <div className="hidden xl:block shrink-0">Agent</div>
                  <div className="hidden xl:block shrink-0">Next Run</div>
                  <div className="shrink-0 text-right">Status</div>
                  <div className="w-16 shrink-0" />
                </div>
                {filteredWorkspaces.flatMap(({ workspace, jobs, history }) =>
                  jobs.map((job) => {
                    const jobAgent = job.agentId ? agents.find((a) => a.id === job.agentId) : undefined;
                    return (
                      <TaskRow
                        key={job.id}
                        entry={job}
                        workspaceId={workspace.id}
                        agentName={jobAgent?.name ?? workspace.agent.name}
                        agentAvatar={resolveAvatarUrl(jobAgent?.avatar ?? workspace.agent.avatar)}
                        history={history}
                        onToggle={(jobId: string, enabled: boolean) =>
                          handleToggleJob(workspace.id, jobId, enabled)
                        }
                        onRemove={(jobId: string) => handleRemoveJob(workspace.id, jobId)}
                        onEdit={(j) => openEditModal(workspace.id, j)}
                      />
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Sidebar — Recent Activity */}
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden xl:sticky xl:top-20">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-neutral-900">Recent Runs</h3>
                <span className="text-[12px] text-neutral-400">{allHistory.length} total</span>
              </div>
            </div>
            <div className="p-4 max-h-[480px] overflow-y-auto">
              {allHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CalendarClock className="h-8 w-8 text-neutral-300" />
                  <p className="mt-2 text-sm font-medium text-neutral-500">No recent runs</p>
                  <p className="mt-0.5 text-xs text-neutral-400">Run history will appear here</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {allHistory.slice(0, 15).map((run, i) => (
                    <RecentRunItem
                      key={`${run.jobId}-${run.startedAt}-${i}`}
                      run={run}
                      jobName={jobNameMap.get(run.jobId) ?? run.jobId}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
