'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useGateway } from '@scooby/api-client/react';
import type { TranscriptEntry } from '@scooby/schemas';
import { SessionList } from '../../../../components/session/SessionList';
import { Header } from '../../../../components/layout/Header';

export default function SessionsPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceId = params.id;

  const { data: sessions = [], isLoading: loading } = useGateway.sessions.list({ workspaceId });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    searchParams.get('session')
  );

  const {
    data: transcript = [],
    isLoading: loadingTranscript,
  } = useGateway.sessions.transcript(
    { workspaceId, sessionId: selectedSessionId ?? '' },
    { enabled: !!selectedSessionId }
  );

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
  };

  return (
    <div className="flex h-screen flex-col">
      <Header title="Session History" />

      <div className="flex min-h-0 flex-1">
        {/* Session list sidebar */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-gray-800 bg-gray-950">
          <div className="border-b border-gray-800 p-3">
            <button
              onClick={() => router.push(`/workspace/${workspaceId}`)}
              className="flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-200"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path
                  fillRule="evenodd"
                  d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z"
                  clipRule="evenodd"
                />
              </svg>
              Back to chat
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-blue-400" />
            </div>
          ) : (
            <SessionList sessions={sessions} onSelect={handleSelectSession} />
          )}
        </aside>

        {/* Transcript view */}
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {!selectedSessionId && (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-gray-500">Select a session to view its transcript.</p>
            </div>
          )}

          {selectedSessionId && loadingTranscript && (
            <div className="flex flex-1 items-center justify-center">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-blue-400" />
            </div>
          )}

          {selectedSessionId && !loadingTranscript && (
            <div className="mx-auto w-full max-w-3xl space-y-4 px-6 py-6">
              <h2 className="text-sm font-semibold text-gray-400">Transcript</h2>

              {transcript.length === 0 && (
                <p className="text-sm text-gray-500">No messages in this session.</p>
              )}

              {transcript.map((entry, idx) => {
                const isUser = entry.role === 'user';
                const timestamp = new Date(entry.timestamp).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                        isUser ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-100'
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className={`text-xs font-medium ${
                            isUser ? 'text-blue-200' : 'text-gray-400'
                          }`}
                        >
                          {isUser ? 'You' : entry.role}
                        </span>
                        <span className={`text-xs ${isUser ? 'text-blue-300' : 'text-gray-500'}`}>
                          {timestamp}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{entry.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
