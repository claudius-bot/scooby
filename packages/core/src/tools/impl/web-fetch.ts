import { z } from 'zod';
import type { ScoobyToolDefinition } from '../types.js';
import {
  extractReadableContent,
  htmlToMarkdown,
  markdownToText,
  truncateText,
  type ExtractMode,
} from './web-fetch-utils.js';

const DEFAULT_MAX_CHARS = 50_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_ERROR_MAX_CHARS = 4_000;
const TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value as string;
    cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function looksLikeHtml(value: string): boolean {
  const head = value.trimStart().slice(0, 256).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

function formatErrorDetail(detail: string, contentType: string | null): string {
  if (!detail) return '';
  let text = detail;
  if (contentType?.toLowerCase().includes('text/html') || looksLikeHtml(detail)) {
    const rendered = htmlToMarkdown(detail);
    const withTitle = rendered.title ? `${rendered.title}\n${rendered.text}` : rendered.text;
    text = markdownToText(withTitle);
  }
  return truncateText(text.trim(), DEFAULT_ERROR_MAX_CHARS).text;
}

async function fetchWithRedirects(
  url: string,
  maxRedirects: number,
): Promise<{ response: Response; finalUrl: string }> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const visited = new Set<string>();
  let currentUrl = url;
  let redirectCount = 0;

  while (true) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(currentUrl);
    } catch {
      throw new Error('Invalid URL: must be http or https');
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid URL: must be http or https');
    }

    const res = await fetch(parsedUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: '*/*',
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal,
      redirect: 'manual',
    });

    if (isRedirectStatus(res.status)) {
      const location = res.headers.get('location');
      if (!location) {
        throw new Error(`Redirect missing location header (${res.status})`);
      }
      redirectCount += 1;
      if (redirectCount > maxRedirects) {
        throw new Error(`Too many redirects (limit: ${maxRedirects})`);
      }
      const nextUrl = new URL(location, parsedUrl).toString();
      if (visited.has(nextUrl)) {
        throw new Error('Redirect loop detected');
      }
      visited.add(nextUrl);
      void res.body?.cancel();
      currentUrl = nextUrl;
      continue;
    }

    return { response: res, finalUrl: currentUrl };
  }
}

export const webFetchTool: ScoobyToolDefinition = {
  name: 'web_fetch',
  description:
    'Fetch and extract readable content from a URL (HTML → markdown/text). Use for lightweight page access without browser automation.',
  inputSchema: z.object({
    url: z.string().describe('HTTP or HTTPS URL to fetch'),
    extractMode: z
      .enum(['markdown', 'text'])
      .optional()
      .default('markdown')
      .describe('Extraction mode: "markdown" (default) or "text"'),
    maxChars: z
      .number()
      .int()
      .min(100)
      .optional()
      .describe('Maximum characters to return (default 50000)'),
  }),
  async execute(input, _ctx) {
    const url = input.url;
    const extractMode: ExtractMode = input.extractMode === 'text' ? 'text' : 'markdown';
    const maxChars = Math.max(100, input.maxChars ?? DEFAULT_MAX_CHARS);

    // Check cache
    const cacheKey = `fetch:${url}:${extractMode}:${maxChars}`.toLowerCase();
    const cached = readCache(cacheKey);
    if (cached) {
      return JSON.stringify({ ...cached, cached: true });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return JSON.stringify({ error: 'invalid_url', message: 'Invalid URL: must be http or https' });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return JSON.stringify({ error: 'invalid_url', message: 'Invalid URL: must be http or https' });
    }

    const start = Date.now();

    try {
      const { response: res, finalUrl } = await fetchWithRedirects(url, DEFAULT_MAX_REDIRECTS);

      if (!res.ok) {
        const rawDetail = await res.text().catch(() => '');
        const detail = formatErrorDetail(rawDetail, res.headers.get('content-type'));
        return JSON.stringify({
          error: 'http_error',
          status: res.status,
          message: detail || res.statusText,
        });
      }

      const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
      const body = await res.text();

      let title: string | undefined;
      let extractor = 'raw';
      let text = body;

      if (contentType.includes('text/html')) {
        const readable = await extractReadableContent({
          html: body,
          url: finalUrl,
          extractMode,
        });
        if (readable?.text) {
          text = readable.text;
          title = readable.title;
          extractor = 'readability';
        } else {
          // Fallback to simple HTML-to-markdown
          const rendered = htmlToMarkdown(body);
          text = extractMode === 'text' ? markdownToText(rendered.text) : rendered.text;
          title = rendered.title;
          extractor = 'html-strip';
        }
      } else if (contentType.includes('application/json')) {
        try {
          text = JSON.stringify(JSON.parse(body), null, 2);
          extractor = 'json';
        } catch {
          extractor = 'raw';
        }
      }

      const truncated = truncateText(text, maxChars);
      const payload = {
        url,
        finalUrl,
        status: res.status,
        contentType,
        title,
        extractMode,
        extractor,
        truncated: truncated.truncated,
        length: truncated.text.length,
        fetchedAt: new Date().toISOString(),
        tookMs: Date.now() - start,
        text: truncated.text,
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
