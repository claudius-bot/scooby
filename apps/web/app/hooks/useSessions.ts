'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchSessions, fetchTranscript } from '../lib/api';

export interface SessionInfo {
  id: string;
  workspaceId: string;
  channelType: string;
  createdAt: string;
  lastActiveAt: string;
  messageCount: number;
  status: string;
}

export function useSessions(workspaceId: string) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchSessions(workspaceId)
      .then((data) => {
        setSessions(data.sessions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getTranscript = useCallback(
    async (sessionId: string) => {
      const data = await fetchTranscript(workspaceId, sessionId);
      return data.transcript || [];
    },
    [workspaceId],
  );

  return { sessions, loading, refresh, getTranscript };
}
