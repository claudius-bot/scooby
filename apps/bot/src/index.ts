import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFile, mkdir, unlink } from 'node:fs/promises';
import { config as loadEnv } from 'dotenv';
import {
  loadConfig,
  loadWorkspace,
  type Workspace,
  type ScoobyConfig,
  type MemoryConfig,
  ToolRegistry,
  type ToolContext,
  type OutboundMessage,
  setAiGatewayConfig,
  SessionManager,
  AgentRunner,
  CooldownTracker,
  MemoryService,
  type MemorySearchProvider,
  BuiltinSearchProvider,
  FallbackSearchProvider,
  QmdMemoryManager,
  WorkspaceCronScheduler,
  Heartbeat,
  WorkspaceHeartbeat,
  WebhookManager,
  UsageTracker,
  ModelOverrideStore,
  loadUsageSummary,
  transcriptToMessages,
  type TranscriptContentPart,
  generateWithFailover,
  getLanguageModel,
  type FailoverCandidate,
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
  ttsTool,
  scratchpadReadTool,
  scratchpadWriteTool,
  memoryGetTool,
  memoryWriteTool,
  fileListTool,
  fileDeleteTool,
  fileMoveTool,
  fileSearchTool,
  phoneCallTool,
  activeCallRegistry,
  loadSkills,
  cronAddTool,
  cronRemoveTool,
  cronListTool,
  agentSwitchTool,
  loadAgentDefinitions,
  AgentRegistry,
  AgentRouter,
  type AgentProfile,
} from '@scooby/core';
import {
  TelegramAdapter,
  WebChatAdapter,
  MessageQueue,
  prepareOutboundText,
  type InboundMessage,
  type ChannelAdapter,
} from '@scooby/channels';
import { GatewayServer, createChatCompletionsApi } from '@scooby/gateway';
import {
  CommandProcessor,
  createDefaultRegistry,
  CodeManager,
  ChannelAccessStore,
  WorkspaceManager,
  type WorkspaceInfo,
} from '@scooby/commands';
import { MessageRouter } from './router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
loadEnv({ path: resolve(__dirname, '..', '..', '..', '.env') });

