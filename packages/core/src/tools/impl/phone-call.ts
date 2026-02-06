import { z } from 'zod';
import type { ScoobyToolDefinition } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT_MS = 30_000;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';

// In-memory map: conversationId -> { workspaceId, sessionId, phoneNumber }
export const activeCallRegistry = new Map<string, {
  workspaceId: string;
  sessionId: string;
  phoneNumber: string;
}>();

// ============================================================================
// Types
// ============================================================================

export interface PhoneCallResult {
  success: boolean;
  conversationId?: string;
  callId?: string;
  error?: string;
}

export interface PhoneCallOptions {
  agentId: string;
  agentPhoneNumberId: string;
  toNumber: string;
  context?: string;
  firstMessage?: string;
  dynamicVariables?: Record<string, string>;
  timeoutMs?: number;
}

// ============================================================================
// Core Phone Call Function
// ============================================================================

/**
 * Initiate an outbound phone call via ElevenLabs Conversational AI.
 * Uses the Twilio outbound call endpoint.
 */
export async function initiatePhoneCall(options: PhoneCallOptions): Promise<PhoneCallResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'ELEVENLABS_API_KEY not set. Configure it in .env or skills config.' };
  }

  const {
    agentId,
    agentPhoneNumberId,
    toNumber,
    context,
    firstMessage,
    dynamicVariables,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  // Validate phone number format (E.164: + followed by digits)
  if (!/^\+[1-9]\d{1,14}$/.test(toNumber)) {
    return { success: false, error: `Invalid phone number "${toNumber}". Use E.164 format (e.g. +14155551234).` };
  }

  const baseUrl = (process.env.ELEVENLABS_BASE_URL?.trim() || ELEVENLABS_BASE_URL).replace(/\/+$/, '');

  const body: Record<string, unknown> = {
    agent_id: agentId,
    agent_phone_number_id: agentPhoneNumberId,
    to_number: toNumber,
  };

  // Pass context and dynamic variables via dynamic_variables (NOT config overrides,
  // which require agent Security settings to be enabled and can cause immediate hangup).
  // The ElevenLabs agent's prompt should reference {{call_context}} to use the context.
  const vars: Record<string, string> = { ...dynamicVariables };
  if (context) {
    vars.call_context = context;
  }
  if (firstMessage) {
    vars.first_message = firstMessage;
  }
  if (Object.keys(vars).length > 0) {
    body.conversation_initiation_client_data = { dynamic_variables: vars };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/v1/convai/twilio/outbound-call`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `ElevenLabs API error: ${response.status} ${errText}` };
      }

      const result = await response.json() as {
        success?: boolean;
        message?: string;
        conversation_id?: string;
        callSid?: string;
      };

      return {
        success: result.success ?? true,
        conversationId: result.conversation_id,
        callId: result.callSid,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Phone call request timed out' };
    }
    return { success: false, error: `Phone call error: ${err.message}` };
  }
}

/**
 * Check if phone calling is available (has required env vars).
 */
export function isPhoneCallConfigured(): boolean {
  return Boolean(
    (process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY) &&
    process.env.ELEVENLABS_AGENT_ID &&
    process.env.ELEVENLABS_PHONE_NUMBER_ID
  );
}

// ============================================================================
// Tool Definition
// ============================================================================

export const phoneCallTool: ScoobyToolDefinition = {
  name: 'phone_call',
  description:
    'Initiate an outbound phone call using an autonomous ElevenLabs Conversational AI voice agent. ' +
    'Once initiated, the voice agent independently handles the entire phone conversation — ' +
    'you do NOT need to monitor, stay connected, or manage the call. ' +
    'The voice agent will call the number, speak, listen, and respond on its own. ' +
    'Use the "context" parameter to tell the voice agent the purpose of the call and any details it needs. ' +
    'Requires ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, and ELEVENLABS_PHONE_NUMBER_ID.',
  inputSchema: z.object({
    phoneNumber: z
      .string()
      .describe('Phone number to call in E.164 format (e.g. +14155551234)'),
    context: z
      .string()
      .optional()
      .describe(
        'The purpose and details of the call, passed to the voice agent as a dynamic variable. ' +
        'Be specific — include names, times, requests, and any information the agent needs.'
      ),
    firstMessage: z
      .string()
      .optional()
      .describe(
        'The opening line the voice agent says when the call is answered, passed as a dynamic variable. ' +
        'Example: "Hi, I\'d like to make a reservation please."'
      ),
    agentId: z
      .string()
      .optional()
      .describe('ElevenLabs agent ID. Defaults to ELEVENLABS_AGENT_ID env var.'),
    phoneNumberId: z
      .string()
      .optional()
      .describe('ElevenLabs phone number ID. Defaults to ELEVENLABS_PHONE_NUMBER_ID env var.'),
  }),
  async execute(input, ctx) {
    const agentId = input.agentId ?? process.env.ELEVENLABS_AGENT_ID;
    if (!agentId) {
      return 'Error: No agent ID provided. Set ELEVENLABS_AGENT_ID or pass agentId parameter.';
    }

    const phoneNumberId = input.phoneNumberId ?? process.env.ELEVENLABS_PHONE_NUMBER_ID;
    if (!phoneNumberId) {
      return 'Error: No phone number ID provided. Set ELEVENLABS_PHONE_NUMBER_ID or pass phoneNumberId parameter.';
    }

    const result = await initiatePhoneCall({
      agentId,
      agentPhoneNumberId: phoneNumberId,
      toNumber: input.phoneNumber,
      context: input.context,
      firstMessage: input.firstMessage,
    });

    if (!result.success) {
      return `Error: ${result.error}`;
    }

    if (result.conversationId) {
      activeCallRegistry.set(result.conversationId, {
        workspaceId: ctx.workspace.id,
        sessionId: ctx.session.id,
        phoneNumber: input.phoneNumber,
      });
    }

    const parts = [
      `Phone call initiated to ${input.phoneNumber}.`,
      'The voice agent is now handling the call autonomously.',
    ];
    if (result.conversationId) parts.push(`Conversation ID: ${result.conversationId}`);
    if (result.callId) parts.push(`Call SID: ${result.callId}`);
    return parts.join('\n');
  },
};
