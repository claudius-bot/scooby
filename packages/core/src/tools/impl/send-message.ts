import { z } from 'zod';
import type { ScoobyToolDefinition } from '../types.js';

export const sendMessageTool: ScoobyToolDefinition = {
  name: 'send_message',
  description: 'Send a message to the current conversation. Useful for sending intermediate updates or long-running task status.',
  inputSchema: z.object({
    message: z.string().describe('Message text to send'),
  }),
  async execute(input, ctx) {
    await ctx.sendMessage(ctx.session.workspaceId, {
      conversationId: ctx.session.id,
      text: input.message,
      format: 'markdown',
    });
    return 'Message sent';
  },
};
