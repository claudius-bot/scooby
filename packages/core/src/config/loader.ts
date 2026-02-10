import { readFile } from "node:fs/promises";
import { dirname, resolve, isAbsolute } from "node:path";
import JSON5 from "json5";
import { ScoobyConfigSchema, type ScoobyConfig } from "./schema.js";

/**
 * Recursively walk a value and replace every `${ENV_VAR}` pattern in strings
 * with the corresponding value from `process.env`.  If the env var is not set
 * the placeholder is left as-is so the caller can decide how to handle it.
 */
function interpolateEnvVars(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
      const envVal = process.env[varName];
      return envVal !== undefined ? envVal : _match;
    });
  }

  if (Array.isArray(value)) {
    return value.map(interpolateEnvVars);
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = interpolateEnvVars(v);
    }
    return result;
  }

  return value;
}

/**
 * Resolve every `workspace[].path` so that relative paths are resolved
 * against the directory that contains the config file.
 */
function resolveWorkspacePaths(
  config: ScoobyConfig,
  configDir: string,
): ScoobyConfig {
  return {
    ...config,
    workspaces: config.workspaces.map((ws) => ({
      ...ws,
      path: isAbsolute(ws.path) ? ws.path : resolve(configDir, ws.path),
    })),
  };
}

/**
 * Load, parse, validate and post-process a Scooby configuration file.
 *
 * @param configPath - Absolute or relative path to a `scooby.config.json5` file.
 * @returns A fully validated `ScoobyConfig` with resolved paths and
 *          interpolated environment variables.
 */
export async function loadConfig(configPath: string): Promise<ScoobyConfig> {
  const absolutePath = resolve(configPath);
  const configDir = dirname(absolutePath);

  const raw = await readFile(absolutePath, "utf-8");
  const parsed: unknown = JSON5.parse(raw);
  const interpolated = interpolateEnvVars(parsed);
  const validated = ScoobyConfigSchema.parse(interpolated);
  const resolved = resolveWorkspacePaths(validated, configDir);

  return resolved;
}

// ── Cached config loader ─────────────────────────────────────────────
//
// Returns a function that re-reads the config from disk at most once per
// TTL interval (default 500ms).  On parse failure it returns the last
// known-good config so a corrupted save doesn't crash the runtime.

const DEFAULT_CONFIG_CACHE_MS = 500;

export function createCachedConfigLoader(
  configPath: string,
  ttlMs = DEFAULT_CONFIG_CACHE_MS,
): () => Promise<ScoobyConfig> {
  let cached: ScoobyConfig | null = null;
  let lastLoadMs = 0;
  let loading: Promise<ScoobyConfig> | null = null;

  return async () => {
    const now = Date.now();
    if (cached && now - lastLoadMs < ttlMs) return cached;

    // Coalesce concurrent requests into a single disk read
    if (!loading) {
      loading = loadConfig(configPath)
        .then((cfg) => {
          cached = cfg;
          lastLoadMs = Date.now();
          loading = null;
          return cfg;
        })
        .catch((err) => {
          loading = null;
          if (cached) {
            console.warn('[Config] Failed to reload config, using cached version:', err);
            return cached;
          }
          throw err;
        });
    }
    return loading;
  };
}
