import { join, basename } from 'node:path';
import { generateImage, createImageCaption, IMAGE_MAX_PROMPT_LENGTH } from '@scooby/core';
import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

export function createImageCommand(): CommandDefinition {
  return {
    name: 'image',
    aliases: ['img', 'generate', 'gen'],
    description: 'Generate an image from a text prompt',
    usage: '/image [prompt]',
    handler: async (args: string, ctx: CommandContext): Promise<CommandResult> => {
      const prompt = args.trim();

      if (!prompt) {
        const response = 'Please provide a prompt for image generation.\n\nUsage: `/image A sunset over mountains`';
        await ctx.sendReply(response, 'markdown');
        return { handled: true, response, suppressTranscript: true };
      }

      if (prompt.length > IMAGE_MAX_PROMPT_LENGTH) {
        const response = `Prompt too long (${prompt.length} chars, max ${IMAGE_MAX_PROMPT_LENGTH})`;
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      if (!ctx.sendAttachment) {
        const response = 'Image attachments not supported in this channel.';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      await ctx.sendReply('Generating image...', 'text');

      const imagesDir = join(ctx.workspace.path, 'data', 'images');
      const result = await generateImage({ prompt, outputDir: imagesDir });

      if (!result.success || !result.imagePath) {
        const response = result.error ?? 'Image generation failed';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      await ctx.sendAttachment({
        type: 'photo',
        localPath: result.imagePath,
        mimeType: result.mimeType ?? 'image/png',
        fileName: basename(result.imagePath),
        caption: createImageCaption(prompt),
      });

      const response = `Image generated (${result.provider})`;
      return { handled: true, response, suppressTranscript: true };
    },
  };
}
