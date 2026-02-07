import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { tool as aiTool } from 'ai';
import { z } from 'zod';
import {
  transcriptToMessages,
  getLanguageModel,
  streamWithFailover,
  generateWithFailover,
  CooldownTracker,
  activeCallRegistry,
  type AgentRunner,
  type AgentRunOptions,
  type ModelCandidate,
  type FailoverCandidate,
} from '@scooby/core';

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
  globalSkillsDir?: string;
  skillEntries?: Record<string, { apiKey?: string; env?: Record<string, string> }>;
  askChannelUser?: (params: {
    channelType: string;
    conversationId: string;
    question: string;
    timeoutMs?: number;
  }) => Promise<string>;
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

// ── Daphne – dedicated voice agent for phone calls ──────────────────

const DAPHNE_SYSTEM_PROMPT = `You are Daphne, a personal assistant making a phone call on behalf of your employer.

WHO YOU ARE:
- You are a personal assistant. Your employer (the user) has asked you to make this phone call for them.
- You are calling a BUSINESS or THIRD PARTY (a restaurant, doctor's office, salon, service provider, etc.).
- The person who answers the phone works at that business. They are NOT your employer.
- Think of yourself like a human secretary or executive assistant picking up the phone to handle a task for your boss.

HOW TO BEHAVE:
- Speak naturally and conversationally, like a real person making a phone call.
- You already know what you need — the task details are provided below. Do NOT ask the person on the phone what you want. YOU are the one making the request.
- For example, if your task is "Make a dinner reservation for 4 at 7pm at Luigi's", you call and say something like "Hi, I'd like to make a reservation for 4 tonight at 7pm please" — you do NOT ask "What restaurant would you like?" because you already know.
- Keep responses concise. This is a voice call, not a text chat.
- Do NOT reveal that you are an AI unless directly asked.
- If the business asks for a name, use the name provided in your task context, or say "let me check" and use the ask_user tool.
- NEVER say "Is there anything else I can help you with?" or offer assistance to the person on the phone. You are NOT their assistant — you are a caller requesting a service. Once your task is done, simply say thank you and goodbye.

ASKING YOUR EMPLOYER:
- You have an "ask_user" tool that sends a text message to your employer and waits for their reply.
- Use it ONLY when a decision arises that you cannot make on your own (e.g. the requested time is unavailable and you need to confirm an alternative).
- While waiting, politely tell the person on the phone to hold for a moment (e.g. "Let me just check on that, one moment please.").
- Once you receive the reply, continue the conversation naturally.
- Only use ask_user when truly necessary — prefer making reasonable decisions yourself.

YOUR TASK:`;

const daphneCooldowns = new CooldownTracker();

/**
 * Detect whether an incoming request is from ElevenLabs voice agent
 * (identified by the presence of a system message with call instructions).
 */
function isVoiceCallRequest(messages: OpenAIMessage[]): boolean {
  return messages.some((m) => m.role === 'system');
}

/**
 * Build Daphne's system prompt by combining her base personality with
 * the ElevenLabs system message (which contains the substituted call_context).
 */
function buildDaphneSystemPrompt(elevenLabsSystemContent: string): string {
  return `${DAPHNE_SYSTEM_PROMPT}\n${elevenLabsSystemContent}`;
}

/**
 * Convert OpenAI-format messages to AI SDK format, filtering out the
 * system message (which is handled separately as the system prompt).
 */
function toAiSdkMessages(messages: OpenAIMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
}

/**
 * Find the active call matching a session ID, or fall back to the most recent call.
 */
function findActiveCall(sessionId?: string | null) {
  // Try exact match by session ID first
  if (sessionId) {
    for (const [, entry] of activeCallRegistry) {
      if (entry.sessionId === sessionId) {
        return entry;
      }
    }
  }
  // Fall back to most recent entry
  let lastEntry: { workspaceId: string; sessionId: string; phoneNumber: string; channelType?: string; channelConversationId?: string } | undefined;
  for (const [, entry] of activeCallRegistry) {
    lastEntry = entry;
  }
  return lastEntry;
}

/**
 * Create the ask_user AI SDK tool for Daphne. Sends a message to the user's
 * original chat channel and waits for their reply (up to 2 minutes).
 */
