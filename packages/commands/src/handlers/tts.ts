import { join, basename } from 'node:path';
import { generateTts, createTtsCaption, TTS_MAX_TEXT_LENGTH } from '@scooby/core';
import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

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

      if (text.length > TTS_MAX_TEXT_LENGTH) {
        const response = `Text too long (${text.length} chars, max ${TTS_MAX_TEXT_LENGTH})`;
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      if (!ctx.sendAttachment) {
        const response = 'Audio attachments not supported in this channel.';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      await ctx.sendReply('Generating audio...', 'text');

      const audioDir = join(ctx.workspace.path, 'data', 'audio');
      const result = await generateTts({ text, outputDir: audioDir });

      if (!result.success || !result.audioPath) {
        const response = result.error ?? 'TTS conversion failed';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      await ctx.sendAttachment({
        type: 'audio',
        localPath: result.audioPath,
        mimeType: 'audio/mpeg',
        fileName: basename(result.audioPath),
        caption: createTtsCaption(text),
      });

      const response = `Audio generated (${result.provider})`;
      return { handled: true, response, suppressTranscript: true };
    },
  };
}
