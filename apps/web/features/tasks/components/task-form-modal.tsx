'use client';

import { useState, useCallback, useId, useMemo } from 'react';
import { Template } from '@/components/modal/template';
import { useModal } from '@/components/modal/provider';
import { Button } from '@/components/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Avatar } from '@/components/avatar';
import { cn, resolveAvatarUrl } from '@/lib/utils';
import {
  CalendarClock,
  Clock,
  Timer,
  Hash,
  Repeat,
  Sparkles,
  Pencil,
  Send,
  Check,
} from 'lucide-react';
import type { AgentDetail, WorkspaceSummary } from '@scooby/schemas';
import type { CronJob, CronSchedule } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScheduleKind = CronSchedule['kind'];

interface TaskFormData {
  name: string;
  prompt: string;
  agentId: string;
  enabled: boolean;
  scheduleKind: ScheduleKind;
  // "every" fields
  interval: string;
  // "daily" fields
  time: string;
  // "cron" fields
  expression: string;
  // "at" fields
  at: string;
  // delivery fields
  deliveryEnabled: boolean;
  /** Either a binding key like "telegram:12345" or "__custom__" */
  deliverySelection: string;
  /** Only used when deliverySelection === '__custom__' */
  customDeliveryChannel: string;
  customDeliveryConversationId: string;
}

export interface ChannelBindingOption {
  channelType: string;
  conversationId: string;
}

