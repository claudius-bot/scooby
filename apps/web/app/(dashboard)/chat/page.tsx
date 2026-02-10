'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQueryState, parseAsString } from 'nuqs';
import { useGateway } from '@scooby/api-client/react';
import { useChatSession, type ChatMessageAgent } from '@/hooks/useChatSession';
import { ChatSidebar } from '@/features/chat/components/chat-sidebar';
import { ChatMain } from '@/features/chat/components/chat-main';

// ── Skeletons ───────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="flex h-[calc(100svh-3.5rem-1px)]">
      <aside className="w-[280px] shrink-0 border-r border-neutral-200 bg-neutral-50">
        <div className="p-3">
          <div className="h-9 w-full rounded-lg skeleton animate-pulse" />
        </div>
        <div className="space-y-1 px-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg px-3 py-2.5 animate-pulse">
              <div className="h-3.5 w-32 rounded skeleton" />
              <div className="mt-1.5 h-2.5 w-20 rounded skeleton" />
            </div>
          ))}
        </div>
      </aside>
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-neutral-400">Loading...</div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [sessionId, setSessionId] = useQueryState('session', parseAsString.withDefault(''));
  const [workspaceParam, setWorkspaceParam] = useQueryState(
    'workspace',
    parseAsString.withDefault('')
  );
  const [agentId, setAgentId] = useState<string | undefined>(undefined);

  // Data fetching
  const { data: workspaces, isLoading: loadingWorkspaces } = useGateway.workspaces.list();
  const { data: agents = [] } = useGateway.agents.list();

  // Auto-select first workspace
  const workspaceId = workspaceParam || workspaces?.[0]?.id || '';
  useEffect(() => {
    if (workspaces && workspaces.length > 0 && !workspaceParam) {
      setWorkspaceParam(workspaces[0].id);
    }
  }, [workspaces, workspaceParam, setWorkspaceParam]);

  // Fetch workspace detail to get default agent
  const { data: workspaceDetail } = useGateway.workspaces.detail(
    { id: workspaceId },
    { enabled: !!workspaceId }
  );

  // Set agent from workspace default when first loaded
  useEffect(() => {
    if (workspaceDetail?.defaultAgent && agentId === undefined) {
      setAgentId(workspaceDetail.defaultAgent);
    }
  }, [workspaceDetail?.defaultAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sessions for sidebar
  const { data: sessions = [], isLoading: loadingSessions } = useGateway.sessions.list(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  // Chat hook
  const chat = useChatSession({ workspaceId, agentId });

  // Select session when URL param changes
  useEffect(() => {
    if (sessionId && sessionId !== chat.currentSessionId) {
      chat.selectSession(sessionId);
    }
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync session ID from chat hook to URL
  useEffect(() => {
    if (chat.currentSessionId && chat.currentSessionId !== sessionId) {
      setSessionId(chat.currentSessionId);
    }
  }, [chat.currentSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handlers
  const handleSelectSession = (id: string) => {
    setSessionId(id);
  };

  const handleNewChat = () => {
    setSessionId('');
    chat.newConversation();
  };

  const handleAgentChange = (id: string | undefined) => {
    setAgentId(id);
  };

  // Active agent from selection (for empty state only)
  const defaultAgent = agents.find((a) => a.id === workspaceDetail?.defaultAgent);
  const activeAgent = agents.find((a) => a.id === agentId) ?? defaultAgent ?? agents[0] ?? null;

  // Wrap sendMessage to pass agent + files
  const handleSend = useCallback(
    (text: string, options?: { files?: File[]; agent?: ChatMessageAgent }) => {
      chat.sendMessage(text, options);
    },
    [chat.sendMessage]
  );

  if (loadingWorkspaces) {
    return <PageSkeleton />;
  }

  if (!workspaces || workspaces.length === 0) {
    return (
      <div className="flex h-[calc(100svh-3.5rem-1px)] items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-medium text-neutral-500">No workspaces found</p>
          <p className="mt-1 text-xs text-neutral-400">Configure a workspace to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100svh-3.5rem-1px)]">
      <ChatSidebar
        sessions={sessions}
        activeSessionId={chat.currentSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        isLoading={loadingSessions}
      />
      <ChatMain
        messages={chat.messages}
        status={chat.state}
        modelGroup={chat.modelGroup}
        connectionStatus={chat.connectionStatus}
        isStreaming={chat.state === 'streaming'}
        agents={agents}
        agentId={agentId}
        onAgentChange={handleAgentChange}
        onSend={handleSend}
        activeAgent={activeAgent}
      />
    </div>
  );
}
