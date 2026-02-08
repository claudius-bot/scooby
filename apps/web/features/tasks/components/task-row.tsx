'use client';

import { cn, formatDurationMs, getRelativeTime } from '@/lib/utils';
import { Avatar } from '@/components/avatar';
import { StatusDot, type StatusDotVariant } from '@/components/ui/status-dot';
import { Badge } from '@/components/badge';
import {
  Play,
  Pause,
  Trash2,
  Pencil,
  CalendarClock,
  Timer,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  SkipForward,
} from 'lucide-react';
import type { CronJob, CronRun } from './types';
import { useState } from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSchedule(entry: CronJob): string {
  const s = entry.schedule;
  switch (s.kind) {
    case 'every':
      return `Every ${s.interval ?? '?'}`;
    case 'daily':
      return `Daily at ${s.time ?? '?'}`;
    case 'cron':
      return s.expression ?? '?';
    case 'at':
      return `Once at ${s.at ? new Date(s.at).toLocaleString() : '?'}`;
    default:
      return 'Unknown';
  }
}

function isEnabled(entry: CronJob): boolean {
  return entry.enabled !== false;
}

function getStatusVariant(entry: CronJob): StatusDotVariant {
  if (!isEnabled(entry)) return 'neutral';
  if (entry.state?.runningAtMs) return 'info';
  if (entry.state?.lastStatus === 'error') return 'error';
  if (entry.state?.lastStatus === 'success') return 'success';
  return 'success';
}

function getStatusLabel(entry: CronJob): string {
  if (!isEnabled(entry)) return 'Paused';
  if (entry.state?.runningAtMs) return 'Running';
  if (entry.state?.lastStatus === 'error') return 'Error';
  if (entry.state?.lastStatus === 'skipped') return 'Skipped';
  return 'Active';
}

// ---------------------------------------------------------------------------
// Run history sub-row
// ---------------------------------------------------------------------------

function RunHistoryRow({ run }: { run: CronRun }) {
  const statusIcon =
    run.status === 'success' ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
    ) : run.status === 'error' ? (
      <XCircle className="h-3.5 w-3.5 text-red-500" />
    ) : (
      <SkipForward className="h-3.5 w-3.5 text-neutral-400" />
    );

  return (
    <div className="flex items-center gap-3 px-4 py-2 text-[12px] bg-neutral-50/50">
      <div className="w-5 flex justify-center">{statusIcon}</div>
      <span className="text-neutral-500 tabular-nums w-24 shrink-0">
        {getRelativeTime(run.startedAt)}
      </span>
      {run.durationMs != null && (
        <span className="text-neutral-400 tabular-nums w-16 shrink-0">
          {formatDurationMs(run.durationMs)}
        </span>
      )}
      <span className="text-neutral-500 truncate flex-1">
        {run.error || run.response?.slice(0, 80) || '—'}
      </span>
      {run.delivered && <Badge variant="green" size="xs" text="Delivered" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main task row
// ---------------------------------------------------------------------------

interface TaskRowProps {
  entry: CronJob;
  workspaceId: string;
  agentName?: string;
  agentAvatar?: string;
  history?: CronRun[];
  onToggle?: (id: string, enabled: boolean) => void;
  onRemove?: (id: string) => void;
  onEdit?: (job: CronJob) => void;
}

export function TaskRow({
  entry,
  workspaceId,
  agentName,
  agentAvatar,
  history = [],
  onToggle,
  onRemove,
  onEdit,
}: TaskRowProps) {
  const [expanded, setExpanded] = useState(false);
  const statusVariant = getStatusVariant(entry);
  const statusLabel = getStatusLabel(entry);
  const isRunning = !!entry.state?.runningAtMs;
  const jobHistory = history.filter((r) => r.jobId === entry.id).slice(0, 5);

  return (
    <div
      className={cn(
        'group border-b border-neutral-100 last:border-b-0 transition-colors',
        !isEnabled(entry) && 'opacity-60'
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50/60 transition-colors overflow-hidden">
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 rounded text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Status dot */}
        <StatusDot variant={statusVariant} size="sm" pulse={isRunning} />

        {/* Name + prompt preview */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-900 truncate">
              {entry.name || entry.id}
            </span>
            <Badge
              variant={entry.source === 'agent' ? 'blue' : 'gray'}
              size="xs"
              text={entry.source}
            />
          </div>
          <p className="text-[12px] text-neutral-400 truncate mt-0.5">{entry.prompt}</p>
        </div>

        {/* Schedule */}
        <div className="hidden xl:flex items-center gap-1.5 shrink-0">
          <CalendarClock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
          <span className="text-[12px] text-neutral-500 font-mono truncate max-w-[120px]">
            {formatSchedule(entry)}
          </span>
        </div>

        {/* Agent */}
        {agentName && (
          <div className="hidden xl:flex items-center gap-2 shrink-0">
            <Avatar src={agentAvatar} name={agentName} className="size-5" />
            <span className="text-[12px] text-neutral-600 truncate max-w-[80px]">{agentName}</span>
          </div>
        )}

        {/* Next run */}
        <div className="hidden xl:flex items-center gap-1 shrink-0">
          <Timer className="h-3 w-3 text-neutral-400 shrink-0" />
          <span className="text-[11px] text-neutral-400 tabular-nums">
            {entry.state?.nextRunAtMs
              ? getRelativeTime(new Date(entry.state.nextRunAtMs).toISOString())
              : '—'}
          </span>
        </div>

        {/* Status badge */}
        <div className="shrink-0 flex justify-end">
          <Badge
            variant={
              statusLabel === 'Active'
                ? 'green'
                : statusLabel === 'Running'
                  ? 'blue'
                  : statusLabel === 'Error'
                    ? 'red'
                    : statusLabel === 'Paused'
                      ? 'gray'
                      : 'yellow'
            }
            size="xs"
            text={statusLabel}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(entry);
            }}
            className="p-1.5 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.(entry.id, !isEnabled(entry));
            }}
            className="p-1.5 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            title={isEnabled(entry) ? 'Pause' : 'Resume'}
          >
            {isEnabled(entry) ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.(entry.id);
            }}
            className="p-1.5 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded: run history */}
      {expanded && (
        <div className="border-t border-neutral-100 bg-neutral-25 overflow-hidden">
          {jobHistory.length > 0 ? (
            <div className="divide-y divide-neutral-100">
              <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                <div className="w-5" />
                <span className="w-24 shrink-0">When</span>
                <span className="w-16 shrink-0">Duration</span>
                <span className="flex-1">Result</span>
              </div>
              {jobHistory.map((run, i) => (
                <RunHistoryRow key={`${run.jobId}-${run.startedAt}-${i}`} run={run} />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-4 text-[12px] text-neutral-400">
              No run history yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
