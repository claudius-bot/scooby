#!/usr/bin/env node
/**
 * Reads models.json (or fetches from Vercel AI Gateway) and writes
 * packages/schemas/src/models-data.ts — a typed constant array.
 *
 * Usage:
 *   node scripts/generate-models-data.mjs            # from local models.json
 *   node scripts/generate-models-data.mjs --fetch     # fetch latest from API
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MODELS_JSON = path.join(ROOT, "models.json");
const OUTPUT = path.join(ROOT, "packages/schemas/src/models-data.ts");
const API_URL = "https://ai-gateway.vercel.sh/v1/models";

async function fetchModels() {
  console.log(`Fetching models from ${API_URL} ...`);
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
  const json = await res.json();
  // The endpoint returns { object: "list", data: [...] } or a raw array
  const models = Array.isArray(json) ? json : json.data;
  if (!Array.isArray(models)) throw new Error("Unexpected response shape");
  return models;
}

async function main() {
  const shouldFetch = process.argv.includes("--fetch");

  let models;
  if (shouldFetch) {
    models = await fetchModels();
    // Also write models.json for caching
    fs.writeFileSync(MODELS_JSON, JSON.stringify(models, null, 2) + "\n", "utf8");
    console.log(`Wrote ${models.length} models to models.json`);
  } else {
    if (!fs.existsSync(MODELS_JSON)) {
      console.error("models.json not found. Run with --fetch to download from the API.");
      process.exit(1);
    }
    models = JSON.parse(fs.readFileSync(MODELS_JSON, "utf8"));
  }

  // Normalize: ensure every model has a tags array
  for (const m of models) {
    if (!m.tags) m.tags = [];
  }

  // Sort by provider then id for stable output
  models.sort((a, b) => a.id.localeCompare(b.id));

  const lines = [
    'import type { Model } from "./model.js";',
    "",
    "/**",
    " * Static catalog of models from the Vercel AI Gateway.",
    " * Auto-generated — run `pnpm sync-models` to refresh.",
    " *",
    " * @see https://ai-gateway.vercel.sh/v1/models",
    " */",
    "// prettier-ignore",
    "export const MODELS: Model[] = " + JSON.stringify(models, null, 2) + ";",
    "",
    '/** Lookup a model by its full ID (e.g. "anthropic/claude-sonnet-4"). */',
    "const _index = new Map<string, Model>(MODELS.map((m) => [m.id, m]));",
    "",
    "export function getModel(id: string): Model | undefined {",
    "  return _index.get(id);",
    "}",
    "",
    "/** All unique provider slugs present in the catalog. */",
    "export const MODEL_PROVIDER_SLUGS = [...new Set(MODELS.map((m) => m.owned_by))];",
    "",
  ];

  fs.writeFileSync(OUTPUT, lines.join("\n"), "utf8");
  console.log(`Wrote ${OUTPUT} with ${models.length} models`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
