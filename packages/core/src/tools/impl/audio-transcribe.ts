import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { ScoobyToolDefinition } from '../types.js';
import { resolveSandboxedPath } from '../permissions.js';

export const audioTranscribeTool: ScoobyToolDefinition = {
  name: 'audio_transcribe',
  description:
    'Transcribe an audio file to text using OpenAI Whisper API. Supports mp3, mp4, mpeg, mpga, m4a, wav, and webm.',
  inputSchema: z.object({
    filePath: z.string().describe('Path to audio file'),
    language: z
      .string()
      .optional()
      .describe('ISO language hint (e.g. "en")'),
    model: z.string().optional().default('whisper-1').describe('Whisper model to use'),
  }),
  async execute(input, ctx) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return 'Error: OPENAI_API_KEY not set';
    }

    const resolved = resolveSandboxedPath(input.filePath, ctx.permissions);

    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(resolved);
    } catch (err: any) {
      return `Error reading audio file: ${err.message}`;
    }

    const fileName = basename(resolved);
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer]);

    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('model', input.model);
    if (input.language) {
      formData.append('language', input.language);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        const errText = await response.text();
        return `Error from Whisper API: ${response.status} ${errText}`;
      }

      const result = (await response.json()) as { text: string };
      return result.text;
    } catch (err: any) {
      return `Error transcribing audio: ${err.message}`;
    }
  },
};
