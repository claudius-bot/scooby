import { z } from 'zod';
import type { ScoobyToolDefinition } from '../types.js';

export const sendMessageTool: ScoobyToolDefinition = {
  name: 'send_message',
  description: 'Send a message to the current conversation. Useful for sending intermediate updates or long-running task status.',
  inputSchema: z.object({
    message: z.string().describe('Message text to send'),
  }),
  async execute(input, ctx) {
    if (!ctx.conversation) {
      return 'Error: No active conversation to send a message to.';
    }
    await ctx.sendMessage(ctx.conversation.channelType, {
      conversationId: ctx.conversation.conversationId,
      text: input.message,
      format: 'markdown',
    });
    return 'Message sent';
  },
};
