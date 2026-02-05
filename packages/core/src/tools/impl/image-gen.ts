import { z } from 'zod';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { ScoobyToolDefinition, ToolContext } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SIZE = '1024x1024';
const DEFAULT_QUALITY = 'auto';
const DEFAULT_TIMEOUT_MS = 60_000;

export const IMAGE_MAX_PROMPT_LENGTH = 4000;
export const IMAGE_SIZES = ['256x256', '512x512', '1024x1024', '1024x1792', '1792x1024'] as const;
export const IMAGE_QUALITIES = ['low', 'medium', 'high', 'auto'] as const;

export type ImageProvider = 'openai' | 'gemini';

// ============================================================================
// Input Image Type
// ============================================================================

/**
 * An input image for image-to-image generation.
 * Provide either data (base64), localPath, or url.
 */
export interface InputImage {
  /** Base64-encoded image data */
  data?: string;
  /** Path to a local image file */
  localPath?: string;
  /** URL to fetch the image from */
  url?: string;
  /** MIME type of the image (auto-detected if not provided) */
  mimeType?: string;
}

// ============================================================================
// Image Result Type
// ============================================================================

export interface ImageResult {
  success: boolean;
  imagePath?: string;
  imageBuffer?: Buffer;
  error?: string;
  provider?: ImageProvider;
  mimeType?: string;
  size?: string;
}

// ============================================================================
// Image Options
// ============================================================================

export interface ImageOptions {
  prompt: string;
  outputDir: string;
  provider?: ImageProvider;
  size?: string;
  quality?: string;
  timeoutMs?: number;
  /** Optional input images for image-to-image generation */
  inputImages?: InputImage[];
}

// ============================================================================
// Helper to load input image data
// ============================================================================

interface ResolvedImage {
  data: Buffer;
  mimeType: string;
}