async function main() {
  console.log('[Scooby] Starting...');

  // 1. Load config
  const configPath = resolve(__dirname, '..', '..', '..', 'scooby.config.json5');
  const config = await loadConfig(configPath);
  const configDir = dirname(configPath);
  console.log(`[Scooby] Config loaded from ${configPath}`);

  // 1b. Configure AI Gateway if present
  if (config.aiGateway) {
    setAiGatewayConfig(config.aiGateway);
    console.log('[Scooby] AI Gateway configured');
  }

  // 1c. Load standalone agents
  const agentsDir = resolve(configDir, config.agents?.dir ?? './agents');
  const agentProfiles = await loadAgentDefinitions(agentsDir);
  const agentRegistry = new AgentRegistry(agentProfiles);
  console.log(`[Scooby] Loaded ${agentProfiles.size} agents: ${Array.from(agentProfiles.keys()).join(', ')}`);

  // 1d. Create agent router
  const agentRouter = new AgentRouter(
    agentRegistry,
    config.models.fast.candidates,
    config.routing,
  );

  // 2. Load workspaces
  const workspaces = new Map<string, Workspace>();
  for (const wsConfig of config.workspaces) {
    const ws = await loadWorkspace(wsConfig, configDir);
    // Set workspace's default agent from registry
    const defaultAgentId = wsConfig.defaultAgent ?? agentRegistry.getDefaultId();
    const defaultAgent = agentRegistry.get(defaultAgentId);
    if (defaultAgent) {
      ws.agent = { ...defaultAgent, scratchpad: ws.agent.scratchpad, heartbeatChecklist: ws.agent.heartbeatChecklist };
    }
    workspaces.set(ws.id, ws);
    console.log(`[Scooby] Workspace loaded: ${ws.id} (default agent: ${ws.agent.name})`);
  }

  // 3. Initialize provider cooldowns
  const cooldowns = new CooldownTracker();

  // 4. Initialize memory services per workspace
  const memoryServices = new Map<string, MemoryService>();
  const memoryProviders = new Map<string, MemorySearchProvider>();

  function resolveCitations(memoryConfig: MemoryConfig | undefined, backendName: string): boolean {
    const mode = memoryConfig?.citations ?? 'auto';
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return backendName.startsWith('qmd'); // auto: on when QMD is active
  }

  async function createMemoryProvider(
    workspaceId: string,
    workspacePath: string,
    embeddingConfig: typeof config.models.embedding,
    memoryConfig: MemoryConfig | undefined,
  ): Promise<{ provider: MemorySearchProvider | null; builtinService: MemoryService | null }> {
    let builtinService: MemoryService | null = null;
    let builtinProvider: BuiltinSearchProvider | null = null;

    if (embeddingConfig) {
      const dbPath = resolve(workspacePath, 'data', 'memory.db');
      builtinService = new MemoryService({ dbPath, embeddingConfig });
      builtinProvider = new BuiltinSearchProvider(builtinService);
    }

    if ((memoryConfig?.backend ?? 'builtin') === 'qmd' && memoryConfig?.qmd) {
      const qmd = await QmdMemoryManager.create({
        workspaceId,
        workspacePath,
        qmdConfig: memoryConfig.qmd,
      });
      if (qmd && builtinProvider) {
        return { provider: new FallbackSearchProvider(qmd, builtinProvider), builtinService };
      } else if (qmd) {
        return { provider: qmd, builtinService: null };
      }
      console.warn(`[Scooby] QMD init failed for workspace ${workspaceId}, using builtin`);
    }

    return { provider: builtinProvider, builtinService };
  }

  for (const [id, ws] of workspaces) {
    const { provider, builtinService } = await createMemoryProvider(
      id, ws.path, config.models.embedding, config.memory,
    );
    if (provider) memoryProviders.set(id, provider);
    if (builtinService) {
      memoryServices.set(id, builtinService);
      const memoryDir = resolve(ws.path, 'memory');
      const chunks = await builtinService.reindex(id, memoryDir);
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

  // 5a. Conversation summarization on session archive
  const summarizeSession = async (sessionId: string, workspaceId: string, mgr: SessionManager) => {
    const memService = memoryServices.get(workspaceId);
    if (!memService) return;

    const transcript = await mgr.getTranscript(sessionId);
    if (transcript.length < 2) return;

    // Build plain-text conversation
    const lines: string[] = [];
    for (const entry of transcript) {
      let text = '';
      if (typeof entry.content === 'string') {
        text = entry.content;
      } else if (Array.isArray(entry.content)) {
        text = entry.content
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text)
          .join(' ');
      }
      if (text.trim()) {
        lines.push(`${entry.role}: ${text.trim()}`);
      }
    }

    const conversationText = lines.join('\n');
    if (conversationText.length < 100) return;

    try {
      const candidates: FailoverCandidate[] = config.models.fast.candidates.map((c) => ({
        model: getLanguageModel(c.provider, c.model),
        candidate: c,
      }));

      const result = await generateWithFailover({
        candidates,
        system: 'You are a concise summarizer. Summarize the following conversation in 2-4 sentences, capturing the key topics discussed, decisions made, and any important context that would be useful to recall later. Focus on facts and outcomes, not pleasantries.',
        messages: [{ role: 'user', content: conversationText }],
        cooldowns,
      });

      const summary = typeof result.text === 'string' ? result.text : '';
      if (summary.trim()) {
        await memService.index(workspaceId, `conversation-summary:${sessionId}`, summary);
        console.log(`[Scooby] Summarized session ${sessionId.slice(0, 8)}... for workspace ${workspaceId}`);
      }
    } catch (err) {
      console.error(`[Scooby] Failed to summarize session ${sessionId.slice(0, 8)}...:`, err);
    }
  };

  for (const [id, mgr] of sessionManagers) {
    mgr.onArchive((sid, wid) => {
      summarizeSession(sid, wid, mgr).catch((err) => {
        console.error(`[Scooby] Summarization error:`, err);
      });

      // QMD session export
      const provider = memoryProviders.get(wid);
      if (provider?.exportSession && config.memory?.qmd?.sessions?.enabled) {
        mgr.getTranscript(sid).then(transcript =>
          provider.exportSession!(sid, transcript)
        ).catch(err =>
          console.error(`[Scooby] Session export error:`, err));
      }
    });
  }

  // 5b. Pre-compaction memory flush
  const performMemoryFlush = async (
    workspaceId: string,
    sessionId: string,
    sessionMgr: SessionManager,
    agent: AgentProfile,
  ) => {
    const ws = workspaces.get(workspaceId);
    const memService = memoryServices.get(workspaceId);
    if (!ws || !memService) return;

    const flushToolCtx: ToolContext = {
      workspace: { id: ws.id, path: ws.path },
      session: { id: sessionId, workspaceId },
      permissions: ws.permissions,
      sendMessage,
      memoryService: memService,
      memoryProvider: memoryProviders.get(workspaceId),
      citationsEnabled: resolveCitations(config.memory, memoryProviders.get(workspaceId)?.backendName ?? 'builtin'),
      cronScheduler: cronSchedulers.get(workspaceId),
      agentRegistry,
    };

    const transcript = await sessionMgr.getTranscript(sessionId);
    const messages = await transcriptToMessages(transcript);

    messages.push({
      role: 'user',
      content:
        'Session transcript is getting long. Before context is lost, please save any important information, decisions, preferences, or context to memory using memory_write. Write to today\'s daily log (default) or MEMORY.md. If nothing important to save, do not call any tools.',
    });

    const flushRunner = new AgentRunner(toolRegistry, cooldowns, sessionMgr);
    // Run silently — consume events without forwarding
    for await (const _event of flushRunner.run({
      messages,
      workspaceId,
      workspacePath: ws.path,
      agent,
      sessionId,
      toolContext: flushToolCtx,
      globalModels: {
        fast: config.models.fast.candidates,
        slow: config.models.slow.candidates,
      },
      usageTracker: usageTrackers.get(workspaceId),
      agentName: agent.name,
      channelType: 'system',
    })) {
      // Consume silently
    }

    sessionMgr.markFlushed(sessionId);
    console.log(`[Scooby] Memory flush completed for session ${sessionId.slice(0, 8)}...`);
  };

  // 5c. Create usage trackers per workspace
  const usageTrackers = new Map<string, UsageTracker>();
  for (const [id, ws] of workspaces) {
    usageTrackers.set(id, new UsageTracker(resolve(ws.path, 'data')));
  }

  // 5d. Create model override stores per workspace
  const modelOverrideStores = new Map<string, ModelOverrideStore>();
  for (const [id, ws] of workspaces) {
    modelOverrideStores.set(id, new ModelOverrideStore(resolve(ws.path, 'data')));
  }

  async function getWorkspaceModels(workspaceId: string) {
    const store = modelOverrideStores.get(workspaceId);
    return store ? await store.getWorkspaceModels() : undefined;
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
  toolRegistry.register(ttsTool);
  toolRegistry.register(scratchpadReadTool);
  toolRegistry.register(scratchpadWriteTool);
  toolRegistry.register(memoryGetTool);
  toolRegistry.register(memoryWriteTool);
  toolRegistry.register(fileListTool);
  toolRegistry.register(fileDeleteTool);
  toolRegistry.register(fileMoveTool);
  toolRegistry.register(fileSearchTool);
  toolRegistry.register(phoneCallTool);
  toolRegistry.register(cronAddTool);
  toolRegistry.register(cronRemoveTool);
  toolRegistry.register(cronListTool);
  toolRegistry.register(agentSwitchTool);

  // 6b. Create command processor, code manager, and workspace management
  const commandRegistry = createDefaultRegistry();
  const commandProcessor = new CommandProcessor({
    registry: commandRegistry,
    config,
  });
  const codeManager = new CodeManager();

  // Channel access store - tracks which channels have access to which workspaces
  const channelAccess = new ChannelAccessStore();
  channelAccess.setPath(resolve(configDir, 'data', 'channel-access.json'));
  await channelAccess.load();

  // Workspace manager - handles dynamic workspace creation
  const workspaceManager = new WorkspaceManager(resolve(configDir, 'workspaces'));
  workspaceManager.setPath(resolve(configDir, 'data', 'dynamic-workspaces.json'));
  await workspaceManager.load();

  // Load any dynamic workspaces that were created previously
  for (const info of workspaceManager.listWorkspaces()) {
    if (workspaces.has(info.id)) continue;

    try {
      const ws = await loadWorkspace({ id: info.id, path: info.path }, configDir);
      // Set default agent
      const defaultAgent = agentRegistry.getDefault();
      if (defaultAgent) {
        ws.agent = { ...defaultAgent, scratchpad: ws.agent.scratchpad, heartbeatChecklist: ws.agent.heartbeatChecklist };
      }
      workspaces.set(ws.id, ws);

      // Create session manager and usage tracker for this workspace
      const mgr = new SessionManager({
        sessionsDir: resolve(ws.path, 'sessions'),
        workspaceId: ws.id,
        idleResetMinutes: sessionConfig.idleResetMinutes ?? 30,
        maxTranscriptLines: sessionConfig.maxTranscriptLines ?? 500,
      });
      sessionManagers.set(ws.id, mgr);
      usageTrackers.set(ws.id, new UsageTracker(resolve(ws.path, 'data')));
      modelOverrideStores.set(ws.id, new ModelOverrideStore(resolve(ws.path, 'data')));

      console.log(`[Scooby] Dynamic workspace loaded: ${ws.id} (${ws.agent.name})`);
    } catch (err) {
      console.error(`[Scooby] Failed to load dynamic workspace ${info.id}:`, err);
    }
  }

  // Helper to initialize a newly created workspace
  const initializeWorkspace = async (workspaceId: string, workspacePath: string) => {
    const ws = await loadWorkspace({ id: workspaceId, path: workspacePath }, configDir);
    // Set default agent
    const defaultAgent = agentRegistry.getDefault();
    if (defaultAgent) {
      ws.agent = { ...defaultAgent, scratchpad: ws.agent.scratchpad, heartbeatChecklist: ws.agent.heartbeatChecklist };
    }
    workspaces.set(ws.id, ws);

    const mgr = new SessionManager({
      sessionsDir: resolve(ws.path, 'sessions'),
      workspaceId: ws.id,
      idleResetMinutes: sessionConfig.idleResetMinutes ?? 30,
      maxTranscriptLines: sessionConfig.maxTranscriptLines ?? 500,
    });
    sessionManagers.set(ws.id, mgr);
    usageTrackers.set(ws.id, new UsageTracker(resolve(ws.path, 'data')));
    modelOverrideStores.set(ws.id, new ModelOverrideStore(resolve(ws.path, 'data')));

    mgr.onArchive((sid, wid) => {
      summarizeSession(sid, wid, mgr).catch((err) => {
        console.error(`[Scooby] Summarization error:`, err);
      });
    });

    return ws;
  };

  // Helper to build a createWorkspace callback for command contexts
  const makeCreateWorkspace = (channelType: string, conversationId: string) => {
    return async (name: string, options?: { description?: string }) => {
      const info = await workspaceManager.createWorkspace(name, {
        channelType,
        conversationId,
      }, options);
      await initializeWorkspace(info.id, info.path);
      const code = codeManager.generate(info.id);
      return { workspaceId: info.id, code };
    };
  };

  console.log('[Scooby] Command processor initialized');

  // ── Agent resolution helper ───────────────────────────────────────
  /**
   * Resolve which agent should handle a message for a given session.
   * Priority: session.agentId > emoji detection > workspace default > router > fallback
   */
  async function resolveAgent(
    session: import('@scooby/core').SessionMetadata,
    userMessage: string,
    wsConfig: typeof config.workspaces[0],
    sessionMgr: SessionManager,
  ): Promise<{ agent: AgentProfile; agentId: string; isNew: boolean }> {
    // 1. Session already has an agent assigned
    if (session.agentId && agentRegistry.has(session.agentId)) {
      return { agent: agentRegistry.get(session.agentId)!, agentId: session.agentId, isNew: false };
    }

    // 2. Emoji detection in user message
    const emojiMatch = agentRegistry.matchEmoji(userMessage);
    if (emojiMatch) {
      await sessionMgr.setAgentId(session.id, emojiMatch);
      return { agent: agentRegistry.get(emojiMatch)!, agentId: emojiMatch, isNew: true };
    }

    // 3. Workspace default agent
    if (wsConfig.defaultAgent && agentRegistry.has(wsConfig.defaultAgent)) {
      // Don't route, use workspace default — but only if no routing configured
      if (!config.routing) {
        await sessionMgr.setAgentId(session.id, wsConfig.defaultAgent);
        return { agent: agentRegistry.get(wsConfig.defaultAgent)!, agentId: wsConfig.defaultAgent, isNew: true };
      }
    }

    // 4. Router model selects agent
    try {
      const routedId = await agentRouter.route(userMessage);
      await sessionMgr.setAgentId(session.id, routedId);
      return { agent: agentRegistry.get(routedId)!, agentId: routedId, isNew: true };
    } catch (err) {
      console.error('[Scooby] Agent routing failed:', err);
    }

    // 5. Fallback to default
    const defaultId = agentRegistry.getDefaultId();
    await sessionMgr.setAgentId(session.id, defaultId);
    return { agent: agentRegistry.getDefault(), agentId: defaultId, isNew: true };
  }

  // Helper to build available agents list for prompt builder
  function getAvailableAgentsForPrompt() {
    return agentRegistry.listEntries().map(([id, a]) => ({
      id,
      name: a.name,
      emoji: a.emoji,
      about: a.about ?? '',
    }));
  }

  // Helper to build a setSessionAgent callback
  function makeSetSessionAgent(sessionId: string, workspaceId: string) {
    return async (agentId: string) => {
      const sessionMgr = sessionManagers.get(workspaceId);
      if (sessionMgr) {
        await sessionMgr.setAgentId(sessionId, agentId);
      }
    };
  }

  // Helper to build agent-aware ToolContext
  function buildToolContext(
    ws: Workspace,
    sessionId: string,
    workspaceId: string,
    channelType?: string,
    conversationId?: string,
  ): ToolContext {
    const memProvider = memoryProviders.get(workspaceId);
    return {
      workspace: { id: ws.id, path: ws.path },
      session: { id: sessionId, workspaceId },
      permissions: ws.permissions,
      conversation: channelType && conversationId ? { channelType, conversationId } : undefined,
      sendMessage,
      memoryService: memoryServices.get(workspaceId),
      memoryProvider: memProvider,
      citationsEnabled: resolveCitations(config.memory, memProvider?.backendName ?? 'builtin'),
      cronScheduler: cronSchedulers.get(workspaceId),
      agentRegistry,
      setSessionAgent: makeSetSessionAgent(sessionId, workspaceId),
    };
  }

  // Helper to build command context with agent fields
  function buildCommandAgentFields(sessionId: string, workspaceId: string, currentAgentId?: string) {
    return {
      agentRegistry: {
        get: (id: string) => agentRegistry.get(id),
        list: () => agentRegistry.list(),
        findByName: (name: string) => agentRegistry.findByName(name),
      },
      setSessionAgent: makeSetSessionAgent(sessionId, workspaceId),
      currentAgentId,
    };
  }

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
  router.setBindingsPath(resolve(configDir, 'data', 'channel-bindings.json'));
  await router.loadBindings();

  // 9. Send message function for tools
  const sendMessage = async (channelType: string, msg: OutboundMessage) => {
    for (const adapter of channelAdapters) {
      if (adapter.type === channelType) {
        const prepared = prepareOutboundText(msg.text, msg.format, adapter.outputFormat);
        await adapter.send({ ...msg, text: prepared.text, format: prepared.format });
        return;
      }
    }
  };

  // 9b. Pending clarification system for Daphne voice agent
  const pendingClarifications = new Map<string, {
    resolve: (response: string) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  function clarificationKey(channelType: string, conversationId: string) {
    return `${channelType}:${conversationId}`;
  }

  const askChannelUser = async (params: {
    channelType: string;
    conversationId: string;
    question: string;
    timeoutMs?: number;
  }): Promise<string> => {
    const { channelType, conversationId, question, timeoutMs = 120_000 } = params;

    // Send the question to the channel
    await sendMessage(channelType, {
      conversationId,
      text: question,
      format: 'markdown',
    });

    // Wait for response
    const key = clarificationKey(channelType, conversationId);
    return new Promise<string>((resolve) => {
      const timeout = setTimeout(() => {
        pendingClarifications.delete(key);
        resolve('No response received within the timeout period. Please proceed with your best judgment.');
      }, timeoutMs);

      pendingClarifications.set(key, { resolve, timeout });
    });
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
      handlePhoneCallWebhook: async (body: any) => {
        const eventType = body.type;
        const payload = body.data ?? body;

        if (eventType === 'call_initiation_failure') {
          console.warn(`[Scooby] Phone call webhook: call initiation failed`, payload);
          return { ok: true };
        }

        const conversationId = payload.conversation_id;
        if (!conversationId) {
          return { ok: false };
        }

        const callInfo = activeCallRegistry.get(conversationId);
        if (!callInfo) {
          console.warn(`[Scooby] Phone call webhook: unknown conversation ${conversationId}`);
          return { ok: false };
        }

        const sessionMgr = sessionManagers.get(callInfo.workspaceId);
        if (!sessionMgr) {
          return { ok: false };
        }

        // Build summary from webhook payload
        const status = payload.status ?? 'unknown';
        const duration = payload.metadata?.call_duration_secs;
        const transcript = payload.transcript as Array<{ role: string; message: string }> | undefined;
        const analysis = payload.analysis as { transcript_summary?: string; call_successful?: string } | undefined;

        const lines: string[] = [
          '[Phone Call Result]',
          `Call to ${callInfo.phoneNumber} completed.`,
          `Status: ${status}`,
        ];
        if (duration != null) {
          lines.push(`Duration: ${duration}s`);
        }
        if (analysis?.call_successful) {
          lines.push(`Outcome: ${analysis.call_successful}`);
        }
        if (analysis?.transcript_summary) {
          lines.push(`Summary: ${analysis.transcript_summary}`);
        }
        if (transcript && transcript.length > 0) {
          lines.push('Transcript:');
          for (const turn of transcript) {
            lines.push(`  ${turn.role}: ${turn.message}`);
          }
        }

        await sessionMgr.appendTranscript(callInfo.sessionId, {
          timestamp: new Date().toISOString(),
          role: 'user',
          content: lines.join('\n'),
        });

        // Clean up registry entry
        activeCallRegistry.delete(conversationId);

        console.log(`[Scooby] Phone call webhook: injected result for conversation ${conversationId}`);
        return { ok: true };
      },
    },
  );

  // Mount chat completions endpoint if enabled
  if (config.gateway?.http?.endpoints?.chatCompletions?.enabled) {
    const chatApi = createChatCompletionsApi({
      authToken: config.gateway?.auth?.token,
      listWorkspaceIds: () => Array.from(workspaces.keys()),
      getWorkspace: async (id) => {
        const ws = workspaces.get(id);
        if (!ws) return null;
        return { id: ws.id, path: ws.path, agent: ws.agent, permissions: ws.permissions };
      },
      getSessionManager: (id) => sessionManagers.get(id)!,
      getMemoryProvider: (id) => memoryProviders.get(id),
      getMemoryService: (id) => memoryServices.get(id),
      createAgentRunner: (_id) => new AgentRunner(toolRegistry, cooldowns, sessionManagers.get(_id)!),
      getToolContext: (workspaceId, sessionId) => {
        const ws = workspaces.get(workspaceId)!;
        return buildToolContext(ws, sessionId, workspaceId, 'api', sessionId);
      },
      getGlobalModels: () => ({
        fast: config.models.fast.candidates,
        slow: config.models.slow.candidates,
      }),
      getUsageTracker: (id) => usageTrackers.get(id),
      getModelOverrideStore: (id) => modelOverrideStores.get(id),
      resolveCitations: (workspaceId) => {
        const memProvider = memoryProviders.get(workspaceId);
        return resolveCitations(config.memory, memProvider?.backendName ?? 'builtin');
      },
      askChannelUser,
    });
    gateway.getApp().route('/', chatApi);
    console.log('[Scooby] Chat Completions endpoint enabled at /v1/chat/completions');
  }

  // Register WebSocket method handlers
  gateway.registerMethod('chat.send', async (connectionId, params) => {
    const { workspaceId, text } = params as { workspaceId: string; text: string };
    const ws = workspaces.get(workspaceId);
    if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);

    const sessionMgr = sessionManagers.get(workspaceId)!;
    const session = await sessionMgr.getOrCreate('webchat', connectionId);

    // Bind connection to workspace
    gateway.getConnections().bindWorkspace(connectionId, workspaceId, session.id);

    // Resolve agent for this session
    const wsConfig = config.workspaces.find(w => w.id === workspaceId) ?? config.workspaces[0];
    const { agent: resolvedAgent, agentId } = await resolveAgent(session, text, wsConfig, sessionMgr);

    // Try to handle as a slash command
    const cmdResult = await commandProcessor.tryHandle({
      message: {
        channelType: 'webchat',
        conversationId: connectionId,
        senderId: connectionId,
        senderName: 'User',
        text,
        timestamp: new Date(),
      },
      workspace: ws,
      session,
      sessionManager: sessionMgr,
      config,
      globalModels: {
        fast: config.models.fast.candidates,
        slow: config.models.slow.candidates,
      },
      modelOverrideStore: modelOverrideStores.get(workspaceId),
      ...buildCommandAgentFields(session.id, workspaceId, agentId),
      sendReply: async (replyText: string, format?: 'text' | 'markdown') => {
        gateway.sendEvent(connectionId, 'chat.done', {
          type: 'done',
          response: replyText,
          usage: { promptTokens: 0, completionTokens: 0 },
        });
      },
      sendAttachment: async (attachment) => {
        await webChatAdapter.send({
          conversationId: connectionId,
          text: attachment.caption ?? '',
          attachments: [attachment],
        });
      },
      getUsageSummary: async (days?: number) => {
        return loadUsageSummary(resolve(ws.path, 'data'), { days });
      },
      getSkills: async () => {
        return loadSkills(ws.path);
      },
      generateWorkspaceCode: () => {
        return codeManager.generate(workspaceId);
      },
      searchMemory: memoryProviders.get(workspaceId) ? async (query: string) => {
        const provider = memoryProviders.get(workspaceId)!;
        const results = await provider.search(workspaceId, query);
        return results.map((r) => ({ source: r.source, content: r.content, score: r.score }));
      } : undefined,
      addMemory: memoryProviders.get(workspaceId) ? async (text: string) => {
        const provider = memoryProviders.get(workspaceId)!;
        return provider.index(workspaceId, `user-note:${Date.now()}`, text);
      } : undefined,
      clearMemory: memoryProviders.get(workspaceId) ? async () => {
        const provider = memoryProviders.get(workspaceId)!;
        provider.deleteBySourcePrefix(workspaceId, 'user-note:');
      } : undefined,
      createWorkspace: makeCreateWorkspace('webchat', connectionId),
      getAccessibleWorkspaces: async (): Promise<WorkspaceInfo[]> => {
        const accessibleIds = channelAccess.getAccessibleWorkspaces('webchat', connectionId);
        const result: WorkspaceInfo[] = [];
        for (const [id, wsItem] of workspaces) {
          const hasAccess = accessibleIds.includes(id);
          result.push({
            id,
            name: wsItem.agent.name,
            emoji: wsItem.agent.emoji,
            hasAccess,
            isCurrentlyConnected: id === workspaceId,
          });
        }
        return result;
      },
      switchWorkspace: async (codeOrId: string): Promise<boolean> => {
        if (/^\d{6}$/.test(codeOrId)) {
          const targetWorkspaceId = codeManager.validate(codeOrId);
          if (!targetWorkspaceId) return false;
          await channelAccess.grantAccess('webchat', connectionId, targetWorkspaceId);
          return true;
        }
        return workspaces.has(codeOrId);
      },
    });

    if (cmdResult?.handled) {
      return { sessionId: session.id, command: true };
    }

    // Pre-compaction memory flush
    if (
      (memoryServices.has(workspaceId) || memoryProviders.has(workspaceId)) &&
      sessionMgr.shouldFlush(session.id, session.messageCount)
    ) {
      await performMemoryFlush(workspaceId, session.id, sessionMgr, resolvedAgent);
    }

    // Record user message
    await sessionMgr.appendTranscript(session.id, {
      timestamp: new Date().toISOString(),
      role: 'user',
      content: text,
    });

    // Run agent
    const agentRunner = new AgentRunner(toolRegistry, cooldowns, sessionMgr);
    const transcript = await sessionMgr.getTranscript(session.id);
    const messages = await transcriptToMessages(transcript);

    // Get memory context
    const memProvider = memoryProviders.get(workspaceId);
    const memoryContext = memProvider && text
      ? await memProvider.getContextForPrompt(workspaceId, text) : [];

    const toolCtx = buildToolContext(ws, session.id, workspaceId, 'webchat', connectionId);

    // Stream response back via WebSocket
    const stream = agentRunner.run({
      messages,
      workspaceId,
      workspacePath: ws.path,
      agent: resolvedAgent,
      sessionId: session.id,
      toolContext: toolCtx,
      globalModels: {
        fast: config.models.fast.candidates,
        slow: config.models.slow.candidates,
      },
      workspaceModels: await getWorkspaceModels(workspaceId),
      memoryContext,
      usageTracker: usageTrackers.get(workspaceId),
      agentName: resolvedAgent.name,
      channelType: 'webchat',
      availableAgents: getAvailableAgentsForPrompt(),
      citationsEnabled: resolveCitations(config.memory, memProvider?.backendName ?? 'builtin'),
      memoryBackend: memProvider?.backendName,
    });

    // Process stream events and forward to WebSocket
    (async () => {
      let fullResponse = '';
      for await (const event of stream) {
        gateway.sendEvent(connectionId, `chat.${event.type}`, event);
        if (event.type === 'done') {
          fullResponse = event.response;
        }
      }
      // Debug signature
      if (config.debug && fullResponse) {
        gateway.sendEvent(connectionId, 'chat.debug', {
          agent: `${resolvedAgent.emoji} ${resolvedAgent.name}`,
        });
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
    // Check if this message is a reply to a pending Daphne clarification
    const cKey = clarificationKey(msg.channelType, msg.conversationId);
    const pending = pendingClarifications.get(cKey);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingClarifications.delete(cKey);
      pending.resolve(msg.text);
      return;
    }

    const adapter = channelAdapters.find((a) => a.type === msg.channelType);

    // Check if this channel has an explicit binding
    const hasExplicitBinding = router.hasExplicitBinding(msg.channelType, msg.conversationId);

    // If no explicit binding, check if message is a workspace code
    if (!hasExplicitBinding) {
      const trimmedText = msg.text.trim();

      // Check if message is a 6-digit code
      if (/^\d{6}$/.test(trimmedText)) {
        const workspaceId = codeManager.validate(trimmedText);
        if (workspaceId) {
          // Valid code - bind channel to workspace and grant access
          await router.bindChannel(msg.channelType, msg.conversationId, workspaceId);
          await channelAccess.grantAccess(msg.channelType, msg.conversationId, workspaceId);
          const ws = workspaces.get(workspaceId);
          if (adapter && ws) {
            await adapter.send({
              conversationId: msg.conversationId,
              text: `Connected to workspace "${ws.agent.name}" ${ws.agent.emoji}. You can now start chatting!`,
              format: 'text',
            });
          }
          return;
        } else {
          // Invalid or expired code
          if (adapter) {
            await adapter.send({
              conversationId: msg.conversationId,
              text: 'Invalid or expired code. Please request a new code from an existing channel using /gen-code.',
              format: 'text',
            });
          }
          return;
        }
      }

      // Not a code - prompt for one
      if (adapter) {
        await adapter.send({
          conversationId: msg.conversationId,
          text: 'This channel is not connected to a workspace. Please enter a 6-digit workspace code to connect.\n\nYou can generate a code from an existing channel using /gen-code.',
          format: 'text',
        });
      }
      return;
    }

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

    // Resolve agent for this session
    const wsConfig = config.workspaces.find(w => w.id === workspaceId) ?? config.workspaces[0];
    const { agent: resolvedAgent, agentId } = await resolveAgent(session, msg.text, wsConfig, sessionMgr);

    // Try to handle as a slash command
    const cmdResult = await commandProcessor.tryHandle({
      message: msg,
      workspace: ws,
      session,
      sessionManager: sessionMgr,
      config,
      globalModels: {
        fast: config.models.fast.candidates,
        slow: config.models.slow.candidates,
      },
      modelOverrideStore: modelOverrideStores.get(workspaceId),
      ...buildCommandAgentFields(session.id, workspaceId, agentId),
      sendReply: async (replyText: string, format?: 'text' | 'markdown') => {
        if (adapter) {
          const prepared = prepareOutboundText(replyText, format ?? 'markdown', adapter.outputFormat);
          await adapter.send({
            conversationId: msg.conversationId,
            text: prepared.text,
            format: prepared.format,
          });
        }
      },
      sendAttachment: async (attachment) => {
        if (adapter) {
          await adapter.send({
            conversationId: msg.conversationId,
            text: attachment.caption ?? '',
            attachments: [attachment],
          });
        }
      },
      getUsageSummary: async (days?: number) => {
        return loadUsageSummary(resolve(ws.path, 'data'), { days });
      },
      getSkills: async () => {
        return loadSkills(ws.path);
      },
      generateWorkspaceCode: () => {
        return codeManager.generate(workspaceId);
      },
      searchMemory: memoryProviders.get(workspaceId) ? async (query: string) => {
        const provider = memoryProviders.get(workspaceId)!;
        const results = await provider.search(workspaceId, query);
        return results.map((r) => ({ source: r.source, content: r.content, score: r.score }));
      } : undefined,
      addMemory: memoryProviders.get(workspaceId) ? async (text: string) => {
        const provider = memoryProviders.get(workspaceId)!;
        return provider.index(workspaceId, `user-note:${Date.now()}`, text);
      } : undefined,
      clearMemory: memoryProviders.get(workspaceId) ? async () => {
        const provider = memoryProviders.get(workspaceId)!;
        provider.deleteBySourcePrefix(workspaceId, 'user-note:');
      } : undefined,
      createWorkspace: makeCreateWorkspace(msg.channelType, msg.conversationId),
      getAccessibleWorkspaces: async (): Promise<WorkspaceInfo[]> => {
        const accessibleIds = channelAccess.getAccessibleWorkspaces(msg.channelType, msg.conversationId);
        const currentRoute = router.route(msg);
        const currentWorkspaceId = currentRoute?.workspaceId;

        const result: WorkspaceInfo[] = [];
        for (const [id, ws] of workspaces) {
          const hasAccess = accessibleIds.includes(id);
          result.push({
            id,
            name: ws.agent.name,
            emoji: ws.agent.emoji,
            hasAccess,
            isCurrentlyConnected: id === currentWorkspaceId,
          });
        }
        return result;
      },
      switchWorkspace: async (codeOrId: string): Promise<boolean> => {
        // Check if it's a 6-digit code
        if (/^\d{6}$/.test(codeOrId)) {
          const targetWorkspaceId = codeManager.validate(codeOrId);
          if (!targetWorkspaceId) return false;
          await router.bindChannel(msg.channelType, msg.conversationId, targetWorkspaceId);
          await channelAccess.grantAccess(msg.channelType, msg.conversationId, targetWorkspaceId);
          const targetWs = workspaces.get(targetWorkspaceId);
          if (adapter && targetWs) {
            const switchText = `Switched to ${targetWs.agent.emoji} **${targetWs.agent.name}**.`;
            const prepared = prepareOutboundText(switchText, 'markdown', adapter.outputFormat);
            await adapter.send({
              conversationId: msg.conversationId,
              text: prepared.text,
              format: prepared.format,
            });
          }
          return true;
        }
        // Otherwise it's a workspace ID - just switch (access already verified by command)
        if (!workspaces.has(codeOrId)) return false;
        await router.bindChannel(msg.channelType, msg.conversationId, codeOrId);
        return true;
      },
    });

    if (cmdResult?.handled) {
      return;
    }

    // Pre-compaction memory flush
    if (
      (memoryServices.has(workspaceId) || memoryProviders.has(workspaceId)) &&
      sessionMgr.shouldFlush(session.id, session.messageCount)
    ) {
      await performMemoryFlush(workspaceId, session.id, sessionMgr, resolvedAgent);
    }

    // Process voice/audio attachments
    let messageContent = msg.text;
    const audioAttachments = (msg.attachments ?? []).filter(
      (a) => a.type === 'voice' || a.type === 'audio'
    );

    for (const attachment of audioAttachments) {
      if (!attachment.localPath) continue;
      try {
        const audioDir = resolve(ws.path, 'data', 'audio');
        await mkdir(audioDir, { recursive: true });
        const fileName = basename(attachment.localPath);
        const destPath = resolve(audioDir, fileName);
        await copyFile(attachment.localPath, destPath);
        // Clean up temp file
        await unlink(attachment.localPath).catch(() => {});
        messageContent += `\n[The user sent a voice message saved to data/audio/${fileName}. Use audio_transcribe tool with filePath "data/audio/${fileName}" to transcribe it, then respond to the transcribed text as if the user had typed it directly. Do not send back a transcribed version of the user's message, just respond like any other message.]`;
      } catch (err) {
        console.error(`[Scooby] Failed to process audio attachment:`, err);
      }
    }

    // Process photo attachments — build multi-part content for vision
    let transcriptContent: string | TranscriptContentPart[] = messageContent;
    const photoAttachments = (msg.attachments ?? []).filter(
      (a) => a.type === 'photo'
    );

    if (photoAttachments.length > 0) {
      const contentParts: TranscriptContentPart[] = [];
      const imageParts: TranscriptContentPart[] = [];

      for (const attachment of photoAttachments) {
        if (!attachment.localPath) continue;
        try {
          const imagesDir = resolve(ws.path, 'data', 'images');
          await mkdir(imagesDir, { recursive: true });
          const fileName = basename(attachment.localPath);
          const destPath = resolve(imagesDir, fileName);
          await copyFile(attachment.localPath, destPath);
          // Clean up temp file
          await unlink(attachment.localPath).catch(() => {});
          imageParts.push({
            type: 'image',
            path: destPath,
            mediaType: attachment.mimeType,
          });
          // Add file path note so tools (image_gen) can reference the file
          messageContent += `\n[Image saved to data/images/${fileName}. For image_gen tool use localPath "data/images/${fileName}".]`;
        } catch (err) {
          console.error(`[Scooby] Failed to process photo attachment:`, err);
        }
      }

      if (imageParts.length > 0) {
        // Text part: caption/text + file path notes
        const caption = messageContent.trim() || 'The user sent an image.';
        contentParts.push({ type: 'text', text: caption });
        contentParts.push(...imageParts);
        transcriptContent = contentParts;
      }
    }

    // Record user message
    await sessionMgr.appendTranscript(session.id, {
      timestamp: new Date().toISOString(),
      role: 'user',
      content: transcriptContent,
    });

    // Get transcript for context
    const transcript = await sessionMgr.getTranscript(session.id);
    const messages = await transcriptToMessages(transcript);

    // Get memory context (with scope enforcement)
    const memProviderForChannel = memoryProviders.get(workspaceId);
    let memoryContext: string[];
    if (memProviderForChannel && config.memory?.qmd?.scope?.dmOnly && msg.channelType !== 'webchat') {
      // Scope enforcement: skip QMD search in group channels, use builtin fallback
      const builtinService = memoryServices.get(workspaceId);
      memoryContext = builtinService && msg.text
        ? await builtinService.getContextForPrompt(workspaceId, msg.text) : [];
    } else {
      memoryContext = memProviderForChannel && msg.text
        ? await memProviderForChannel.getContextForPrompt(workspaceId, msg.text) : [];
    }

    const toolCtx = buildToolContext(ws, session.id, workspaceId, msg.channelType, msg.conversationId);
    const agentRunner = new AgentRunner(toolRegistry, cooldowns, sessionMgr);

    let fullResponse = '';
    for await (const event of agentRunner.run({
      messages,
      workspaceId,
      workspacePath: ws.path,
      agent: resolvedAgent,
      sessionId: session.id,
      toolContext: toolCtx,
      globalModels: {
        fast: config.models.fast.candidates,
        slow: config.models.slow.candidates,
      },
      workspaceModels: await getWorkspaceModels(workspaceId),
      memoryContext,
      usageTracker: usageTrackers.get(workspaceId),
      agentName: resolvedAgent.name,
      channelType: msg.channelType,
      citationsEnabled: resolveCitations(config.memory, memProviderForChannel?.backendName ?? 'builtin'),
      memoryBackend: memProviderForChannel?.backendName,
      availableAgents: getAvailableAgentsForPrompt(),
    })) {
      if (event.type === 'done') {
        fullResponse = event.response;
      }
    }

    // Send response back through channel
    if (fullResponse) {
      // Debug signature
      if (config.debug) {
        fullResponse += `\n\n--- ${resolvedAgent.emoji} ${resolvedAgent.name}`;
      }

      const adapter = channelAdapters.find((a) => a.type === msg.channelType);
      if (adapter) {
        const prepared = prepareOutboundText(fullResponse, 'markdown', adapter.outputFormat);
        await adapter.send({
          conversationId: msg.conversationId,
          text: prepared.text,
          format: prepared.format,
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

  // 12. Per-workspace cron schedulers
  const cronSchedulers = new Map<string, WorkspaceCronScheduler>();

  for (const [id, ws] of workspaces) {
    const scheduler = new WorkspaceCronScheduler(id, resolve(ws.path, 'data'));

    scheduler.onJob(async (job, workspaceId) => {
      const wsForJob = workspaces.get(workspaceId);
      if (!wsForJob) return { response: '', sessionId: '' };

      const sessionMgr = sessionManagers.get(workspaceId)!;
      const session = await sessionMgr.getOrCreate('cron', `cron:${job.id}`);

      // Use workspace default agent for cron jobs
      const cronAgent = wsForJob.agent;

      const toolCtx = buildToolContext(wsForJob, session.id, workspaceId);

      const agentRunner = new AgentRunner(toolRegistry, cooldowns, sessionMgr);
      let response = '';
      for await (const event of agentRunner.run({
        messages: [{ role: 'user', content: job.prompt }],
        workspaceId,
        workspacePath: wsForJob.path,
        agent: cronAgent,
        sessionId: session.id,
        toolContext: toolCtx,
        globalModels: {
          fast: config.models.fast.candidates,
          slow: config.models.slow.candidates,
        },
        workspaceModels: await getWorkspaceModels(workspaceId),
        usageTracker: usageTrackers.get(workspaceId),
        agentName: cronAgent.name,
        channelType: 'cron',
        citationsEnabled: resolveCitations(config.memory, memoryProviders.get(workspaceId)?.backendName ?? 'builtin'),
        memoryBackend: memoryProviders.get(workspaceId)?.backendName,
      })) {
        if (event.type === 'done') {
          response = event.response;
        }
      }

      // Delivery routing
      if (response && job.delivery) {
        await sendMessage(job.delivery.channel, {
          conversationId: job.delivery.conversationId,
          text: response,
          format: 'markdown',
        });
      }

      console.log(`[Cron] Job "${job.id}" completed for workspace ${workspaceId}`);
      return { response, sessionId: session.id };
    });

    // Buffer config-defined jobs for merge at start()
    const wsConfig = config.workspaces.find((w) => w.id === id);
    if (wsConfig?.cron) {
      for (const entry of wsConfig.cron) {
        scheduler.schedule(entry);
      }
    }

    // Load persisted jobs, merge with config, recover missed, arm timer
    await scheduler.start();

    cronSchedulers.set(id, scheduler);
  }

  // 13. Infrastructure heartbeat (idle session sweep)
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

  // 13b. Per-workspace agent heartbeats
  const workspaceHeartbeats: WorkspaceHeartbeat[] = [];
  for (const [id, ws] of workspaces) {
    const hbConfig = ws.config.heartbeat;
    if (!hbConfig?.enabled) continue;

    const hb = new WorkspaceHeartbeat({
      workspaceId: id,
      workspacePath: ws.path,
      config: hbConfig,
      runAgent: async (prompt) => {
        const sessionMgr = sessionManagers.get(id)!;
        const session = await sessionMgr.getOrCreate('heartbeat', `heartbeat:${id}`);

        const toolCtx = buildToolContext(ws, session.id, id);

        const agentRunner = new AgentRunner(toolRegistry, cooldowns, sessionMgr);
        let response = '';
        for await (const event of agentRunner.run({
          messages: [{ role: 'user', content: prompt }],
          workspaceId: id,
          workspacePath: ws.path,
          agent: ws.agent,
          sessionId: session.id,
          toolContext: toolCtx,
          globalModels: {
            fast: config.models.fast.candidates,
            slow: config.models.slow.candidates,
          },
          usageTracker: usageTrackers.get(id),
          agentName: ws.agent.name,
          channelType: 'heartbeat',
        })) {
          if (event.type === 'done') {
            response = event.response;
          }
        }
        return response;
      },
      deliver: async (text) => {
        if (hbConfig.delivery) {
          await sendMessage(hbConfig.delivery.channel, {
            conversationId: hbConfig.delivery.conversationId,
            text,
            format: 'markdown',
          });
        }
      },
    });

    hb.start();
    workspaceHeartbeats.push(hb);
  }

  // 14. Webhook manager
  const webhookManager = new WebhookManager();
  webhookManager.onWebhook(async (workspaceId, payload) => {
    const ws = workspaces.get(workspaceId);
    if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);

    const sessionMgr = sessionManagers.get(workspaceId)!;
    const session = await sessionMgr.getOrCreate('webhook', `webhook:${Date.now()}`);

    const toolCtx = buildToolContext(ws, session.id, workspaceId);

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
      workspaceModels: await getWorkspaceModels(workspaceId),
      usageTracker: usageTrackers.get(workspaceId),
      agentName: ws.agent.name,
      channelType: 'webhook',
      citationsEnabled: resolveCitations(config.memory, memoryProviders.get(workspaceId)?.backendName ?? 'builtin'),
      memoryBackend: memoryProviders.get(workspaceId)?.backendName,
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
    for (const hb of workspaceHeartbeats) hb.stop();
    for (const [, scheduler] of cronSchedulers) scheduler.stopAll();
    messageQueue.dispose();

    for (const adapter of channelAdapters) {
      await adapter.stop();
    }

    await gateway.stop();

    for (const provider of memoryProviders.values()) {
      provider.close();
    }

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
