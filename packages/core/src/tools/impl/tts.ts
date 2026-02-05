import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { ScoobyToolDefinition, ToolContext } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OPENAI_MODEL = 'tts-1';
const DEFAULT_OPENAI_VOICE = 'alloy';
const DEFAULT_ELEVENLABS_VOICE_ID = 'pMsXgVXv3BLzUgSXRplE';
const DEFAULT_ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2';
const DEFAULT_TIMEOUT_MS = 30_000;

export const TTS_MAX_TEXT_LENGTH = 4096;
export const OPENAI_TTS_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'] as const;
export const OPENAI_TTS_MODELS = ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'] as const;

export type TtsProvider = 'openai' | 'elevenlabs';

// ============================================================================
// TTS Result Type
// ============================================================================

export interface TtsResult {
  success: boolean;
  audioPath?: string;
  audioBuffer?: Buffer;
  error?: string;
  provider?: TtsProvider;
  voice?: string;
  model?: string;
}

// ============================================================================
// TTS Options
// ============================================================================

export interface TtsOptions {
  text: string;
  outputDir: string;
  provider?: TtsProvider;
  voice?: string;
  model?: string;
  timeoutMs?: number;
}

// ============================================================================
// Core TTS Generation Function (Shared Logic)
// ============================================================================

/**
 * Generate text-to-speech audio. This is the core function used by both
 * the TTS tool and the /tts slash command.
 */
export async function generateTts(options: TtsOptions): Promise<TtsResult> {
  const { text, outputDir, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  if (!text.trim()) {
    return { success: false, error: 'Text cannot be empty' };
  }

  if (text.length > TTS_MAX_TEXT_LENGTH) {
    return { success: false, error: `Text too long (${text.length} chars, max ${TTS_MAX_TEXT_LENGTH})` };
  }

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // Generate filename
  const timestamp = Date.now();
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 30)
    .replace(/-+$/, '');
  const filePath = join(outputDir, `${timestamp}-${slug}.mp3`);

  // Resolve provider
  const provider = resolveProvider(options.provider);
  if (!provider) {
    return { success: false, error: 'No TTS provider available. Set OPENAI_API_KEY or ELEVENLABS_API_KEY.' };
  }

  // Generate audio
  if (provider === 'openai') {
    return generateWithOpenAI({ text, filePath, voice: options.voice, model: options.model, timeoutMs });
  }

  return generateWithElevenLabs({ text, filePath, voice: options.voice, model: options.model, timeoutMs });
}

/**
 * Resolve which TTS provider to use.
 */
export function resolveProvider(preferred?: TtsProvider): TtsProvider | null {
  if (preferred) {
    // Validate the preferred provider has credentials
    if (preferred === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
    if (preferred === 'elevenlabs' && (process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY)) return 'elevenlabs';
    // Fall through to auto-detect if preferred isn't configured
  }

  // Auto-detect based on available API keys
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY) return 'elevenlabs';
  return null;
}

/**
 * Check if a TTS provider is configured (has API key).
 */
export function isProviderConfigured(provider: TtsProvider): boolean {
  if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  if (provider === 'elevenlabs') return Boolean(process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY);
  return false;
}

// ============================================================================
// OpenAI TTS
// ============================================================================

interface OpenAITtsParams {
  text: string;
  filePath: string;
  voice?: string;
  model?: string;
  timeoutMs: number;
}

async function generateWithOpenAI(params: OpenAITtsParams): Promise<TtsResult> {
  const { text, filePath, timeoutMs } = params;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'OPENAI_API_KEY not set' };
  }

  const voice = params.voice ?? DEFAULT_OPENAI_VOICE;
  const model = params.model ?? DEFAULT_OPENAI_MODEL;
  const isCustomEndpoint = Boolean(process.env.OPENAI_TTS_BASE_URL);

  // Validate voice (skip validation for custom endpoints)
  if (!isCustomEndpoint && !OPENAI_TTS_VOICES.includes(voice as typeof OPENAI_TTS_VOICES[number])) {
    return { success: false, error: `Invalid OpenAI voice "${voice}". Valid: ${OPENAI_TTS_VOICES.join(', ')}` };
  }

  // Validate model (skip validation for custom endpoints)
  if (!isCustomEndpoint && !OPENAI_TTS_MODELS.includes(model as typeof OPENAI_TTS_MODELS[number])) {
    return { success: false, error: `Invalid OpenAI model "${model}". Valid: ${OPENAI_TTS_MODELS.join(', ')}` };
  }

  const baseUrl = (process.env.OPENAI_TTS_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: text,
          voice,
          response_format: 'mp3',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `OpenAI TTS error: ${response.status} ${err}` };
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      await writeFile(filePath, audioBuffer);

      return {
        success: true,
        audioPath: filePath,
        audioBuffer,
        provider: 'openai',
        voice,
        model,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'TTS request timed out' };
    }
    return { success: false, error: `OpenAI TTS error: ${err.message}` };
  }
}

