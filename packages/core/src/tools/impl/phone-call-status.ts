import { z } from 'zod';
import type { ScoobyToolDefinition } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT_MS = 15_000;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';

// ============================================================================
// Types
// ============================================================================

export interface ConversationDetails {
  success: boolean;
  conversationId?: string;
  status?: 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed';
  transcript?: Array<{ role: string; message: string }>;
  analysis?: { summary?: string; data_collection?: Record<string, unknown> };
  duration?: number;
  error?: string;
}

// ============================================================================
// Core Function
// ============================================================================

/**
 * Fetch conversation details from ElevenLabs Conversational AI API.
 */
export async function getConversationDetails(conversationId: string): Promise<ConversationDetails> {
  const apiKey = process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'ELEVENLABS_API_KEY not set.' };
  }

  const baseUrl = (process.env.ELEVENLABS_BASE_URL?.trim() || ELEVENLABS_BASE_URL).replace(/\/+$/, '');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/v1/convai/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'GET',
        headers: { 'xi-api-key': apiKey },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `ElevenLabs API error: ${response.status} ${errText}` };
      }

      const data = await response.json() as Record<string, any>;

      return {
        success: true,
        conversationId: data.conversation_id ?? conversationId,
        status: data.status,
        transcript: data.transcript,
        analysis: data.analysis,
        duration: data.metadata?.call_duration_secs ?? data.call_duration_secs,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Request timed out' };
    }
    return { success: false, error: `Failed to fetch conversation details: ${err.message}` };
  }
}

// ============================================================================
// Tool Definition
// ============================================================================

export const phoneCallStatusTool: ScoobyToolDefinition = {
  name: 'phone_call_status',
  description:
    'Check the status and transcript of a phone call made via the phone_call tool. ' +
    'Returns the current call status, duration, transcript of the conversation, and any analysis/summary. ' +
    'Use this to check if a call has completed and what was discussed.',
  inputSchema: z.object({
    conversationId: z.string().describe('The conversation ID returned by phone_call'),
  }),
  async execute(input, _ctx) {
    const result = await getConversationDetails(input.conversationId);

    if (!result.success) {
      return `Error: ${result.error}`;
    }

    const parts: string[] = [];
    parts.push(`Status: ${result.status ?? 'unknown'}`);

    if (result.duration != null) {
      parts.push(`Duration: ${result.duration}s`);
    }

    if (result.transcript && result.transcript.length > 0) {
      parts.push('');
      parts.push('Transcript:');
      for (const turn of result.transcript) {
        parts.push(`  ${turn.role}: ${turn.message}`);
      }
    }

    if (result.analysis?.summary) {
      parts.push('');
      parts.push(`Summary: ${result.analysis.summary}`);
    }

    if (result.analysis?.data_collection && Object.keys(result.analysis.data_collection).length > 0) {
      parts.push('');
      parts.push('Collected Data:');
      for (const [key, value] of Object.entries(result.analysis.data_collection)) {
        parts.push(`  ${key}: ${JSON.stringify(value)}`);
      }
    }

    return parts.join('\n');
  },
};
