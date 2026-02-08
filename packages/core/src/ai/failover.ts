import { streamText, generateText, stepCountIs, type ModelMessage, type LanguageModel } from 'ai';
import { CooldownTracker } from './model-group.js';

// ── Error classification ────────────────────────────────────────────────

export type ErrorCategory = 'billing' | 'rate_limit' | 'auth' | 'timeout' | 'format' | 'unknown';

export function classifyError(error: unknown): ErrorCategory {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const status = (error as { status?: number })?.status ??
    (error as { statusCode?: number })?.statusCode;

  // Rate limiting
  if (status === 429 || message.includes('rate limit') || message.includes('rate_limit') || message.includes('too many requests')) {
    return 'rate_limit';
  }

  // Auth / permissions
  if (status === 401 || status === 403 || message.includes('unauthorized') || message.includes('forbidden') || message.includes('api key')) {
    return 'auth';
  }

  // Billing / quota
  if (message.includes('billing') || message.includes('quota') || message.includes('insufficient') || message.includes('exceeded')) {
    return 'billing';
  }

  // Timeouts
  if (message.includes('timeout') || message.includes('etimedout') || message.includes('econnreset') || message.includes('timed out')) {
    return 'timeout';
  }

  // Format / validation
  if (message.includes('invalid') || message.includes('malformed') || message.includes('bad request')) {
    return 'format';
  }

  return 'unknown';
}

export function isRetryable(category: ErrorCategory): boolean {
  return category === 'rate_limit' || category === 'timeout' || category === 'unknown';
}

// ── Cooldown durations per error category (ms) ─────────────────────────

const COOLDOWN_DURATIONS: Record<ErrorCategory, number> = {
  rate_limit: 60_000,
  timeout: 30_000,
  unknown: 15_000,
  billing: 300_000,
  auth: 300_000,
  format: 0,
};

// ── Failover options ────────────────────────────────────────────────────

export interface FailoverCandidate {
  model: LanguageModel;
  candidate: { provider: string; model: string; maxTokens?: number };
}

export interface FailoverOptions {
  candidates: FailoverCandidate[];
  messages: ModelMessage[];
  system?: string;
  tools?: Record<string, unknown>;
  stopWhenStepCount?: number;
  onModelSwitch?: (from: string, to: string, reason: string) => void;
  cooldowns: CooldownTracker;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function candidateLabel(c: FailoverCandidate): string {
  return `${c.candidate.provider}/${c.candidate.model}`;
}

// ── generateWithFailover ────────────────────────────────────────────────

/**
 * Sequentially cascade through candidates, calling `generateText` on each.
 * On a retryable error the failing candidate is placed on cooldown and the
 * next candidate is tried.  Non-retryable errors are re-thrown immediately.
 */
export async function generateWithFailover(options: FailoverOptions): Promise<Awaited<ReturnType<typeof generateText>>> {
  const { candidates, messages, system, tools, stopWhenStepCount, onModelSwitch, cooldowns } = options;

  let lastError: unknown;

  for (let i = 0; i < candidates.length; i++) {
    const current = candidates[i];
    try {
      const result = await generateText({
        model: current.model,
        messages,
        system,
        tools: tools as Parameters<typeof generateText>[0]['tools'],
        ...(stopWhenStepCount ? { stopWhen: stepCountIs(stopWhenStepCount) } : {}),
        ...(current.candidate.maxTokens ? { maxOutputTokens: current.candidate.maxTokens } : {}),
      });
      return result;
    } catch (err) {
      lastError = err;
      const category = classifyError(err);

      if (!isRetryable(category)) {
        throw err;
      }

      // Put the failed candidate on cooldown
      const duration = COOLDOWN_DURATIONS[category];
      if (duration > 0) {
        cooldowns.markCooldown(current.candidate.provider, current.candidate.model, duration);
      }

      // Notify about model switch if there is a next candidate
      if (i + 1 < candidates.length && onModelSwitch) {
        const next = candidates[i + 1];
        onModelSwitch(candidateLabel(current), candidateLabel(next), category);
      }
    }
  }

  throw lastError;
}

// ── streamWithFailover ──────────────────────────────────────────────────

/**
 * Streaming version of failover.  Returns the stream result from the first
 * candidate that succeeds.  On a retryable error, falls through to the
 * next candidate.
 */
export async function streamWithFailover(options: FailoverOptions): Promise<Awaited<ReturnType<typeof streamText>>> {
  const { candidates, messages, system, tools, stopWhenStepCount, onModelSwitch, cooldowns } = options;

  let lastError: unknown;

  for (let i = 0; i < candidates.length; i++) {
    const current = candidates[i];
    try {
      const result = streamText({
        model: current.model,
        messages,
        system,
        tools: tools as Parameters<typeof streamText>[0]['tools'],
        ...(stopWhenStepCount ? { stopWhen: stepCountIs(stopWhenStepCount) } : {}),
        ...(current.candidate.maxTokens ? { maxOutputTokens: current.candidate.maxTokens } : {}),
      });

      // Await the first chunk to verify the stream is alive.  If the
      // provider returns an error it will typically throw before any
      // chunks are emitted.
      return result;
    } catch (err) {
      lastError = err;
      const category = classifyError(err);

      if (!isRetryable(category)) {
        throw err;
      }

      const duration = COOLDOWN_DURATIONS[category];
      if (duration > 0) {
        cooldowns.markCooldown(current.candidate.provider, current.candidate.model, duration);
      }

      if (i + 1 < candidates.length && onModelSwitch) {
        const next = candidates[i + 1];
        onModelSwitch(candidateLabel(current), candidateLabel(next), category);
      }
    }
  }

  throw lastError;
}
