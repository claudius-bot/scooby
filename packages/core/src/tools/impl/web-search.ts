import { z } from 'zod';
import type { ScoobyToolDefinition } from '../types.js';

const BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DEFAULT_COUNT = 5;
const MAX_COUNT = 10;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_ENTRIES = 100;
const TIMEOUT_MS = 30_000;

const FRESHNESS_SHORTCUTS = new Set(['pd', 'pw', 'pm', 'py']);
const FRESHNESS_RANGE_RE = /^(\d{4}-\d{2}-\d{2})to(\d{4}-\d{2}-\d{2})$/;

// Simple in-memory cache
interface CacheEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

function readCache(key: string): Record<string, unknown> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key: string, data: Record<string, unknown>): void {
  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value as string;
    cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function normalizeFreshness(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (FRESHNESS_SHORTCUTS.has(trimmed)) return trimmed;

  const match = value.trim().match(FRESHNESS_RANGE_RE);
  if (!match) return undefined;
  const [, start, end] = match;
  if (start > end) return undefined;
  return `${start}to${end}`;
}

function siteName(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export const webSearchTool: ScoobyToolDefinition = {
  name: 'web_search',
  description:
    'Search the web using Brave Search API. Returns titles, URLs, and snippets. Supports region, language, and freshness filters.',
  inputSchema: z.object({
    query: z.string().describe('Search query string'),
    count: z
      .number()
      .int()
      .min(1)
      .max(MAX_COUNT)
      .optional()
      .describe('Number of results to return (1-10, default 5)'),
    country: z
      .string()
      .optional()
      .describe("2-letter country code for region-specific results (e.g. 'US', 'DE')"),
    search_lang: z
      .string()
      .optional()
      .describe("ISO language code for search results (e.g. 'en', 'de')"),
    freshness: z
      .string()
      .optional()
      .describe(
        "Filter by discovery time: 'pd' (24h), 'pw' (week), 'pm' (month), 'py' (year), or 'YYYY-MM-DDtoYYYY-MM-DD'",
      ),
  }),
  async execute(input, _ctx) {
    const apiKey = (process.env.BRAVE_API_KEY ?? '').trim();
    if (!apiKey) {
      return JSON.stringify({
        error: 'missing_api_key',
        message:
          'web_search requires a Brave Search API key. Set BRAVE_API_KEY in your .env file.',
      });
    }

    const count = Math.max(1, Math.min(MAX_COUNT, input.count ?? DEFAULT_COUNT));
    const freshness = normalizeFreshness(input.freshness);

    if (input.freshness && !freshness) {
      return JSON.stringify({
        error: 'invalid_freshness',
        message:
          "freshness must be one of 'pd', 'pw', 'pm', 'py', or a date range 'YYYY-MM-DDtoYYYY-MM-DD'.",
      });
    }

    // Check cache
    const cacheKey = `brave:${input.query}:${count}:${input.country || ''}:${input.search_lang || ''}:${freshness || ''}`;
    const cached = readCache(cacheKey);
    if (cached) {
      return JSON.stringify({ ...cached, cached: true });
    }

    // Build request URL
    const url = new URL(BRAVE_SEARCH_ENDPOINT);
    url.searchParams.set('q', input.query);
    url.searchParams.set('count', String(count));
    if (input.country) url.searchParams.set('country', input.country);
    if (input.search_lang) url.searchParams.set('search_lang', input.search_lang);
    if (freshness) url.searchParams.set('freshness', freshness);

    const start = Date.now();

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': apiKey,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        return JSON.stringify({
          error: 'api_error',
          status: res.status,
          message: detail || res.statusText,
        });
      }

      const data = (await res.json()) as {
        web?: {
          results?: Array<{
            title?: string;
            url?: string;
            description?: string;
            age?: string;
          }>;
        };
      };

      const results = (data.web?.results ?? []).map((entry) => ({
        title: entry.title ?? '',
        url: entry.url ?? '',
        description: entry.description ?? '',
        published: entry.age ?? undefined,
        siteName: siteName(entry.url),
      }));

      const payload = {
        query: input.query,
        count: results.length,
        tookMs: Date.now() - start,
        results,
      };

      writeCache(cacheKey, payload);
      return JSON.stringify(payload);
    } catch (err: any) {
      return JSON.stringify({
        error: 'fetch_error',
        message: err.message,
      });
    }
  },
};
