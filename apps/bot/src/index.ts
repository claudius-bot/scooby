import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import type { ModelMessage } from 'ai';
import {
  loadConfig,
  loadWorkspace,
  type Workspace,
  type ScoobyConfig,
  ToolRegistry,
  type ToolContext,
  type OutboundMessage,
  setAiGatewayConfig,
  SessionManager,
  AgentRunner,
  CooldownTracker,
  MemoryService,
  CronScheduler,
  Heartbeat,
  WebhookManager,
  UsageTracker,
  loadUsageSummary,
  shellExecTool,
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  browserTool,
  sendMessageTool,
  memorySearchTool,
  webSearchTool,
  webFetchTool,
  imageGenTool,
  audioTranscribeTool,
} from '@scooby/core';
import {
  TelegramAdapter,
  WebChatAdapter,
  MessageQueue,
  type InboundMessage,
  type ChannelAdapter,
} from '@scooby/channels';
import { GatewayServer } from '@scooby/gateway';
import { MessageRouter } from './router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
loadEnv({ path: resolve(__dirname, '..', '..', '..', '.env') });

async function main() {
  console.log('[Scooby] Starting...');

  // 1. Load config
  const configPath = resolve(__dirname, '..', '..', '..', 'scooby.config.json5');
  const config = await loadConfig(configPath);
  console.log(`[Scooby] Config loaded from ${configPath}`);

  // 1b. Configure AI Gateway if present
  if (config.aiGateway) {
    setAiGatewayConfig(config.aiGateway);
    console.log('[Scooby] AI Gateway configured');
  }

  // 2. Load workspaces
  const workspaces = new Map<string, Workspace>();
  const configDir = dirname(configPath);
  for (const wsConfig of config.workspaces) {
    const ws = await loadWorkspace(wsConfig, configDir);
    workspaces.set(ws.id, ws);
    console.log(`[Scooby] Workspace loaded: ${ws.id} (${ws.agent.name})`);
  }

  // 3. Initialize provider cooldowns
  const cooldowns = new CooldownTracker();

  // 4. Initialize memory services per workspace
  const memoryServices = new Map<string, MemoryService>();
  if (config.models.embedding) {
    for (const [id, ws] of workspaces) {
      const dbPath = resolve(ws.path, 'data', 'memory.db');
      const memService = new MemoryService({
        dbPath,
        embeddingConfig: config.models.embedding,
      });
      memoryServices.set(id, memService);
      // Initial index of memory files
      const memoryDir = resolve(ws.path, 'memory');
      const chunks = await memService.reindex(id, memoryDir);
      if (chunks > 0) {
        console.log(`[Scooby] Indexed ${chunks} memory chunks for workspace ${id}`);
      }
    }
  }

  // 5. Create session managers per workspace
  const sessionManagers = new Map<string, SessionManager>();
  const sessionConfig = config.session ?? { idleResetMinutes: 30, maxTranscriptLines: 500 };
  for (const [id, ws] of workspaces) {
    const mgr = new SessionManager({
      sessionsDir: resolve(ws.path, 'sessions'),
      workspaceId: id,
      idleResetMinutes: sessionConfig.idleResetMinutes ?? 30,
      maxTranscriptLines: sessionConfig.maxTranscriptLines ?? 500,
    });
    sessionManagers.set(id, mgr);
  }

  // 5b. Create usage trackers per workspace
  const usageTrackers = new Map<string, UsageTracker>();
  for (const [id, ws] of workspaces) {
    usageTrackers.set(id, new UsageTracker(resolve(ws.path, 'data')));
  }

  // 6. Create tool registry
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(shellExecTool);
  toolRegistry.register(fileReadTool);
  toolRegistry.register(fileWriteTool);
  toolRegistry.register(fileEditTool);
  toolRegistry.register(browserTool);
  toolRegistry.register(sendMessageTool);
  toolRegistry.register(memorySearchTool);
  toolRegistry.register(webSearchTool);
  toolRegistry.register(webFetchTool);
  toolRegistry.register(imageGenTool);
  toolRegistry.register(audioTranscribeTool);

  // 7. Channel adapters
  const channelAdapters: ChannelAdapter[] = [];
  let telegramAdapter: TelegramAdapter | null = null;
  const webChatAdapter = new WebChatAdapter();

  const telegramToken = config.channels?.telegram?.botToken;
  if (telegramToken && !telegramToken.includes('${')) {
    telegramAdapter = new TelegramAdapter({
      botToken: telegramToken,
    });
    channelAdapters.push(telegramAdapter);
  } else if (telegramToken) {
    console.log('[Scooby] Telegram bot token not configured (env var not set), skipping Telegram');
  }

  if (config.channels?.webchat?.enabled) {
    channelAdapters.push(webChatAdapter);
  }

  // 8. Message router
  const router = new MessageRouter(config);

  // 9. Send message function for tools
  const sendMessage = async (channelType: string, msg: OutboundMessage) => {
    for (const adapter of channelAdapters) {
      if (adapter.type === channelType) {
        await adapter.send(msg);
        return;
      }
    }
  };

  // 10. Gateway server
  const gatewayConfig = config.gateway ?? { host: '0.0.0.0', port: 3000 };
  const gateway = new GatewayServer(
    {
      host: gatewayConfig.host ?? '0.0.0.0',
      port: gatewayConfig.port ?? 3000,
      wsPath: gatewayConfig.websocket?.path ?? '/ws',
    },
    {
      listWorkspaces: async () => {
        return Array.from(workspaces.values()).map((ws) => ({
          id: ws.id,
          agent: {
            name: ws.agent.name,
            vibe: ws.agent.vibe,
            emoji: ws.agent.emoji,
            avatar: ws.agent.avatar,
          },
        }));
      },
      getWorkspace: async (id: string) => {
        const ws = workspaces.get(id);
        if (!ws) return null;
        return { id: ws.id, path: ws.path, agent: ws.agent };
      },
      listSessions: async (workspaceId: string) => {
        const mgr = sessionManagers.get(workspaceId);
        if (!mgr) return [];
        return mgr.listSessions();
      },
      getTranscript: async (workspaceId: string, sessionId: string, limit?: number) => {
        const mgr = sessionManagers.get(workspaceId);
        if (!mgr) return [];
        return mgr.getTranscript(sessionId, limit);
      },
      handleWebhook: async (workspaceId: string, body: any) => {
        return webhookManager.handle(workspaceId, body);
      },
      getUsage: async (workspaceId: string, days?: number) => {
        const ws = workspaces.get(workspaceId);
        if (!ws) return { totals: {}, byModel: {}, byDay: {}, byAgent: {} };
        return loadUsageSummary(resolve(ws.path, 'data'), { days });
      },
    },
  );

  // Register WebSocket method handlers
  gateway.registerMethod('chat.send', async (connectionId, params) => {
    const { workspaceId, text } = params as { workspaceId: string; text: string };
    const ws = workspaces.get(workspaceId);
    if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);

    const sessionMgr = sessionManagers.get(workspaceId)!;
    const session = await sessionMgr.getOrCreate('webchat', connectionId);

    // Bind connection to workspace
    gateway.getConnections().bindWorkspace(connectionId, workspaceId, session.id);

    // Record user message
    await sessionMgr.appendTranscript(session.id, {
      timestamp: new Date().toISOString(),
      role: 'user',
      content: text,
    });

    // Run agent
    const agentRunner = new AgentRunner(toolRegistry, cooldowns, sessionMgr);
    const transcript = await sessionMgr.getTranscript(session.id);
    const messages = transcript.map((t) => ({
      role: t.role,
      content: t.content,
    })) as ModelMessage[];

    // Get memory context
    const memService = memoryServices.get(workspaceId);
    const memoryContext = memService ? await memService.getContextForPrompt(workspaceId, text) : [];

    const toolCtx: ToolContext = {
      workspace: { id: ws.id, path: ws.path },
      session: { id: session.id, workspaceId },
      permissions: ws.permissions,
      sendMessage,
    };

    // Stream response back via WebSocket
    const stream = agentRunner.run({
      messages,
      workspaceId,
      workspacePath: ws.path,
      agent: ws.agent,
      sessionId: session.id,
      toolContext: toolCtx,
      globalModels: {
        fast: config.models.fast.candidates,
        slow: config.models.slow.candidates,
      },
      memoryContext,
      usageTracker: usageTrackers.get(workspaceId),
      agentName: ws.agent.name,
      channelType: 'webchat',
    });

    // Process stream events and forward to WebSocket
    (async () => {
      for await (const event of stream) {
        gateway.sendEvent(connectionId, `chat.${event.type}`, event);
      }
    })().catch((err) => {
      console.error(`[Scooby] Stream error for connection ${connectionId}:`, err);
      gateway.sendEvent(connectionId, 'chat.error', { error: String(err) });
    });

    return { sessionId: session.id };
  });

  gateway.registerMethod('chat.history', async (_connectionId, params) => {
    const { workspaceId, sessionId, limit } = params as {
      workspaceId: string;
      sessionId: string;
      limit?: number;
    };
    const mgr = sessionManagers.get(workspaceId);
    if (!mgr) return { transcript: [] };
    const transcript = await mgr.getTranscript(sessionId, limit);
    return { transcript };
  });

  gateway.registerMethod('session.list', async (_connectionId, params) => {
    const { workspaceId } = params as { workspaceId: string };
    const mgr = sessionManagers.get(workspaceId);
    if (!mgr) return { sessions: [] };
    return { sessions: await mgr.listSessions() };
  });

  gateway.registerMethod('workspace.list', async () => {
    return {
      workspaces: Array.from(workspaces.values()).map((ws) => ({
        id: ws.id,
        agent: {
          name: ws.agent.name,
          vibe: ws.agent.vibe,
          emoji: ws.agent.emoji,
          avatar: ws.agent.avatar,
        },
      })),
    };
  });

  gateway.registerMethod('workspace.get', async (_connectionId, params) => {
    const { workspaceId } = params as { workspaceId: string };
    const ws = workspaces.get(workspaceId);
    if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);
    return { id: ws.id, path: ws.path, agent: ws.agent };
  });

  // 11. Message handler for channel adapters
  const messageQueue = new MessageQueue({ debounceMs: 500 });
  messageQueue.onFlush(async (msg: InboundMessage) => {
    const route = router.route(msg);
    if (!route) {
      console.warn(`[Scooby] No route for message from ${msg.channelType}:${msg.conversationId}`);
      return;
    }

    const { workspaceId } = route;
    const ws = workspaces.get(workspaceId);
    if (!ws) {
      console.warn(`[Scooby] Workspace not found: ${workspaceId}`);
      return;
    }

    const sessionMgr = sessionManagers.get(workspaceId)!;
    const session = await sessionMgr.getOrCreate(msg.channelType, msg.conversationId);

    // Record user message
    await sessionMgr.appendTranscript(session.id, {
      timestamp: new Date().toISOString(),
      role: 'user',
      content: msg.text,
    });

    // Get transcript for context
    const transcript = await sessionMgr.getTranscript(session.id);
    const messages = transcript.map((t) => ({
      role: t.role,
      content: t.content,
    })) as ModelMessage[];

    // Get memory context
    const memService = memoryServices.get(workspaceId);
    const memoryContext = memService ? await memService.getContextForPrompt(workspaceId, msg.text) : [];

    const toolCtx: ToolContext = {
      workspace: { id: ws.id, path: ws.path },
      session: { id: session.id, workspaceId },
      permissions: ws.permissions,
      sendMessage,
    };

    const agentRunner = new AgentRunner(toolRegistry, cooldowns, sessionMgr);

    let fullResponse = '';
    for await (const event of agentRunner.run({
      messages,
      workspaceId,
      workspacePath: ws.path,
      agent: ws.agent,
      sessionId: session.id,
      toolContext: toolCtx,
      globalModels: {
        fast: config.models.fast.candidates,
        slow: config.models.slow.candidates,
      },
      memoryContext,
      usageTracker: usageTrackers.get(workspaceId),
      agentName: ws.agent.name,
      channelType: msg.channelType,
    })) {
      if (event.type === 'done') {
        fullResponse = event.response;
      }
    }

    // Send response back through channel
    if (fullResponse) {
      const adapter = channelAdapters.find((a) => a.type === msg.channelType);
      if (adapter) {
        await adapter.send({
          conversationId: msg.conversationId,
          text: fullResponse,
          format: 'markdown',
        });
      }
    }
  });

  // Wire channel adapters to message queue
  for (const adapter of channelAdapters) {
    adapter.onMessage(async (msg) => {
      messageQueue.push(msg);
    });
  }

  // 12. Cron scheduler
  const cronScheduler = new CronScheduler(resolve(configDir, 'data'));
  cronScheduler.onJob(async (job) => {
    const ws = workspaces.get(job.workspace);
    if (!ws) return;

    const sessionMgr = sessionManagers.get(job.workspace)!;
    const session = await sessionMgr.getOrCreate('cron', `cron:${job.id}`);

    const toolCtx: ToolContext = {
      workspace: { id: ws.id, path: ws.path },
      session: { id: session.id, workspaceId: job.workspace },
      permissions: ws.permissions,
      sendMessage,
    };

    const agentRunner = new AgentRunner(toolRegistry, cooldowns, sessionMgr);
    for await (const _event of agentRunner.run({
      messages: [{ role: 'user', content: job.prompt }],
      workspaceId: job.workspace,
      workspacePath: ws.path,
      agent: ws.agent,
      sessionId: session.id,
      toolContext: toolCtx,
      globalModels: {
        fast: config.models.fast.candidates,
        slow: config.models.slow.candidates,
      },
      usageTracker: usageTrackers.get(job.workspace),
      agentName: ws.agent.name,
      channelType: 'cron',
    })) {
      // Consume stream
    }

    console.log(`[Cron] Job "${job.id}" completed`);
  });

  if (config.cron) {
    for (const job of config.cron) {
      await cronScheduler.schedule(job);
    }
  }

  // 13. Heartbeat
  const heartbeatConfig = config.heartbeat ?? { intervalMinutes: 5 };
  const heartbeat = new Heartbeat({ intervalMinutes: heartbeatConfig.intervalMinutes ?? 5 });

  heartbeat.registerTask('idle-session-sweep', async () => {
    for (const [id, mgr] of sessionManagers) {
      const archived = await mgr.checkIdleSessions();
      if (archived.length > 0) {
        console.log(`[Heartbeat] Archived ${archived.length} idle sessions in workspace ${id}`);
      }
    }
  });

  // 14. Webhook manager
  const webhookManager = new WebhookManager();
  webhookManager.onWebhook(async (workspaceId, payload) => {
    const ws = workspaces.get(workspaceId);
    if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);

    const sessionMgr = sessionManagers.get(workspaceId)!;
    const session = await sessionMgr.getOrCreate('webhook', `webhook:${Date.now()}`);

    const toolCtx: ToolContext = {
      workspace: { id: ws.id, path: ws.path },
      session: { id: session.id, workspaceId },
      permissions: ws.permissions,
      sendMessage,
    };

    const agentRunner = new AgentRunner(toolRegistry, cooldowns, sessionMgr);
    let response = '';
    for await (const event of agentRunner.run({
      messages: [{ role: 'user', content: payload.prompt! }],
      workspaceId,
      workspacePath: ws.path,
      agent: ws.agent,
      sessionId: session.id,
      toolContext: toolCtx,
      globalModels: {
        fast: config.models.fast.candidates,
        slow: config.models.slow.candidates,
      },
      usageTracker: usageTrackers.get(workspaceId),
      agentName: ws.agent.name,
      channelType: 'webhook',
    })) {
      if (event.type === 'done') {
        response = event.response;
      }
    }

    return { sessionId: session.id, response };
  });

  // 15. Start everything
  await gateway.start();

  for (const adapter of channelAdapters) {
    try {
      await adapter.start();
    } catch (err) {
      console.error(`[Scooby] Failed to start ${adapter.type} adapter:`, err instanceof Error ? err.message : err);
    }
  }

  heartbeat.start();

  console.log('[Scooby] All systems operational');

  // 16. Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Scooby] Received ${signal}, shutting down...`);

    heartbeat.stop();
    cronScheduler.stopAll();
    messageQueue.dispose();

    for (const adapter of channelAdapters) {
      await adapter.stop();
    }

    await gateway.stop();

    for (const memService of memoryServices.values()) {
      memService.close();
    }

    console.log('[Scooby] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[Scooby] Fatal error:', err);
  process.exit(1);
});
