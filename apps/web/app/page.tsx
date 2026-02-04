'use client';

import { useRouter } from 'next/navigation';
import { useWorkspaces } from './hooks/useWorkspaces';
import { WorkspaceCard } from './components/workspace/WorkspaceCard';
import { Header } from './components/layout/Header';

export default function Home() {
  const router = useRouter();
  const { workspaces, loading, error } = useWorkspaces();

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="Scooby" />

      <main className="flex flex-1 flex-col items-center px-4 py-12">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-white">Welcome to Scooby</h2>
          <p className="mt-2 text-gray-400">
            Select a workspace to start chatting with an agent.
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-gray-400">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-blue-400" />
            Loading workspaces...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && workspaces.length === 0 && (
          <p className="text-gray-500">
            No workspaces found. Create one to get started.
          </p>
        )}

        <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              onClick={() => router.push(`/workspace/${ws.id}`)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
