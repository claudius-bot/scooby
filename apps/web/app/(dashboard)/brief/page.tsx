'use client';

import { useState } from 'react';
import { useGateway } from '@scooby/api-client/react';
import { getModel, type SessionMetadata } from '@scooby/schemas';
import { RefreshCw, Inbox, Bot, Cpu, MessageSquare, ArrowUpRight } from 'lucide-react';
import { TitleActionHeader } from '@/components/title-action-header';
import { HeroStats } from '@/features/dashboard/components/hero-stats';
import { DashboardCard } from '@/features/dashboard/components/dashboard-card';
import { WeatherForecast } from '@/features/dashboard/components/weather-forecast';
import { WeeklyForecast } from '@/features/dashboard/components/weekly-forecast';
import { StatusDot } from '@/components/ui/status-dot';
import { TimeRangeDropdown, type TimeRange } from '@/components/ui/time-range-dropdown';
import {
  formatNumber,
  formatDuration,
  formatTokens,
  formatModelName,
  formatCurrency,
  getProviderLogo,
  resolveAvatarUrl,
  getRelativeTime,
  formatDate,
} from '@/lib/utils';
import { Button } from '@/components/button';
import Link from 'next/link';
import { Avatar } from '@/components/avatar';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIME_RANGES: readonly TimeRange[] = [
  { id: '1d', label: 'Last 24h', days: 1 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: 'all', label: 'All time', days: null },
] as const;

// ---------------------------------------------------------------------------
// Tiny inline sub-components
// ---------------------------------------------------------------------------

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Icon className="h-8 w-8 text-neutral-300" />
      <p className="mt-2 text-sm font-medium text-neutral-500">{title}</p>
      <p className="mt-0.5 text-xs text-neutral-400">{description}</p>
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1 w-full rounded-full bg-neutral-100">
      <div className="h-1 rounded-full bg-neutral-900" style={{ width: `${pct}%` }} />
    </div>
  );
}

