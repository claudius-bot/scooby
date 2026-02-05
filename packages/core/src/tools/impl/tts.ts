import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { ScoobyToolDefinition, ToolContext } from '../types.js';

const DEFAULT_OPENAI_MODEL = 'tts-1';
const DEFAULT_OPENAI_VOICE = 'alloy';
const DEFAULT_ELEVENLABS_VOICE_ID = 'pMsXgVXv3BLzUgSXRplE';
const DEFAULT_ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TEXT_LENGTH = 4096;

const OPENAI_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'] as const;
const OPENAI_MODELS = ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'] as const;

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
    if (input.text.length > MAX_TEXT_LENGTH) {
      return `Error: Text too long (${input.text.length} chars, max ${MAX_TEXT_LENGTH})`;
    }

    if (!input.text.trim()) {
      return 'Error: Text cannot be empty';
    }

    const audioDir = join(ctx.workspace.path, 'data', 'audio');
    await mkdir(audioDir, { recursive: true });

    const timestamp = Date.now();
    const slug = input.text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30)
      .replace(/-+$/, '');

    const resolvedProvider =
      input.provider ??
      (process.env.OPENAI_API_KEY ? 'openai' : process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : null);

    if (!resolvedProvider) {
      return 'Error: No TTS provider available. Set OPENAI_API_KEY or ELEVENLABS_API_KEY.';
    }

    if (resolvedProvider === 'openai') {
      return generateOpenAI(input, audioDir, timestamp, slug, ctx);
    }

    return generateElevenLabs(input, audioDir, timestamp, slug, ctx);
  },
};

async function generateOpenAI(
  input: { text: string; voice?: string; model?: string },
  audioDir: string,
  timestamp: number,
  slug: string,
  ctx: ToolContext,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return 'Error: OPENAI_API_KEY not set';

  const voice = input.voice ?? DEFAULT_OPENAI_VOICE;
  const model = input.model ?? DEFAULT_OPENAI_MODEL;

  // Validate voice if it's a known OpenAI voice
  if (!OPENAI_VOICES.includes(voice as typeof OPENAI_VOICES[number]) && !process.env.OPENAI_TTS_BASE_URL) {
    return `Error: Invalid OpenAI voice "${voice}". Valid voices: ${OPENAI_VOICES.join(', ')}`;
  }

  // Validate model if it's a known OpenAI model
  if (!OPENAI_MODELS.includes(model as typeof OPENAI_MODELS[number]) && !process.env.OPENAI_TTS_BASE_URL) {
    return `Error: Invalid OpenAI model "${model}". Valid models: ${OPENAI_MODELS.join(', ')}`;
  }

  const baseUrl = (process.env.OPENAI_TTS_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: input.text,
          voice,
          response_format: 'mp3',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        return `Error from OpenAI TTS API: ${response.status} ${err}`;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filePath = join(audioDir, `${timestamp}-${slug}.mp3`);
      await writeFile(filePath, buffer);

      // Send audio as attachment if channel supports it
      if (ctx.conversation) {
        await ctx.sendMessage(ctx.conversation.channelType, {
          conversationId: ctx.conversation.conversationId,
          text: '',
          attachments: [{
            type: 'audio',
            localPath: filePath,
            mimeType: 'audio/mpeg',
            fileName: basename(filePath),
            caption: input.text.length > 100 ? `${input.text.slice(0, 97)}...` : input.text,
          }],
        });
        return `Audio generated and sent (${buffer.length} bytes, voice: ${voice})`;
      }

      return `Audio saved to ${filePath} (${buffer.length} bytes)`;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return 'Error: TTS request timed out';
    }
    return `Error generating audio with OpenAI: ${err.message}`;
  }
}

async function generateElevenLabs(
  input: { text: string; voice?: string; model?: string },
  audioDir: string,
  timestamp: number,
  slug: string,
  ctx: ToolContext,
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;
  if (!apiKey) return 'Error: ELEVENLABS_API_KEY not set';

  const voiceId = input.voice ?? DEFAULT_ELEVENLABS_VOICE_ID;
  const modelId = input.model ?? DEFAULT_ELEVENLABS_MODEL_ID;

  // Validate voice ID format (alphanumeric, 10-40 chars)
  if (!/^[a-zA-Z0-9]{10,40}$/.test(voiceId)) {
    return `Error: Invalid ElevenLabs voice ID format "${voiceId}"`;
  }

  const baseUrl = (process.env.ELEVENLABS_BASE_URL?.trim() || 'https://api.elevenlabs.io').replace(/\/+$/, '');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

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
          text: input.text,
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
        return `Error from ElevenLabs API: ${response.status} ${err}`;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filePath = join(audioDir, `${timestamp}-${slug}.mp3`);
      await writeFile(filePath, buffer);

      // Send audio as attachment if channel supports it
      if (ctx.conversation) {
        await ctx.sendMessage(ctx.conversation.channelType, {
          conversationId: ctx.conversation.conversationId,
          text: '',
          attachments: [{
            type: 'audio',
            localPath: filePath,
            mimeType: 'audio/mpeg',
            fileName: basename(filePath),
            caption: input.text.length > 100 ? `${input.text.slice(0, 97)}...` : input.text,
          }],
        });
        return `Audio generated and sent (${buffer.length} bytes, voice: ${voiceId})`;
      }

      return `Audio saved to ${filePath} (${buffer.length} bytes)`;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return 'Error: TTS request timed out';
    }
    return `Error generating audio with ElevenLabs: ${err.message}`;
  }
}
