'use client';

import { useState, useEffect } from 'react';
import { fetchWorkspaces } from '../lib/api';

export interface WorkspaceInfo {
  id: string;
  agent: {
    name: string;
    vibe: string;
    emoji: string;
    avatar: string;
  };
}

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkspaces()
      .then((data) => {
        setWorkspaces(data.workspaces || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { workspaces, loading, error };
}