interface TaskFormModalProps {
  /** Pre-fill for editing */
  job?: CronJob;
  /** Available agents */
  agents?: AgentDetail[];
  /** All workspaces the user can target */
  workspaces?: WorkspaceSummary[];
  /** Map from workspace ID → channel bindings */
  bindingsMap?: Map<string, ChannelBindingOption[]>;
  /** Default workspace to pre-select */
  defaultWorkspaceId?: string;
  onSubmit: (workspaceId: string, job: Omit<CronJob, 'state'>) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Schedule kind options
// ---------------------------------------------------------------------------

const SCHEDULE_KINDS: {
  id: ScheduleKind;
  label: string;
  description: string;
  icon: typeof Repeat;
}[] = [
  {
    id: 'every',
    label: 'Interval',
    description: 'Repeats at a fixed interval',
    icon: Repeat,
  },
  {
    id: 'daily',
    label: 'Daily',
    description: 'Runs once per day at a set time',
    icon: Clock,
  },
  {
    id: 'cron',
    label: 'Cron',
    description: 'Advanced cron expression',
    icon: Hash,
  },
  {
    id: 'at',
    label: 'One-time',
    description: 'Runs once at a specific date/time',
    icon: Timer,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildSchedule(form: TaskFormData): CronSchedule {
  switch (form.scheduleKind) {
    case 'every':
      return { kind: 'every', interval: form.interval || '1h' };
    case 'daily':
      return { kind: 'daily', time: form.time || '09:00' };
    case 'cron':
      return { kind: 'cron', expression: form.expression || '0 * * * *' };
    case 'at':
      return { kind: 'at', at: form.at || new Date().toISOString() };
  }
}

function formFromJob(job: CronJob): TaskFormData {
  const hasDelivery = !!job.delivery;
  return {
    name: job.name ?? '',
    prompt: job.prompt,
    agentId: job.agentId ?? '',
    enabled: job.enabled !== false,
    scheduleKind: job.schedule.kind,
    interval: job.schedule.interval ?? '1h',
    time: job.schedule.time ?? '09:00',
    expression: job.schedule.expression ?? '0 * * * *',
    at: job.schedule.at ?? '',
    deliveryEnabled: hasDelivery,
    deliverySelection: hasDelivery
      ? `${job.delivery!.channel}:${job.delivery!.conversationId}`
      : '__custom__',
    customDeliveryChannel: 'telegram',
    customDeliveryConversationId: '',
  };
}

const DEFAULT_FORM: TaskFormData = {
  name: '',
  prompt: '',
  agentId: '',
  enabled: true,
  scheduleKind: 'every',
  interval: '1h',
  time: '09:00',
  expression: '0 * * * *',
  at: '',
  deliveryEnabled: true,
  deliverySelection: '',
  customDeliveryChannel: 'telegram',
  customDeliveryConversationId: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskFormModal({
  job,
  agents = [],
  workspaces = [],
  bindingsMap = new Map(),
  defaultWorkspaceId,
  onSubmit,
}: TaskFormModalProps) {
  const modal = useModal();
  const isEditing = !!job;
  const formId = useId();

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    () => defaultWorkspaceId ?? workspaces[0]?.id ?? ''
  );

  const currentBindings = useMemo(
    () => bindingsMap.get(selectedWorkspaceId) ?? [],
    [bindingsMap, selectedWorkspaceId]
  );

  const [form, setForm] = useState<TaskFormData>(() => {
    const initial = job ? formFromJob(job) : { ...DEFAULT_FORM };
    const initBindings = bindingsMap.get(selectedWorkspaceId) ?? [];
    // Auto-select the first binding if available and no selection set
    if (!initial.deliverySelection && initBindings.length > 0) {
      initial.deliverySelection = `${initBindings[0].channelType}:${initBindings[0].conversationId}`;
    } else if (!initial.deliverySelection) {
      initial.deliverySelection = '__custom__';
    }
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);

  const update = useCallback(
    <K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleWorkspaceChange = useCallback(
    (wsId: string) => {
      setSelectedWorkspaceId(wsId);
      const newBindings = bindingsMap.get(wsId) ?? [];
      setForm((prev) => ({
        ...prev,
        deliverySelection:
          newBindings.length > 0
            ? `${newBindings[0].channelType}:${newBindings[0].conversationId}`
            : '__custom__',
      }));
    },
    [bindingsMap]
  );

  const isCustomDelivery = form.deliverySelection === '__custom__';

  const canSubmit =
    selectedWorkspaceId.length > 0 &&
    form.prompt.trim().length > 0 &&
    ((form.scheduleKind === 'every' && form.interval.trim().length > 0) ||
      (form.scheduleKind === 'daily' && form.time.trim().length > 0) ||
      (form.scheduleKind === 'cron' && form.expression.trim().length > 0) ||
      (form.scheduleKind === 'at' && form.at.trim().length > 0)) &&
    (!form.deliveryEnabled || (
      isCustomDelivery
        ? form.customDeliveryChannel.trim().length > 0 && form.customDeliveryConversationId.trim().length > 0
        : form.deliverySelection.length > 0
    ));

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);

    let delivery: { channel: string; conversationId: string } | undefined;
    if (form.deliveryEnabled) {
      if (isCustomDelivery) {
        delivery = {
          channel: form.customDeliveryChannel.trim(),
          conversationId: form.customDeliveryConversationId.trim(),
        };
      } else {
        const [ch, ...rest] = form.deliverySelection.split(':');
        delivery = { channel: ch, conversationId: rest.join(':') };
      }
    }

    const result: Omit<CronJob, 'state'> = {
      id: job?.id ?? generateId(),
      name: form.name.trim() || undefined,
      agentId: form.agentId || undefined,
      prompt: form.prompt.trim(),
      enabled: form.enabled,
      schedule: buildSchedule(form),
      delivery,
      source: job?.source ?? 'config',
      createdAt: job?.createdAt ?? new Date().toISOString(),
    };

    try {
      await onSubmit(selectedWorkspaceId, result);
      modal.hide();
    } catch {
      // Let caller handle toast/errors
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Template
      className="md:max-w-lg"
      title={isEditing ? 'Edit Task' : 'New Task'}
      description={
        isEditing
          ? 'Modify the schedule and prompt for this task'
          : 'Create a new scheduled task for your agent'
      }
      footer={
        <div className="flex flex-1 items-center justify-between gap-x-3">
          <Button onClick={() => modal.hide()} variant="outline" text="Cancel" />
          <Button
            onClick={handleSubmit}
            text={isEditing ? 'Save Changes' : 'Create Task'}
            icon={isEditing ? <Pencil className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            loading={submitting}
            disabled={!canSubmit}
          />
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── Workspace ──────────────────────────── */}
        {workspaces.length > 0 && (
          <FieldGroup label="Workspace" hint="Which workspace owns this task?">
            <select
              value={selectedWorkspaceId}
              onChange={(e) => handleWorkspaceChange(e.target.value)}
              disabled={isEditing}
              className={cn(
                'flex h-9 w-full rounded-md border border-neutral-200 bg-white px-3 py-1',
                'text-sm text-neutral-900',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400',
                isEditing && 'opacity-60 cursor-not-allowed',
              )}
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.agent.emoji} {ws.agent.name}
                </option>
              ))}
            </select>
          </FieldGroup>
        )}

        {/* ── Name ────────────────────────────────── */}
        <FieldGroup label="Name" hint="Optional display name">
          <Input
            id={`${formId}-name`}
            placeholder="e.g. Daily standup summary"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
          />
        </FieldGroup>

        {/* ── Agent ──────────────────────────────── */}
        {agents.length > 0 && (
          <FieldGroup label="Agent" hint="Which agent runs this task?">
            <div className="grid grid-cols-2 gap-2">
              {agents.map((agent) => {
                const active = form.agentId === agent.id;
                const avatarUrl = resolveAvatarUrl(agent.avatar);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => update('agentId', agent.id)}
                    className={cn(
                      'group relative flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all',
                      active
                        ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'
                    )}
                  >
                    {avatarUrl ? (
                      <Avatar
                        src={avatarUrl}
                        name={agent.name}
                        className="size-6 shrink-0 rounded-full"
                      />
                    ) : (
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm">
                        {agent.emoji}
                      </span>
                    )}
                    <span className={cn(
                      'text-[13px] font-medium truncate',
                      active && 'text-white'
                    )}>
                      {agent.name}
                    </span>
                    {active && (
                      <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </FieldGroup>
        )}

        {/* ── Prompt ──────────────────────────────── */}
        <FieldGroup label="Prompt" hint="What should the agent do?">
          <Textarea
            id={`${formId}-prompt`}
            placeholder="Summarize the latest activity and post a standup update..."
            value={form.prompt}
            onChange={(e) => update('prompt', e.target.value)}
            className="min-h-[100px]"
          />
        </FieldGroup>

        {/* ── Schedule type ───────────────────────── */}
        <FieldGroup label="Schedule">
          <div className="grid grid-cols-2 gap-2">
            {SCHEDULE_KINDS.map((sk) => {
              const Icon = sk.icon;
              const active = form.scheduleKind === sk.id;
              return (
                <button
                  key={sk.id}
                  type="button"
                  onClick={() => update('scheduleKind', sk.id)}
                  className={cn(
                    'group relative flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all',
                    active
                      ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 mt-0.5 shrink-0 transition-colors',
                      active ? 'text-neutral-300' : 'text-neutral-400 group-hover:text-neutral-500'
                    )}
                  />
                  <div className="min-w-0">
                    <div className={cn('text-[13px] font-medium leading-tight', active && 'text-white')}>
                      {sk.label}
                    </div>
                    <div
                      className={cn(
                        'text-[11px] leading-snug mt-0.5',
                        active ? 'text-neutral-400' : 'text-neutral-400'
                      )}
                    >
                      {sk.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </FieldGroup>

        {/* ── Schedule params ─────────────────────── */}
        <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-neutral-500">
            <CalendarClock className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Schedule Configuration
            </span>
          </div>

          {form.scheduleKind === 'every' && (
            <FieldGroup label="Interval" hint='e.g. "30m", "2h", "1d"'>
              <Input
                placeholder="1h"
                value={form.interval}
                onChange={(e) => update('interval', e.target.value)}
                className="font-mono"
              />
            </FieldGroup>
          )}

          {form.scheduleKind === 'daily' && (
            <FieldGroup label="Time (24h)" hint="Local time in HH:MM format">
              <Input
                type="time"
                value={form.time}
                onChange={(e) => update('time', e.target.value)}
              />
            </FieldGroup>
          )}

          {form.scheduleKind === 'cron' && (
            <FieldGroup label="Expression" hint="Standard cron: min hour day month weekday">
              <Input
                placeholder="0 */6 * * *"
                value={form.expression}
                onChange={(e) => update('expression', e.target.value)}
                className="font-mono"
              />
            </FieldGroup>
          )}

          {form.scheduleKind === 'at' && (
            <FieldGroup label="Date & Time" hint="When should this run?">
              <Input
                type="datetime-local"
                value={form.at ? form.at.slice(0, 16) : ''}
                onChange={(e) =>
                  update('at', e.target.value ? new Date(e.target.value).toISOString() : '')
                }
              />
            </FieldGroup>
          )}
        </div>

        {/* ── Delivery ─────────────────────────────── */}
        <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-500">
              <Send className="h-3.5 w-3.5" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                Delivery
              </span>
            </div>
            <Switch
              checked={form.deliveryEnabled}
              onCheckedChange={(checked) => update('deliveryEnabled', checked)}
            />
          </div>

          {form.deliveryEnabled && (
            <div className="space-y-3">
              {currentBindings.length > 0 && (
                <FieldGroup label="Deliver to" hint="Select a connected channel">
                  <select
                    value={form.deliverySelection}
                    onChange={(e) => update('deliverySelection', e.target.value)}
                    className={cn(
                      'flex h-9 w-full rounded-md border border-neutral-200 bg-white px-3 py-1',
                      'text-sm text-neutral-900',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400',
                    )}
                  >
                    {currentBindings.map((b) => (
                      <option key={`${b.channelType}:${b.conversationId}`} value={`${b.channelType}:${b.conversationId}`}>
                        {b.channelType} — {b.conversationId}
                      </option>
                    ))}
                    <option value="__custom__">Custom...</option>
                  </select>
                </FieldGroup>
              )}

              {(currentBindings.length === 0 || isCustomDelivery) && (
                <>
                  <FieldGroup label="Channel" hint="Where to deliver results">
                    <select
                      value={form.customDeliveryChannel}
                      onChange={(e) => update('customDeliveryChannel', e.target.value)}
                      className={cn(
                        'flex h-9 w-full rounded-md border border-neutral-200 bg-white px-3 py-1',
                        'text-sm text-neutral-900',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400',
                      )}
                    >
                      <option value="telegram">Telegram</option>
                      <option value="webchat">Web Chat</option>
                    </select>
                  </FieldGroup>

                  <FieldGroup label="Conversation ID" hint="Chat or channel ID to deliver to">
                    <Input
                      placeholder={form.customDeliveryChannel === 'telegram' ? 'e.g. 6039959147' : 'e.g. connection-id'}
                      value={form.customDeliveryConversationId}
                      onChange={(e) => update('customDeliveryConversationId', e.target.value)}
                      className="font-mono"
                    />
                  </FieldGroup>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Enabled toggle ──────────────────────── */}
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
          <div>
            <div className="text-[13px] font-medium text-neutral-900">Enabled</div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              Disabled tasks won't run on schedule
            </div>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(checked) => update('enabled', checked)}
          />
        </div>
      </div>
    </Template>
  );
}

// ---------------------------------------------------------------------------
// Field group helper
// ---------------------------------------------------------------------------

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[13px] font-medium text-neutral-700">{label}</label>
        {hint && <span className="text-[11px] text-neutral-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
