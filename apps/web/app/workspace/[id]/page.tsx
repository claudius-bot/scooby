'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useSessions } from '../../hooks/useSessions';
import { ChatWindow } from '../../components/chat/ChatWindow';
import { WorkspaceSidebar } from '../../components/workspace/WorkspaceSidebar';
import { SessionList } from '../../components/session/SessionList';
import { Header } from '../../components/layout/Header';
import { Sidebar } from '../../components/layout/Sidebar';

export default function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const workspaceId = params.id;

  const { workspaces } = useWorkspaces();
  const { sessions } = useSessions(workspaceId);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const currentWorkspace = workspaces.find((ws) => ws.id === workspaceId);
  const title = currentWorkspace
    ? `${currentWorkspace.agent.emoji} ${currentWorkspace.agent.name}`
    : 'Scooby';

  const handleSelectWorkspace = (id: string) => {
    router.push(`/workspace/${id}`);
  };

  const handleSelectSession = (sessionId: string) => {
    router.push(`/workspace/${workspaceId}/sessions?session=${sessionId}`);
  };

  return (
    <div className="flex h-screen flex-col">
      <Header title={title} />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          <WorkspaceSidebar
            workspaces={workspaces}
            activeId={workspaceId}
            onSelect={handleSelectWorkspace}
          />
          <div className="border-t border-gray-800">
            <SessionList sessions={sessions} onSelect={handleSelectSession} />
          </div>
        </Sidebar>

        <main className="flex min-w-0 flex-1 flex-col">
          <ChatWindow workspaceId={workspaceId} />
        </main>
      </div>
    </div>
  );
}
