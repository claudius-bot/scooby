import { readFile, mkdir } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import matter from "gray-matter";
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
 * Parse the IDENTITY.md file into the relevant AgentProfile fields.
 * The file is expected to have YAML frontmatter with keys:
 *   name, creature, vibe, emoji, avatar
 * and a markdown body that becomes the `identity` field.
 */
async function loadIdentity(
  wsPath: string,
): Promise<Pick<AgentProfile, "name" | "creature" | "vibe" | "emoji" | "avatar" | "identity">> {
  const raw = await safeRead(join(wsPath, "IDENTITY.md"));

  if (!raw) {
    return {
      name: "Scooby",
      creature: "dog",
      vibe: "friendly",
      emoji: "\uD83D\uDC36",
      avatar: "",
      identity: "",
    };
  }

  const { data, content } = matter(raw);

  return {
    name: (data.name as string) ?? "Scooby",
    creature: (data.creature as string) ?? "dog",
    vibe: (data.vibe as string) ?? "friendly",
    emoji: (data.emoji as string) ?? "\uD83D\uDC36",
    avatar: (data.avatar as string) ?? "",
    identity: content.trim(),
  };
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
 * Load a single workspace from disk.
 *
 * @param workspaceConfig - The workspace entry from `ScoobyConfig.workspaces`.
 * @param configDir       - Absolute directory of the config file, used to
 *                          resolve relative workspace paths.
 * @returns A fully initialised `Workspace` ready for the runtime.
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

  // Load agent profile files in parallel.
  const [identityFields, soul, tools, bootstrap] = await Promise.all([
    loadIdentity(absolutePath),
    safeRead(join(absolutePath, "SOUL.md")),
    safeRead(join(absolutePath, "TOOLS.md")),
    safeRead(join(absolutePath, "BOOTSTRAP.md")),
  ]);

  const agent: AgentProfile = {
    ...identityFields,
    soul,
    tools,
    bootstrap,
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
