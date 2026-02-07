import type { WorkspaceConfig } from "../config/schema.js";

/**
 * Parsed agent profile derived from the workspace's IDENTITY.md frontmatter
 * and the supporting markdown files on disk.
 */
export interface AgentProfile {
  /** Display name of the agent. */
  name: string;
  /** Short personality / vibe description. */
  vibe: string;
  /** Single emoji that represents the agent. */
  emoji: string;
  /** URL or path to an avatar image. */
  avatar: string;
  /** Full contents of SOUL.md — behavioural guidelines. */
  soul: string;
  /** Full body of IDENTITY.md (below the frontmatter). */
  identity: string;
  /** Full contents of TOOLS.md — tool usage instructions. */
  tools: string;
  /** Whether the agent has been configured by the user. New workspaces start unconfigured. */
  configured: boolean;
  /** Optional welcome context from WELCOME.md for initial greeting. */
  welcomeContext?: string;
  /** Contents of SCRATCHPAD.md — short-term mutable notes. */
  scratchpad: string;
  /** Contents of HEARTBEAT.md — periodic heartbeat checklist. */
  heartbeatChecklist: string;
  /** Unique agent identifier (from agent.json). */
  id?: string;
  /** Brief description of what this agent does (for routing). */
  about?: string;
  /** Model reference: "fast", "slow", or "provider/model". */
  modelRef?: string;
  /** Fallback model reference if primary is unavailable. */
  fallbackModelRef?: string;
  /** Explicit list of tool names this agent can use. */
  allowedTools?: string[];
  /** Whether to include universal tools (memory, scratchpad, etc.). Defaults to true. */
  universalTools?: boolean;
  /** Skill names this agent uses. */
  skillNames?: string[];
}

/**
 * Runtime permission set for a workspace, derived from the config but
 * converted into more ergonomic data structures.
 */
export interface WorkspacePermissions {
  /** Explicit allow-list of tool names.  `null` means "allow all". */
  allowedTools: Set<string> | null;
  /** Explicit deny-list of tool names. */
  deniedTools: Set<string>;
  /** Whether the workspace runs in a sandboxed environment. */
  sandbox: boolean;
  /** Absolute path to the workspace root (for path-scoped operations). */
  workspacePath: string;
}

/**
 * A fully-loaded workspace ready for the agent runtime.
 */
export interface Workspace {
  /** Unique identifier of the workspace (from config). */
  id: string;
  /** Absolute path to the workspace directory on disk. */
  path: string;
  /** Loaded agent profile for this workspace. */
  agent: AgentProfile;
  /** Original workspace config entry. */
  config: WorkspaceConfig;
  /** Resolved runtime permissions. */
  permissions: WorkspacePermissions;
}