async function resolveInputImage(input: InputImage): Promise<ResolvedImage> {
  let data: Buffer;
  let mimeType = input.mimeType ?? 'image/png';

  if (input.data) {
    data = Buffer.from(input.data, 'base64');
  } else if (input.localPath) {
    data = await readFile(input.localPath);
    // Infer mime type from extension if not provided
    if (!input.mimeType) {
      const ext = input.localPath.toLowerCase().split('.').pop();
      if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'gif') mimeType = 'image/gif';
      else if (ext === 'webp') mimeType = 'image/webp';
    }
  } else if (input.url) {
    const response = await fetch(input.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: ${response.status}`);
    }
    data = Buffer.from(await response.arrayBuffer());
    // Try to get mime type from response headers
    if (!input.mimeType) {
      const contentType = response.headers.get('content-type');
      if (contentType?.startsWith('image/')) {
        mimeType = contentType.split(';')[0];
      }
    }
  } else {
    throw new Error('InputImage must have data, localPath, or url');
  }

  return { data, mimeType };
}

// ============================================================================
// Core Image Generation Function (Shared Logic)
// ============================================================================

/**
 * Generate an image from a text prompt, optionally using input images as reference.
 * This is the core function used by both the image_gen tool and the /image slash command.
 */
export async function generateImage(options: ImageOptions): Promise<ImageResult> {
  const {
    prompt,
    outputDir,
    size = DEFAULT_SIZE,
    quality = DEFAULT_QUALITY,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    inputImages,
  } = options;

  if (!prompt.trim()) {
    return { success: false, error: 'Prompt cannot be empty' };
  }

  if (prompt.length > IMAGE_MAX_PROMPT_LENGTH) {
    return { success: false, error: `Prompt too long (${prompt.length} chars, max ${IMAGE_MAX_PROMPT_LENGTH})` };
  }

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // Generate filename
  const timestamp = Date.now();
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/-+$/, '');

  // Resolve provider
  const provider = resolveImageProvider(options.provider);
  if (!provider) {
    return { success: false, error: 'No image generation provider available. Set OPENAI_API_KEY or GEMINI_API_KEY.' };
  }

  // Resolve input images if provided
  let resolvedImages: ResolvedImage[] | undefined;
  if (inputImages && inputImages.length > 0) {
    try {
      resolvedImages = await Promise.all(inputImages.map(resolveInputImage));
    } catch (err: any) {
      return { success: false, error: `Failed to load input image: ${err.message}` };
    }
  }

  // Generate image
  if (provider === 'openai') {
    return generateWithOpenAI({ prompt, outputDir, timestamp, slug, size, quality, timeoutMs, inputImages: resolvedImages });
  }

  return generateWithGemini({ prompt, outputDir, timestamp, slug, timeoutMs, inputImages: resolvedImages });
}

/**
 * Resolve which image provider to use.
 */
export function resolveImageProvider(preferred?: ImageProvider): ImageProvider | null {
  if (preferred) {
    // Validate the preferred provider has credentials
    if (preferred === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
    if (preferred === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
    // Fall through to auto-detect if preferred isn't configured
  }

  // Auto-detect based on available API keys
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return null;
}

/**
 * Check if an image provider is configured (has API key).
 */
export function isImageProviderConfigured(provider: ImageProvider): boolean {
  if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  if (provider === 'gemini') return Boolean(process.env.GEMINI_API_KEY);
  return false;
}

// ============================================================================
// OpenAI Image Generation
// ============================================================================

interface OpenAIImageParams {
  prompt: string;
  outputDir: string;
  timestamp: number;
  slug: string;
  size: string;
  quality: string;
  timeoutMs: number;
  inputImages?: ResolvedImage[];
}

async function generateWithOpenAI(params: OpenAIImageParams): Promise<ImageResult> {
  const { prompt, outputDir, timestamp, slug, size, quality, timeoutMs, inputImages } = params;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'OPENAI_API_KEY not set' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response: Response;

      if (inputImages && inputImages.length > 0) {
        // Use the images/edits endpoint for image-to-image generation
        const formData = new FormData();

        // Add the first image as the base image
        const firstImage = inputImages[0];
        // Convert Buffer to ArrayBuffer for Blob compatibility
        const arrayBuffer = firstImage.data.buffer.slice(
          firstImage.data.byteOffset,
          firstImage.data.byteOffset + firstImage.data.byteLength
        ) as ArrayBuffer;
        const imageBlob = new Blob([arrayBuffer], { type: firstImage.mimeType });
        formData.append('image', imageBlob, 'input.png');

        formData.append('prompt', prompt);
        formData.append('model', 'gpt-image-1');
        formData.append('size', size);
        formData.append('quality', quality);
        formData.append('n', '1');

        response = await fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
          signal: controller.signal,
        });
      } else {
        // Standard text-to-image generation
        response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-image-1',
            prompt,
            size,
            quality,
            n: 1,
            output_format: 'png',
          }),
          signal: controller.signal,
        });
      }

      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `OpenAI Images API error: ${response.status} ${err}` };
      }

      const json = (await response.json()) as { data: Array<{ b64_json?: string; url?: string }> };
      const item = json.data[0];

      let imageBuffer: Buffer | undefined;

      if (item.b64_json) {
        imageBuffer = Buffer.from(item.b64_json, 'base64');
      } else if (item.url) {
        const imgResponse = await fetch(item.url);
        imageBuffer = Buffer.from(await imgResponse.arrayBuffer());
      }

      if (!imageBuffer) {
        return { success: false, error: 'No image data returned from OpenAI' };
      }

      const filePath = join(outputDir, `${timestamp}-${slug}.png`);
      await writeFile(filePath, imageBuffer);

      return {
        success: true,
        imagePath: filePath,
        imageBuffer,
        provider: 'openai',
        mimeType: 'image/png',
        size,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Image generation request timed out' };
    }
    return { success: false, error: `OpenAI error: ${err.message}` };
  }
}

// ============================================================================
// Gemini Image Generation
// ============================================================================

interface GeminiImageParams {
  prompt: string;
  outputDir: string;
  timestamp: number;
  slug: string;
  timeoutMs: number;
  inputImages?: ResolvedImage[];
}

async function generateWithGemini(params: GeminiImageParams): Promise<ImageResult> {
  const { prompt, outputDir, timestamp, slug, inputImages } = params;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'GEMINI_API_KEY not set' };
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey });

    // Build contents with optional input images
    let contents: any;
    if (inputImages && inputImages.length > 0) {
      // Include images in the content for multimodal input
      const parts: any[] = [];

      // Add input images first
      for (const img of inputImages) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.data.toString('base64'),
          },
        });
      }

      // Add the text prompt
      parts.push({ text: prompt });

      contents = [{ role: 'user', parts }];
    } else {
      contents = prompt;
    }

    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents,
      config: {
        responseModalities: ['IMAGE'],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) {
      return { success: false, error: 'No response parts from Gemini' };
    }

    for (const part of parts) {
      if (part.inlineData?.data) {
        const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
        const mimeExt = part.inlineData.mimeType?.includes('png') ? 'png' : 'jpg';
        const mimeType = part.inlineData.mimeType ?? (mimeExt === 'png' ? 'image/png' : 'image/jpeg');
        const filePath = join(outputDir, `${timestamp}-${slug}.${mimeExt}`);
        await writeFile(filePath, imageBuffer);

        return {
          success: true,
          imagePath: filePath,
          imageBuffer,
          provider: 'gemini',
          mimeType,
        };
      }
    }

    return { success: false, error: 'No image data in Gemini response' };
  } catch (err: any) {
    return { success: false, error: `Gemini error: ${err.message}` };
  }
}

// ============================================================================
// Helper to create caption from prompt
// ============================================================================

export function createImageCaption(prompt: string, maxLength = 100): string {
  const caption = `Generated: ${prompt}`;
  return caption.length > maxLength ? `${caption.slice(0, maxLength - 3)}...` : caption;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const imageGenTool: ScoobyToolDefinition = {
  name: 'image_gen',
  description:
    'Generate an image from a text prompt, optionally using reference images. Uses OpenAI (gpt-image-1) if OPENAI_API_KEY is set, or Gemini if GEMINI_API_KEY is set.',
  inputSchema: z.object({
    prompt: z.string().describe('Image description or editing instructions'),
    provider: z
      .enum(['openai', 'gemini'])
      .optional()
      .describe('Provider to use. Auto-detected from env if omitted.'),
    size: z.string().optional().default('1024x1024').describe('Image size (e.g. "1024x1024")'),
    quality: z.string().optional().default('auto').describe('Quality setting (low, medium, high, auto)'),
    inputImages: z
      .array(
        z.object({
          localPath: z.string().optional().describe('Path to a local image file'),
          url: z.string().optional().describe('URL to fetch the image from'),
          data: z.string().optional().describe('Base64-encoded image data'),
          mimeType: z.string().optional().describe('MIME type of the image'),
        })
      )
      .optional()
      .describe('Optional input images for image-to-image generation or editing'),
  }),
  async execute(input, ctx) {
    const imagesDir = join(ctx.workspace.path, 'data', 'images');

    const result = await generateImage({
      prompt: input.prompt,
      outputDir: imagesDir,
      provider: input.provider,
      size: input.size,
      quality: input.quality,
      inputImages: input.inputImages,
    });

    if (!result.success) {
      return `Error: ${result.error}`;
    }

    // Send image as attachment if channel supports it
    if (ctx.conversation && result.imagePath) {
      await ctx.sendMessage(ctx.conversation.channelType, {
        conversationId: ctx.conversation.conversationId,
        text: '',
        attachments: [{
          type: 'photo',
          localPath: result.imagePath,
          mimeType: result.mimeType ?? 'image/png',
          fileName: basename(result.imagePath),
          caption: createImageCaption(input.prompt),
        }],
      });
      return `Image generated and sent (${result.imageBuffer?.length ?? 0} bytes)`;
    }

    return `Image saved to ${result.imagePath} (${result.imageBuffer?.length ?? 0} bytes)`;
  },
};