// ============================================================================
// ElevenLabs TTS
// ============================================================================

interface ElevenLabsTtsParams {
  text: string;
  filePath: string;
  voice?: string;
  model?: string;
  timeoutMs: number;
}

async function generateWithElevenLabs(params: ElevenLabsTtsParams): Promise<TtsResult> {
  const { text, filePath, timeoutMs } = params;
  const apiKey = process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'ELEVENLABS_API_KEY not set' };
  }

  const voiceId = params.voice ?? DEFAULT_ELEVENLABS_VOICE_ID;
  const modelId = params.model ?? DEFAULT_ELEVENLABS_MODEL_ID;

  // Validate voice ID format (alphanumeric, 10-40 chars)
  if (!/^[a-zA-Z0-9]{10,40}$/.test(voiceId)) {
    return { success: false, error: `Invalid ElevenLabs voice ID format "${voiceId}"` };
  }

  const baseUrl = (process.env.ELEVENLABS_BASE_URL?.trim() || 'https://api.elevenlabs.io').replace(/\/+$/, '');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `${baseUrl}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `ElevenLabs error: ${response.status} ${err}` };
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      await writeFile(filePath, audioBuffer);

      return {
        success: true,
        audioPath: filePath,
        audioBuffer,
        provider: 'elevenlabs',
        voice: voiceId,
        model: modelId,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'TTS request timed out' };
    }
    return { success: false, error: `ElevenLabs error: ${err.message}` };
  }
}

// ============================================================================
// Helper to create caption from text
// ============================================================================

export function createTtsCaption(text: string, maxLength = 100): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const ttsTool: ScoobyToolDefinition = {
  name: 'tts',
  description:
    'Convert text to speech audio. Uses OpenAI TTS if OPENAI_API_KEY is set, or ElevenLabs if ELEVENLABS_API_KEY is set.',
  inputSchema: z.object({
    text: z.string().describe('Text to convert to speech'),
    provider: z
      .enum(['openai', 'elevenlabs'])
      .optional()
      .describe('TTS provider. Auto-detected from env if omitted.'),
    voice: z
      .string()
      .optional()
      .describe('Voice to use. OpenAI: alloy, echo, fable, onyx, nova, shimmer. ElevenLabs: voice ID.'),
    model: z
      .string()
      .optional()
      .describe('Model to use. OpenAI: tts-1, tts-1-hd. ElevenLabs: model ID.'),
  }),
  async execute(input, ctx) {
    const audioDir = join(ctx.workspace.path, 'data', 'audio');

    const result = await generateTts({
      text: input.text,
      outputDir: audioDir,
      provider: input.provider,
      voice: input.voice,
      model: input.model,
    });

    if (!result.success) {
      return `Error: ${result.error}`;
    }

    // Send audio as attachment if channel supports it
    if (ctx.conversation && result.audioPath) {
      await ctx.sendMessage(ctx.conversation.channelType, {
        conversationId: ctx.conversation.conversationId,
        text: '',
        attachments: [{
          type: 'audio',
          localPath: result.audioPath,
          mimeType: 'audio/mpeg',
          fileName: basename(result.audioPath),
          caption: createTtsCaption(input.text),
        }],
      });
      return `Audio generated and sent (${result.audioBuffer?.length ?? 0} bytes, voice: ${result.voice})`;
    }

    return `Audio saved to ${result.audioPath} (${result.audioBuffer?.length ?? 0} bytes)`;
  },
};
