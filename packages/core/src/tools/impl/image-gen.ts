import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { ScoobyToolDefinition, ToolContext } from '../types.js';

export const imageGenTool: ScoobyToolDefinition = {
  name: 'image_gen',
  description:
    'Generate an image from a text prompt. Uses OpenAI (gpt-image-1) if OPENAI_API_KEY is set, or Gemini if GEMINI_API_KEY is set.',
  inputSchema: z.object({
    prompt: z.string().describe('Image description'),
    provider: z
      .enum(['openai', 'gemini'])
      .optional()
      .describe('Provider to use. Auto-detected from env if omitted.'),
    size: z.string().optional().default('1024x1024').describe('Image size (e.g. "1024x1024")'),
    quality: z.string().optional().default('auto').describe('Quality setting (low, medium, high, auto)'),
  }),
  async execute(input, ctx) {
    const imagesDir = join(ctx.workspace.path, 'data', 'images');
    await mkdir(imagesDir, { recursive: true });

    const timestamp = Date.now();
    const slug = input.prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40)
      .replace(/-+$/, '');

    const resolvedProvider =
      input.provider ??
      (process.env.OPENAI_API_KEY ? 'openai' : process.env.GEMINI_API_KEY ? 'gemini' : null);

    if (!resolvedProvider) {
      return 'Error: No image generation provider available. Set OPENAI_API_KEY or GEMINI_API_KEY.';
    }

    if (resolvedProvider === 'openai') {
      return generateOpenAI(input, imagesDir, timestamp, slug, ctx);
    }

    return generateGemini(input, imagesDir, timestamp, slug, ctx);
  },
};

async function generateOpenAI(
  input: { prompt: string; size: string; quality: string },
  imagesDir: string,
  timestamp: number,
  slug: string,
  ctx: ToolContext,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return 'Error: OPENAI_API_KEY not set';

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: input.prompt,
      size: input.size,
      quality: input.quality,
      n: 1,
      output_format: 'png',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return `Error from OpenAI Images API: ${response.status} ${err}`;
  }

  const json = (await response.json()) as { data: Array<{ b64_json?: string; url?: string }> };
  const item = json.data[0];

  let buffer: Buffer | undefined;
  let filePath: string | undefined;

  if (item.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64');
    filePath = join(imagesDir, `${timestamp}-${slug}.png`);
    await writeFile(filePath, buffer);
  } else if (item.url) {
    const imgResponse = await fetch(item.url);
    buffer = Buffer.from(await imgResponse.arrayBuffer());
    filePath = join(imagesDir, `${timestamp}-${slug}.png`);
    await writeFile(filePath, buffer);
  }

  if (!buffer || !filePath) {
    return 'Error: No image data returned from OpenAI';
  }

  // Send image as attachment if channel supports it
  if (ctx.conversation) {
    await ctx.sendMessage(ctx.conversation.channelType, {
      conversationId: ctx.conversation.conversationId,
      text: '',
      attachments: [{
        type: 'photo',
        localPath: filePath,
        mimeType: 'image/png',
        fileName: basename(filePath),
        caption: `Generated: ${input.prompt}`,
      }],
    });
    return `Image generated and sent (${buffer.length} bytes)`;
  }

  return `Image saved to ${filePath} (${buffer.length} bytes)`;
}

async function generateGemini(
  input: { prompt: string },
  imagesDir: string,
  timestamp: number,
  slug: string,
  ctx: ToolContext,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return 'Error: GEMINI_API_KEY not set';

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey });

    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents: input.prompt,
      config: {
        responseModalities: ['IMAGE'],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) {
      return 'Error: No response parts from Gemini';
    }

    for (const part of parts) {
      if (part.inlineData?.data) {
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        const mimeExt = part.inlineData.mimeType?.includes('png') ? 'png' : 'jpg';
        const mimeType = part.inlineData.mimeType ?? (mimeExt === 'png' ? 'image/png' : 'image/jpeg');
        const filePath = join(imagesDir, `${timestamp}-${slug}.${mimeExt}`);
        await writeFile(filePath, buffer);

        // Send image as attachment if channel supports it
        if (ctx.conversation) {
          await ctx.sendMessage(ctx.conversation.channelType, {
            conversationId: ctx.conversation.conversationId,
            text: '',
            attachments: [{
              type: 'photo',
              localPath: filePath,
              mimeType,
              fileName: basename(filePath),
              caption: `Generated: ${input.prompt}`,
            }],
          });
          return `Image generated and sent (${buffer.length} bytes)`;
        }

        return `Image saved to ${filePath} (${buffer.length} bytes)`;
      }
    }

    return 'Error: No image data in Gemini response';
  } catch (err: any) {
    return `Error generating image with Gemini: ${err.message}`;
  }
}