function createAskUserTool(askChannelUser?: ChatCompletionsContext['askChannelUser'], sessionId?: string | null) {
  const schema = z.object({
    question: z.string().describe('The question to ask your user (be specific and concise)'),
  });
  return aiTool({
    description:
      'Send a text message to your user via their chat channel and wait for their reply. ' +
      'Use this when you need a decision from your user during the call (e.g. confirming an alternative time). ' +
      'The user has up to 2 minutes to respond.',
    inputSchema: schema,
    execute: async (input: z.infer<typeof schema>) => {
      const { question } = input;
      const activeCall = findActiveCall(sessionId);
      if (!activeCall?.channelType || !activeCall?.channelConversationId || !askChannelUser) {
        return 'Unable to reach the user right now. Please use your best judgment to proceed.';
      }
      try {
        const reply = await askChannelUser({
          channelType: activeCall.channelType,
          conversationId: activeCall.channelConversationId,
          question: `**Daphne (on the phone):** ${question}`,
          timeoutMs: 120_000,
        });
        return reply;
      } catch {
        return 'The user did not respond in time. Please use your best judgment to proceed.';
      }
    },
  });
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

    const completionId = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    // ── Voice call path (Daphne) ──────────────────────────────────
    // When ElevenLabs sends a system message, it means this is a voice
    // call routed through the custom LLM integration. Use Daphne — a
    // dedicated, lightweight voice agent — instead of the full bot.
    if (isVoiceCallRequest(messages)) {
      const systemMsg = messages.find((m) => m.role === 'system');
      const daphneSystem = buildDaphneSystemPrompt(systemMsg?.content ?? '');
      const conversationMessages = toAiSdkMessages(messages);
      const globalModels = ctx.getGlobalModels();
      const modelName = 'daphne';

      // Read session ID from request header to identify the active call
      const callSessionId = c.req.header('x-scooby-session-id') ?? null;

      // Prefer fast models for low-latency voice responses
      const candidates: FailoverCandidate[] = globalModels.fast.map((c) => ({
        model: getLanguageModel(c.provider, c.model),
        candidate: c,
      }));

      if (candidates.length === 0) {
        return c.json(openaiError('No models configured', 'server_error', 'no_models'), 500);
      }

      const daphneTools = { ask_user: createAskUserTool(ctx.askChannelUser, callSessionId) };

      if (stream) {
        return daphneStreamResponse(c, candidates, daphneSystem, conversationMessages, daphneTools, completionId, created, modelName);
      } else {
        return daphneNonStreamResponse(c, candidates, daphneSystem, conversationMessages, daphneTools, completionId, created, modelName);
      }
    }

    // ── Standard API path (full Scooby agent) ─────────────────────

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
    const headerSessionKey = c.req.header('x-scooby-session-key')
      ?? c.req.header('x-openclaw-session-key');
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
      globalSkillsDir: ctx.globalSkillsDir,
      skillEntries: ctx.skillEntries,
    };

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

// ── Daphne Non-streaming ─────────────────────────────────────────────

async function daphneNonStreamResponse(
  c: any,
  candidates: FailoverCandidate[],
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  tools: Record<string, any>,
  id: string,
  created: number,
  model: string,
) {
  try {
    const result = await generateWithFailover({
      candidates,
      messages,
      system,
      tools,
      stopWhenStepCount: 3,
      cooldowns: daphneCooldowns,
    });

    const text = result.text ?? '';
    const usage = result.usage;

    return c.json({
      id,
      object: 'chat.completion',
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: text },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: usage?.inputTokens ?? 0,
        completion_tokens: usage?.outputTokens ?? 0,
        total_tokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
      },
    });
  } catch (err: any) {
    return c.json(
      openaiError(err.message ?? 'Internal error', 'server_error', 'model_error'),
      500,
    );
  }
}

// ── Daphne Streaming ─────────────────────────────────────────────────

function daphneStreamResponse(
  c: any,
  candidates: FailoverCandidate[],
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  tools: Record<string, any>,
  id: string,
  created: number,
  model: string,
) {
  const readable = new ReadableStream({
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
        const result = await streamWithFailover({
          candidates,
          messages,
          system,
          tools,
          stopWhenStepCount: 3,
          cooldowns: daphneCooldowns,
        });

        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            send(JSON.stringify({
              id,
              object: 'chat.completion.chunk',
              created,
              model,
              choices: [{ index: 0, delta: { content: part.text }, finish_reason: null }],
            }));
          }
          // tool-call and tool-result events are handled internally by the
          // AI SDK multi-step loop — only forward text deltas to ElevenLabs.
        }

        // Final chunk
        send(JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        }));
      } catch (err) {
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

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