function SessionCard({ session }: { session: SessionMetadata }) {
  const variant =
    session.status === 'active' ? 'success' : session.status === 'idle' ? 'warning' : 'neutral';
  const timeAgo = getRelativeTime(session.lastActiveAt);

  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 hover:bg-neutral-50 transition-colors">
      <StatusDot variant={variant} size="sm" pulse={session.status === 'active'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-neutral-900">
            {session.conversationId || session.id.slice(0, 8)}
          </span>
          <span className="shrink-0 text-[11px] text-neutral-400">{timeAgo}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="inline-flex items-center rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
            {session.channelType}
          </span>
          <span className="text-[11px] text-neutral-400">
            {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState('7d');
  const [forecastHours, setForecastHours] = useState(24);
  const selectedRange = TIME_RANGES.find((r) => r.id === timeRange);
  const days = selectedRange?.days ?? undefined;

  // Data fetching
  const { data: health } = useGateway.health.check();
  const { data: status, refetch: refetchStatus } = useGateway.system.status();
  const { data: workspaces = [] } = useGateway.workspaces.list();
  const { data: agents = [] } = useGateway.agents.list();

  // Usage for the first workspace (for model/agent breakdowns)
  const defaultWorkspaceId = workspaces[0]?.id;
  const { data: usage } = useGateway.workspaces.usage(
    { id: defaultWorkspaceId ?? '', days },
    { enabled: !!defaultWorkspaceId }
  );

  // Sessions — fetch for first few workspaces and merge
  const topWorkspaceIds = workspaces.slice(0, 3).map((ws) => ws.id);
  const sessionsQ0 = useGateway.sessions.list(
    { workspaceId: topWorkspaceIds[0] ?? '' },
    { enabled: !!topWorkspaceIds[0] }
  );
  const sessionsQ1 = useGateway.sessions.list(
    { workspaceId: topWorkspaceIds[1] ?? '' },
    { enabled: !!topWorkspaceIds[1] }
  );
  const sessionsQ2 = useGateway.sessions.list(
    { workspaceId: topWorkspaceIds[2] ?? '' },
    { enabled: !!topWorkspaceIds[2] }
  );
  const allSessions: SessionMetadata[] = [
    ...(sessionsQ0.data ?? []),
    ...(sessionsQ1.data ?? []),
    ...(sessionsQ2.data ?? []),
  ].sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());
  const recentSessions = allSessions.slice(0, 8);

  // Derived data
  const isOnline = health?.status === 'ok';
  const activeSessions = status?.activeSessionCount ?? 0;
  const totalSessions = allSessions.length;
  const workspaceCount = status?.workspaceCount ?? workspaces.length;
  const agentCount = agents.length;

  // Top models from usage — enrich with catalog metadata
  const modelEntries = usage?.byModel
    ? Object.entries(usage.byModel)
        .map(([modelId, data]) => {
          const catalog = getModel(modelId);
          const cost =
            data.tokens.total > 0 && catalog?.pricing
              ? data.tokens.input * Number(catalog.pricing.input ?? 0) +
                data.tokens.output * Number(catalog.pricing.output ?? 0)
              : 0;
          return {
            id: modelId,
            displayName: getModel(modelId)?.name ?? formatModelName(modelId),
            provider: catalog?.owned_by,
            tokens: data.tokens.total,
            cost,
          };
        })
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 6)
    : [];
  const maxTokensModel = modelEntries[0]?.tokens ?? 1;
  const totalTokensUsed = modelEntries.reduce((total, m) => total + m.tokens, 0);

  // All agents, enriched with usage data when available.
  // byAgent keys are agent *names* (from record.agentName), not IDs.
  const usageByAgent = usage?.byAgent ?? {};
  const agentEntries = agents
    .map((agent) => {
      const data = usageByAgent[agent.name];
      const modelId = agent.model ?? '';
      return {
        id: agent.id,
        name: agent.name,
        emoji: agent.emoji ?? '🤖',
        avatar: agent.avatar ?? '',
        model: getModel(modelId)?.name ?? formatModelName(modelId),
        tools: agent.tools ?? [],
        tokens: data?.tokens.total ?? 0,
      };
    })
    .sort((a, b) => b.tokens - a.tokens);
  const totalTokensAgent = agentEntries.reduce((total, agent) => total + agent.tokens, 0);

  const handleRefresh = () => {
    refetchStatus();
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-4">
      {/* Title row */}
      <TitleActionHeader
        title={`Tuesday, Feb 9`}
        titleClassName="text-neutral-400"
        actions={
          <div className="flex items-center gap-2">
            <TimeRangeDropdown ranges={TIME_RANGES} value={timeRange} onChange={setTimeRange} />

            <Button
              className="h-10"
              tooltip="Refresh"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={handleRefresh}
            />
          </div>
        }
      />

      {/* Hero stat */}
      <div className="mb-6">
        {/* <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-3">
          Active Sessions
        </p> */}
        {!isOnline ? (
          <div className="h-20 w-64 skeleton rounded-lg" />
        ) : (
          <div className="stat-number text-7xl md:text-8xl text-neutral-900 tabular-nums">
            Good Morning,&nbsp;
            <span className="stat-highlight">Zach</span>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <HeroStats
        stats={[
          {
            label: 'Status',
            value: isOnline ? 'Online' : 'Offline',
            content: (
              <StatusDot variant={isOnline ? 'success' : 'error'} pulse={isOnline} size="sm" />
            ),
            variant: isOnline ? 'default' : 'danger',
          },
          {
            label: 'Total Sessions',
            value: totalSessions,
          },
          {
            label: 'Workspaces',
            value: workspaceCount,
          },
          {
            label: 'Agents',
            value: agentCount,
          },
        ]}
      />

      {/* Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger-children">
        {/* Weather Forecast */}
        <DashboardCard
          title="Weather"
          subtitle={`${forecastHours}h forecast`}
          expandable={false}
          more={[
            { label: '12 hours', onClick: () => setForecastHours(12), active: forecastHours === 12 },
            { label: '18 hours', onClick: () => setForecastHours(18), active: forecastHours === 18 },
            { label: '24 hours', onClick: () => setForecastHours(24), active: forecastHours === 24 },
          ]}
        >
          <WeatherForecast hours={forecastHours} />
        </DashboardCard>

        {/* 7-Day Forecast */}
        <DashboardCard title="7-Day Forecast" subtitle="NYC" expandable={false}>
          <WeeklyForecast />
        </DashboardCard>

        {/* Top Workspaces */}
        <DashboardCard title="Top Workspaces" subtitle={`${workspaces.length} total`}>
          {workspaces.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No workspaces"
              description="Connect a workspace to get started"
            />
          ) : (
            <div className="space-y-1">
              {workspaces.slice(0, 6).map((ws, index) => (
                <Link
                  key={ws.id}
                  href={`/workspaces/${encodeURIComponent(ws.id)}`}
                  className="group flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-md hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex-shrink-0 h-6 w-6 rounded bg-neutral-100 flex items-center justify-center text-[11px] font-semibold text-neutral-500 group-hover:bg-neutral-200 transition-colors">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-neutral-900">
                          {ws.agent.name}
                        </span>
                        <ArrowUpRight className="h-3 w-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <span className="shrink-0 text-[11px] text-neutral-400 tabular-nums">
                        {ws.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="mt-1">
                      <ProgressBar value={1} max={workspaces.length} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </DashboardCard>

        {/* Top Models */}
        <DashboardCard
          title="Top Models"
          subtitle={usage ? `${Object.keys(usage.byModel).length} models` : undefined}
        >
          {modelEntries.length === 0 ? (
            <EmptyState
              icon={Cpu}
              title="No usage data"
              description="Model usage will appear here"
            />
          ) : (
            <div className="space-y-1">
              {modelEntries.map(({ id, displayName, provider, tokens, cost }, index) => {
                const providerLogo = getProviderLogo(id);
                return (
                  <div
                    key={id}
                    className="group flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-md hover:bg-neutral-50 transition-colors"
                  >
                    {providerLogo ? (
                      <div className="flex-shrink-0 h-6 w-6 rounded bg-neutral-100 flex items-center justify-center p-1">
                        <img
                          src={providerLogo}
                          alt={provider ?? ''}
                          className="h-4 w-4 object-contain"
                        />
                      </div>
                    ) : (
                      <div className="flex-shrink-0 h-6 w-6 rounded bg-neutral-100 flex items-center justify-center text-[11px] font-semibold text-neutral-500">
                        {index + 1}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-neutral-900">
                          {displayName}
                        </span>
                        <div className="flex items-baseline gap-2 shrink-0">
                          {cost > 0 && (
                            <span className="text-[11px] text-neutral-400 tabular-nums">
                              {formatCurrency(cost)}
                            </span>
                          )}
                          <span className="text-[13px] font-semibold text-neutral-900 tabular-nums">
                            {formatTokens(tokens)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1">
                        <ProgressBar value={tokens} max={totalTokensUsed} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DashboardCard>

        {/* Top Agents */}
        <DashboardCard title="Top Agents" subtitle={`${agents.length} registered`}>
          {agentEntries.length === 0 ? (
            <EmptyState icon={Bot} title="No agents" description="Register agents to see usage" />
          ) : (
            <div className="space-y-1">
              {agentEntries.map((agent) => (
                <div
                  key={agent.id}
                  className="group flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-md hover:bg-neutral-50 transition-colors"
                >
                  <Avatar
                    src={resolveAvatarUrl(agent.avatar)}
                    name={agent.name}
                    className="size-9"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-sm font-medium text-neutral-900">
                          {agent.name}
                        </span>
                        <span className="inline-flex items-center rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 shrink-0">
                          {agent.model}
                        </span>
                        <span className="text-[11px] text-neutral-400 shrink-0">
                          {agent.tools.length} tools
                        </span>
                      </div>
                      {agent.tokens > 0 && (
                        <span className="shrink-0 text-[11px] text-neutral-400 tabular-nums">
                          {formatTokens(agent.tokens)}
                        </span>
                      )}
                    </div>
                    {totalTokensAgent > 0 && (
                      <div className="mt-1">
                        <ProgressBar value={agent.tokens} max={totalTokensAgent} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>

        {/* Recent Sessions */}
        <DashboardCard title="Recent Sessions" subtitle={`${allSessions.length} total`}>
          {recentSessions.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No sessions"
              description="Sessions will appear when agents start chatting"
            />
          ) : (
            <div className="space-y-1">
              {recentSessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
