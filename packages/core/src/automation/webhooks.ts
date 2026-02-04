export interface WebhookPayload {
  prompt?: string;
  data?: Record<string, unknown>;
}

export interface WebhookResult {
  sessionId: string;
  response: string;
}

export type WebhookHandler = (workspaceId: string, payload: WebhookPayload) => Promise<WebhookResult>;

export class WebhookManager {
  private handler: WebhookHandler | null = null;

  onWebhook(handler: WebhookHandler): void {
    this.handler = handler;
  }

  async handle(workspaceId: string, payload: WebhookPayload): Promise<WebhookResult> {
    if (!this.handler) {
      throw new Error('No webhook handler registered');
    }

    // Build prompt from payload
    let prompt = payload.prompt ?? '';
    if (payload.data) {
      prompt += `\n\nWebhook data:\n${JSON.stringify(payload.data, null, 2)}`;
    }

    if (!prompt.trim()) {
      throw new Error('Webhook must include prompt or data');
    }

    console.log(`[Webhook] Received for workspace "${workspaceId}"`);
    return this.handler(workspaceId, { ...payload, prompt: prompt.trim() });
  }
}
