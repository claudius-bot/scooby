import { z } from 'zod';
import type { ScoobyToolDefinition } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT_MS = 30_000;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';

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

  // Add optional conversation initiation data
  if (firstMessage || dynamicVariables) {
    const clientData: Record<string, unknown> = {};
    if (firstMessage) {
      clientData.conversation_config_override = {
        agent: { first_message: firstMessage },
      };
    }
    if (dynamicVariables) {
      clientData.dynamic_variables = dynamicVariables;
    }
    body.conversation_initiation_client_data = clientData;
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
    'Initiate an outbound phone call using an ElevenLabs Conversational AI voice agent. ' +
    'The agent will call the specified phone number and conduct a conversation. ' +
    'Requires ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, and ELEVENLABS_PHONE_NUMBER_ID to be configured.',
  inputSchema: z.object({
    phoneNumber: z
      .string()
      .describe('Phone number to call in E.164 format (e.g. +14155551234)'),
    agentId: z
      .string()
      .optional()
      .describe('ElevenLabs agent ID. Defaults to ELEVENLABS_AGENT_ID env var.'),
    phoneNumberId: z
      .string()
      .optional()
      .describe('ElevenLabs phone number ID. Defaults to ELEVENLABS_PHONE_NUMBER_ID env var.'),
    firstMessage: z
      .string()
      .optional()
      .describe('Custom first message the agent says when the call connects.'),
    dynamicVariables: z
      .record(z.string())
      .optional()
      .describe('Dynamic variables to pass to the agent conversation (e.g. caller name, context).'),
  }),
  async execute(input, _ctx) {
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
      firstMessage: input.firstMessage,
      dynamicVariables: input.dynamicVariables,
    });

    if (!result.success) {
      return `Error: ${result.error}`;
    }

    const parts = [`Phone call initiated to ${input.phoneNumber}`];
    if (result.conversationId) parts.push(`Conversation ID: ${result.conversationId}`);
    if (result.callId) parts.push(`Call SID: ${result.callId}`);
    return parts.join('\n');
  },
};
