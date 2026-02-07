import { readFile, mkdir } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import type { WorkspaceConfig } from "../config/schema.js";
import type {
  AgentProfile,
  Workspace,
  WorkspacePermissions,
} from "./types.js";

/**
 * Safely read a file and return its contents as a string.
 * Returns `fallback` (empty string by default) when the file does not exist.
 */
async function safeRead(
  filePath: string,
  fallback: string = "",
): Promise<string> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return fallback;
    }
    throw err;
  }
}

/**
 * Build a `WorkspacePermissions` object from the raw config entry.
 */
function resolvePermissions(
  wsConfig: WorkspaceConfig,
  absolutePath: string,
): WorkspacePermissions {
  const perms = wsConfig.permissions;

  return {
    allowedTools:
      perms?.allowedTools != null ? new Set(perms.allowedTools) : null,
    deniedTools: new Set(perms?.deniedTools ?? []),
    sandbox: perms?.sandbox ?? false,
    workspacePath: absolutePath,
  };
}

/**
 * Ensure a set of subdirectories exist inside the workspace root.
 */
async function ensureSubdirs(wsPath: string): Promise<void> {
  const dirs = [
    join(wsPath, "sessions"),
    join(wsPath, "sessions", "transcripts"),
    join(wsPath, "data"),
    join(wsPath, "memory"),
  ];

  await Promise.all(dirs.map((d) => mkdir(d, { recursive: true })));
}

/**
 * Build a minimal default AgentProfile.
 * Workspace no longer owns agent personality — that comes from the
 * AgentRegistry. This placeholder is populated externally.
 */
function defaultAgentProfile(): AgentProfile {
  return {
    name: "Scooby",
    vibe: "friendly",
    emoji: "\uD83D\uDC36",
    avatar: "",
    soul: "",
    identity: "",
    tools: "",
    bootstrap: "",
    configured: true,
    scratchpad: "",
    heartbeatChecklist: "",
  };
}

/**
 * Load a single workspace from disk.
 *
 * Agent personality is no longer stored in the workspace directory.
 * The workspace still owns: sessions, data, memory, scratchpad,
 * heartbeat checklist, and permissions.
 *
 * After loading, set `ws.agent` from the AgentRegistry externally.
 */
export async function loadWorkspace(
  workspaceConfig: WorkspaceConfig,
  configDir: string,
): Promise<Workspace> {
  const absolutePath = isAbsolute(workspaceConfig.path)
    ? workspaceConfig.path
    : resolve(configDir, workspaceConfig.path);

  // Ensure required subdirectories exist.
  await ensureSubdirs(absolutePath);

  // Load workspace-level state files
  const [scratchpad, heartbeatChecklist] = await Promise.all([
    safeRead(join(absolutePath, "SCRATCHPAD.md")),
    safeRead(join(absolutePath, "HEARTBEAT.md")),
  ]);

  // Start with a default agent profile; the caller will replace it
  // with the correct agent from the AgentRegistry.
  const agent: AgentProfile = {
    ...defaultAgentProfile(),
    scratchpad,
    heartbeatChecklist,
  };

  const permissions = resolvePermissions(workspaceConfig, absolutePath);

  return {
    id: workspaceConfig.id,
    path: absolutePath,
    agent,
    config: workspaceConfig,
    permissions,
  };
}
