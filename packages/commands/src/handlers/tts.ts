import { writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

const DEFAULT_OPENAI_MODEL = 'tts-1';
const DEFAULT_OPENAI_VOICE = 'alloy';
const DEFAULT_ELEVENLABS_VOICE_ID = 'pMsXgVXv3BLzUgSXRplE';
const DEFAULT_ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TEXT_LENGTH = 4096;

const OPENAI_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'] as const;

type TtsResult = {
  success: boolean;
  audioPath?: string;
  error?: string;
  provider?: string;
};

export function createTtsCommand(): CommandDefinition {
  return {
    name: 'tts',
    aliases: ['speak', 'voice'],
    description: 'Convert text to speech',
    usage: '/tts [text]',
    handler: async (args: string, ctx: CommandContext): Promise<CommandResult> => {
      const text = args.trim();

      if (!text) {
        const response = 'Please provide text to convert to speech.\n\nUsage: `/tts Hello, world!`';
        await ctx.sendReply(response, 'markdown');
        return { handled: true, response, suppressTranscript: true };
      }

      if (text.length > MAX_TEXT_LENGTH) {
        const response = `Text too long (${text.length} chars, max ${MAX_TEXT_LENGTH})`;
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      // Check for sendAttachment capability
      if (!ctx.sendAttachment) {
        const response = 'Audio attachments not supported in this channel.';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      await ctx.sendReply('Generating audio...', 'text');

      try {
        const result = await generateTts(text, ctx.workspace.path);

        if (!result.success || !result.audioPath) {
          const response = result.error ?? 'TTS conversion failed';
          await ctx.sendReply(response, 'text');
          return { handled: true, response, suppressTranscript: true };
        }

        // Send the audio as an attachment
        await ctx.sendAttachment({
          type: 'audio',
          localPath: result.audioPath,
          mimeType: 'audio/mpeg',
          fileName: basename(result.audioPath),
          caption: text.length > 100 ? `${text.slice(0, 97)}...` : text,
        });

        const response = `Audio generated (${result.provider})`;
        return { handled: true, response, suppressTranscript: true };
      } catch (err) {
        const response = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }
    },
  };
}

async function generateTts(text: string, workspacePath: string): Promise<TtsResult> {
  // Determine provider
  const provider = process.env.OPENAI_API_KEY
    ? 'openai'
    : process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY
      ? 'elevenlabs'
      : null;

  if (!provider) {
    return {
      success: false,
      error: 'No TTS provider available. Set OPENAI_API_KEY or ELEVENLABS_API_KEY.',
    };
  }

  const audioDir = join(workspacePath, 'data', 'audio');
  await mkdir(audioDir, { recursive: true });

  const timestamp = Date.now();
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 30)
    .replace(/-+$/, '');

  if (provider === 'openai') {
    return generateOpenAI(text, audioDir, timestamp, slug);
  }

  return generateElevenLabs(text, audioDir, timestamp, slug);
}

async function generateOpenAI(
  text: string,
  audioDir: string,
  timestamp: number,
  slug: string,
): Promise<TtsResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'OPENAI_API_KEY not set' };
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
          model: DEFAULT_OPENAI_MODEL,
          input: text,
          voice: DEFAULT_OPENAI_VOICE,
          response_format: 'mp3',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `OpenAI TTS error: ${response.status} ${err}` };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filePath = join(audioDir, `${timestamp}-${slug}.mp3`);
      await writeFile(filePath, buffer);

      return { success: true, audioPath: filePath, provider: 'openai' };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'TTS request timed out' };
    }
    return { success: false, error: err.message };
  }
}

async function generateElevenLabs(
  text: string,
  audioDir: string,
  timestamp: number,
  slug: string,
): Promise<TtsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'ELEVENLABS_API_KEY not set' };
  }

  const baseUrl = (process.env.ELEVENLABS_BASE_URL?.trim() || 'https://api.elevenlabs.io').replace(/\/+$/, '');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const url = `${baseUrl}/v1/text-to-speech/${DEFAULT_ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: DEFAULT_ELEVENLABS_MODEL_ID,
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

      const buffer = Buffer.from(await response.arrayBuffer());
      const filePath = join(audioDir, `${timestamp}-${slug}.mp3`);
      await writeFile(filePath, buffer);

      return { success: true, audioPath: filePath, provider: 'elevenlabs' };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'TTS request timed out' };
    }
    return { success: false, error: err.message };
  }
}
