import type { ModelGroup } from './model-group.js';

// ── State ───────────────────────────────────────────────────────────────

export interface EscalationState {
  currentGroup: ModelGroup;
  toolCallDepth: number;
  totalTokens: number;
  escalated: boolean;
  reason?: string;
}

export function createEscalationState(): EscalationState {
  return {
    currentGroup: 'fast',
    toolCallDepth: 0,
    totalTokens: 0,
    escalated: false,
  };
}

// ── Config ──────────────────────────────────────────────────────────────

export interface EscalationConfig {
  /** Maximum tool-call depth before escalating (default 3). */
  maxToolCallDepth: number;
  /** Token threshold before escalating (default 4000). */
  tokenThreshold: number;
}

const DEFAULT_CONFIG: EscalationConfig = {
  maxToolCallDepth: 3,
  tokenThreshold: 4000,
};

// ── Logic ───────────────────────────────────────────────────────────────

/**
 * Determine whether the current state warrants an escalation from `fast`
 * to `slow`.  Once escalated the function continues to return `true`.
 */
export function shouldEscalate(
  state: EscalationState,
  config?: Partial<EscalationConfig>,
): boolean {
  if (state.escalated) return true;

  const resolved: EscalationConfig = { ...DEFAULT_CONFIG, ...config };

  if (state.toolCallDepth > resolved.maxToolCallDepth) return true;
  if (state.totalTokens > resolved.tokenThreshold) return true;

  return false;
}

// ── Immutable state transitions ─────────────────────────────────────────

export function recordToolCall(state: EscalationState): EscalationState {
  return { ...state, toolCallDepth: state.toolCallDepth + 1 };
}

export function recordTokenUsage(state: EscalationState, tokens: number): EscalationState {
  return { ...state, totalTokens: state.totalTokens + tokens };
}

export function escalate(state: EscalationState, reason: string): EscalationState {
  return {
    ...state,
    currentGroup: 'slow',
    escalated: true,
    reason,
  };
}
