const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function fetchWorkspaces() {
  const res = await fetch(`${API_BASE}/api/workspaces`);
  if (!res.ok) throw new Error('Failed to fetch workspaces');
  return res.json();
}

export async function fetchWorkspace(id: string) {
  const res = await fetch(`${API_BASE}/api/workspaces/${id}`);
  if (!res.ok) throw new Error('Failed to fetch workspace');
  return res.json();
}

export async function fetchSessions(workspaceId: string) {
  const res = await fetch(`${API_BASE}/api/workspaces/${workspaceId}/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchTranscript(
  workspaceId: string,
  sessionId: string,
  limit?: number,
) {
  const url = new URL(
    `${API_BASE}/api/workspaces/${workspaceId}/sessions/${sessionId}/transcript`,
  );
  if (limit) url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch transcript');
  return res.json();
}
