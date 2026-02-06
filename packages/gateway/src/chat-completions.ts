import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { transcriptToMessages, type AgentRunner, type AgentRunOptions } from '@scooby/core';

// ── Context interface ───────────────────────────────────────────────

export interface ChatCompletionsContext {
  authToken?: string;
  listWorkspaceIds: () => string[];
  getWorkspace: (id: string) => Promise<{
    id: string;
    path: string;
    agent: import('@scooby/core').AgentProfile;
    permissions: import('@scooby/core').WorkspacePermissions;
  } | null>;
  getSessionManager: (workspaceId: string) => import('@scooby/core').SessionManager;
  getMemoryProvider: (workspaceId: string) => import('@scooby/core').MemorySearchProvider | undefined;
  getMemoryService: (workspaceId: string) => import('@scooby/core').MemoryService | undefined;
  createAgentRunner: (workspaceId: string) => AgentRunner;
  getToolContext: (workspaceId: string, sessionId: string) => import('@scooby/core').ToolContext;
  getGlobalModels: () => { fast: import('@scooby/core').ModelCandidate[]; slow: import('@scooby/core').ModelCandidate[] };
  getUsageTracker: (workspaceId: string) => import('@scooby/core').UsageTracker | undefined;
  resolveCitations: (workspaceId: string) => boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────

function openaiError(message: string, type: string, code: string) {
  return { error: { message, type, code } };
}

interface OpenAIMessage {
  role: string;
  content: string;
}

function parseWorkspaceFromModel(model: string): string | null {
  // "scooby:<id>" or "agent:<id>"
  const match = model.match(/^(?:scooby|agent):(.+)$/);
  return match ? match[1] : null;
}

// ── Factory ─────────────────────────────────────────────────────────

export function createChatCompletionsApi(ctx: ChatCompletionsContext) {
  const app = new Hono();

  app.post('/v1/chat/completions', async (c) => {
    // 1. Auth check
    if (ctx.authToken) {
      const authHeader = c.req.header('authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token !== ctx.authToken) {
        return c.json(
          openaiError('Invalid API key', 'authentication_error', 'invalid_api_key'),
          401,
        );
      }
    }

    // 2. Parse body
    let body: {
      messages?: OpenAIMessage[];
      model?: string;
      stream?: boolean;
      user?: string;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json(openaiError('Invalid JSON body', 'invalid_request_error', 'invalid_body'), 400);
    }

    const { messages, model, stream, user } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return c.json(
        openaiError('messages is required and must be a non-empty array', 'invalid_request_error', 'invalid_messages'),
        400,
      );
    }

    // 3. Resolve workspace
    const headerWorkspaceId = c.req.header('x-scooby-workspace-id');
    let workspaceId: string | null = headerWorkspaceId ?? null;

    if (!workspaceId && model) {
      workspaceId = parseWorkspaceFromModel(model);
    }

    if (!workspaceId) {
      const ids = ctx.listWorkspaceIds();
      workspaceId = ids.length > 0 ? ids[0] : null;
    }

    if (!workspaceId) {
      return c.json(openaiError('No workspace available', 'not_found_error', 'workspace_not_found'), 404);
    }

    const workspace = await ctx.getWorkspace(workspaceId);
    if (!workspace) {
      return c.json(openaiError(`Workspace not found: ${workspaceId}`, 'not_found_error', 'workspace_not_found'), 404);
    }

    // 4. Resolve session
    const headerSessionKey = c.req.header('x-scooby-session-key');
    let sessionKey: string;
    if (headerSessionKey) {
      sessionKey = headerSessionKey;
    } else if (user) {
      sessionKey = `api:user:${user}`;
    } else {
      sessionKey = `api:${randomUUID()}`;
    }

    const sessionMgr = ctx.getSessionManager(workspaceId);
    const session = await sessionMgr.getOrCreate('api', sessionKey);

    // 5. Record user message in transcript
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    if (lastUserMessage) {
      await sessionMgr.appendTranscript(session.id, {
        timestamp: new Date().toISOString(),
        role: 'user',
        content: lastUserMessage.content,
      });
    }

    // 6. Get transcript and build full message list
    const transcript = await sessionMgr.getTranscript(session.id);
    const fullMessages = await transcriptToMessages(transcript);

    // Get memory context
    const memProvider = ctx.getMemoryProvider(workspaceId);
    const memoryContext = memProvider && lastUserMessage
      ? await memProvider.getContextForPrompt(workspaceId, lastUserMessage.content)
      : [];

    const globalModels = ctx.getGlobalModels();
    const toolCtx = ctx.getToolContext(workspaceId, session.id);

    // 7. Run agent
    const agentRunner = ctx.createAgentRunner(workspaceId);
    const runOptions: AgentRunOptions = {
      messages: fullMessages,
      workspaceId,
      workspacePath: workspace.path,
      agent: workspace.agent,
      sessionId: session.id,
      toolContext: toolCtx,
      globalModels: {
        fast: globalModels.fast,
        slow: globalModels.slow,
      },
      memoryContext,
      usageTracker: ctx.getUsageTracker(workspaceId),
      agentName: workspace.agent.name,
      channelType: 'api',
      citationsEnabled: ctx.resolveCitations(workspaceId),
      memoryBackend: memProvider?.backendName,
    };

    const completionId = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    const modelName = `scooby:${workspaceId}`;

    if (stream) {
      return streamResponse(c, agentRunner, runOptions, completionId, created, modelName);
    } else {
      return nonStreamResponse(c, agentRunner, runOptions, completionId, created, modelName);
    }
  });

  return app;
}

// ── Non-streaming ───────────────────────────────────────────────────

async function nonStreamResponse(
  c: any,
  agentRunner: AgentRunner,
  options: AgentRunOptions,
  id: string,
  created: number,
  model: string,
) {
  let fullResponse = '';
  let promptTokens = 0;
  let completionTokens = 0;

  for await (const event of agentRunner.run(options)) {
    if (event.type === 'text-delta') {
      fullResponse += event.content;
    } else if (event.type === 'done') {
      fullResponse = event.response;
      promptTokens = event.usage.promptTokens;
      completionTokens = event.usage.completionTokens;
    }
  }

  return c.json({
    id,
    object: 'chat.completion',
    created,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: fullResponse },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  });
}

// ── Streaming ───────────────────────────────────────────────────────

function streamResponse(
  c: any,
  agentRunner: AgentRunner,
  options: AgentRunOptions,
  id: string,
  created: number,
  model: string,
) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(data: string) {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }

      // First chunk: role
      send(JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
      }));

      try {
        for await (const event of agentRunner.run(options)) {
          if (event.type === 'text-delta') {
            send(JSON.stringify({
              id,
              object: 'chat.completion.chunk',
              created,
              model,
              choices: [{ index: 0, delta: { content: event.content }, finish_reason: null }],
            }));
          } else if (event.type === 'done') {
            // Final chunk
            send(JSON.stringify({
              id,
              object: 'chat.completion.chunk',
              created,
              model,
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              usage: {
                prompt_tokens: event.usage.promptTokens,
                completion_tokens: event.usage.completionTokens,
                total_tokens: event.usage.promptTokens + event.usage.completionTokens,
              },
            }));
          }
        }
      } catch (err) {
        // Send error as a final chunk if possible
        send(JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        }));
      }

      send('[DONE]');
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
