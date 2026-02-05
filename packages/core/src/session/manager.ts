import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { JsonStore } from '../storage/json-store.js';
import { JsonlStore } from '../storage/jsonl-store.js';
import type { SessionMetadata, TranscriptEntry, SessionKey } from './types.js';
import { makeSessionKey } from './types.js';

export interface SessionManagerConfig {
  sessionsDir: string;          // e.g., workspaces/foo/sessions
  workspaceId: string;
  idleResetMinutes: number;     // default 30
  maxTranscriptLines: number;   // default 500
}

export class SessionManager {
  private metaStore: JsonStore<Record<SessionKey, SessionMetadata>>;
  private transcriptStores = new Map<string, JsonlStore<TranscriptEntry>>();

  constructor(private config: SessionManagerConfig) {
    this.metaStore = new JsonStore(join(config.sessionsDir, 'sessions.json'));
  }

  async getOrCreate(channelType: string, conversationId: string): Promise<SessionMetadata> {
    const key = makeSessionKey(channelType, conversationId);
    const sessions = (await this.metaStore.read()) ?? {};

    const existing = sessions[key];

    if (existing && existing.status !== 'archived') {
      // Check if the session has gone idle and should be reset
      if (this.isSessionIdle(existing)) {
        // Archive the old session and create a new one
        existing.status = 'archived';
        sessions[key] = existing;
        const newSession = this.createSessionMetadata(channelType, conversationId);
        sessions[key] = newSession;
        await this.metaStore.write(sessions);
        return newSession;
      }

      // Update lastActiveAt and return
      existing.lastActiveAt = new Date().toISOString();
      sessions[key] = existing;
      await this.metaStore.write(sessions);
      return existing;
    }

    // Create new session
    const newSession = this.createSessionMetadata(channelType, conversationId);
    sessions[key] = newSession;
    await this.metaStore.write(sessions);
    return newSession;
  }

  async getSession(channelType: string, conversationId: string): Promise<SessionMetadata | null> {
    const key = makeSessionKey(channelType, conversationId);
    const sessions = (await this.metaStore.read()) ?? {};
    return sessions[key] ?? null;
  }

  async listSessions(): Promise<SessionMetadata[]> {
    const sessions = (await this.metaStore.read()) ?? {};
    return Object.values(sessions).sort(
      (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );
  }

  async appendTranscript(sessionId: string, entry: TranscriptEntry): Promise<void> {
    const store = this.getTranscriptStore(sessionId);
    await store.append(entry);

    // Update messageCount and lastActiveAt in session metadata
    await this.metaStore.update((current) => {
      const sessions = current ?? {};
      for (const key of Object.keys(sessions)) {
        if (sessions[key].id === sessionId) {
          sessions[key].messageCount += 1;
          sessions[key].lastActiveAt = new Date().toISOString();
          break;
        }
      }
      return sessions;
    });
  }

  async getTranscript(sessionId: string, limit?: number): Promise<TranscriptEntry[]> {
    const store = this.getTranscriptStore(sessionId);
    if (limit !== undefined) {
      return store.readLast(limit);
    }
    return store.readAll();
  }

  async isIdle(sessionId: string): Promise<boolean> {
    const sessions = (await this.metaStore.read()) ?? {};
    for (const session of Object.values(sessions)) {
      if (session.id === sessionId) {
        return this.isSessionIdle(session);
      }
    }
    return true;
  }

  async checkIdleSessions(): Promise<string[]> {
    const sessions = (await this.metaStore.read()) ?? {};
    const archivedIds: string[] = [];

    for (const key of Object.keys(sessions)) {
      const session = sessions[key];
      if (session.status === 'active' && this.isSessionIdle(session)) {
        session.status = 'archived';
        sessions[key] = session;
        archivedIds.push(session.id);
      }
    }

    if (archivedIds.length > 0) {
      await this.metaStore.write(sessions);

      // Compact transcripts for archived sessions and free stores from memory
      for (const id of archivedIds) {
        await this.compactTranscript(id);
        this.transcriptStores.delete(id);
      }
    }

    return archivedIds;
  }

  async archiveSession(sessionId: string): Promise<void> {
    await this.metaStore.update((current) => {
      const sessions = current ?? {};
      for (const key of Object.keys(sessions)) {
        if (sessions[key].id === sessionId) {
          sessions[key].status = 'archived';
          break;
        }
      }
      return sessions;
    });

    await this.compactTranscript(sessionId);
    this.transcriptStores.delete(sessionId);
  }

  private getTranscriptStore(sessionId: string): JsonlStore<TranscriptEntry> {
    if (!this.transcriptStores.has(sessionId)) {
      this.transcriptStores.set(
        sessionId,
        new JsonlStore(join(this.config.sessionsDir, 'transcripts', `${sessionId}.jsonl`))
      );
    }
    return this.transcriptStores.get(sessionId)!;
  }

  private createSessionMetadata(channelType: string, conversationId: string): SessionMetadata {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      workspaceId: this.config.workspaceId,
      channelType,
      conversationId,
      createdAt: now,
      lastActiveAt: now,
      messageCount: 0,
      status: 'active',
    };
  }

  private isSessionIdle(session: SessionMetadata): boolean {
    const lastActive = new Date(session.lastActiveAt).getTime();
    const idleThreshold = this.config.idleResetMinutes * 60 * 1000;
    return Date.now() - lastActive > idleThreshold;
  }

  private async compactTranscript(sessionId: string): Promise<void> {
    const store = this.getTranscriptStore(sessionId);
    const count = await store.lineCount();
    if (count > this.config.maxTranscriptLines) {
      const entries = await store.readLast(this.config.maxTranscriptLines);
      await store.rewrite(entries);
    }
  }
}
