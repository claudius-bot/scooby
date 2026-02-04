# Scooby Bot Architecture

The bot app (`apps/bot/src/index.ts`) is the main process that wires together every subsystem in Scooby. It runs a single `main()` function that performs 16 sequential initialization steps, then listens for signals to shut down cleanly.

The two source files are:

- `src/index.ts` -- orchestration entry point (everything below)
- `src/router.ts` -- `MessageRouter` class that maps an inbound message to a workspace ID based on channel type and conversation metadata

---

## Startup sequence

### Step 1 -- Load config

```ts
const config = await loadConfig(configPath);
```

Reads `scooby.config.json5` from the project root. This file defines workspaces, model candidates, channel settings, gateway host/port, cron jobs, and heartbeat intervals. Everything downstream depends on this config object.

### Step 2 -- Load workspaces

```ts
for (const wsConfig of config.workspaces) {
  const ws = await loadWorkspace(wsConfig, configDir);
  workspaces.set(ws.id, ws);
}
```

Each workspace is an isolated agent environment with its own directory on disk, agent persona (name, vibe, emoji, avatar), system prompt, permissions, and data directories. Workspaces are stored in a `Map<string, Workspace>` keyed by ID so every other subsystem can look them up.

### Step 3 -- Provider cooldown tracker

```ts
const cooldowns = new CooldownTracker();
```

Tracks rate-limit cooldowns across LLM providers. When a provider returns a 429 or similar, `CooldownTracker` records the backoff period so the `AgentRunner` can skip that provider and try the next candidate in the model list. Shared across all workspaces because provider rate limits are account-global, not per-workspace.

### Step 4 -- Memory services

```ts
const memService = new MemoryService({ dbPath, embeddingConfig });
await memService.reindex(id, memoryDir);
```

Each workspace gets its own `MemoryService` instance backed by a SQLite database at `<workspace>/data/memory.db`. On startup it indexes markdown files from `<workspace>/memory/` into vector embeddings. During a conversation, the agent can retrieve relevant memory chunks to include as context. This step is skipped entirely if no embedding model is configured.

### Step 5 -- Session managers

```ts
const mgr = new SessionManager({
  sessionsDir: resolve(ws.path, 'sessions'),
  workspaceId: id,
  idleResetMinutes: 30,
  maxTranscriptLines: 500,
});
```

One `SessionManager` per workspace. Sessions group a sequence of messages from a single user/channel into a conversation. The manager handles:

- Creating or resuming sessions (`getOrCreate`)
- Persisting transcript lines to disk
- Enforcing a maximum transcript length
- Archiving sessions that have been idle beyond the configured timeout

### Step 5b -- Usage trackers

```ts
usageTrackers.set(id, new UsageTracker(resolve(ws.path, 'data')));
```

Per-workspace token/cost tracking. The `AgentRunner` reports usage after each LLM call, and the tracker writes it to disk. The gateway exposes this data via `GET /api/workspaces/:id/usage`.

### Step 6 -- Tool registry

```ts
const toolRegistry = new ToolRegistry();
toolRegistry.register(shellExecTool);
toolRegistry.register(fileReadTool);
// ...11 tools total
```

A shared registry of all tools the agent can invoke during a conversation. Each tool is a function the LLM can call (via tool-use / function-calling). The full set:

| Tool | Purpose |
|------|---------|
| `shellExecTool` | Run shell commands in the workspace directory |
| `fileReadTool` | Read a file from the workspace |
| `fileWriteTool` | Write/create a file |
| `fileEditTool` | Apply edits to an existing file |
| `browserTool` | Navigate and interact with web pages |
| `sendMessageTool` | Send a message through a channel adapter |
| `memorySearchTool` | Search the workspace's memory embeddings |
| `webSearchTool` | Perform a web search |
| `webFetchTool` | Fetch a URL and return its content |
| `imageGenTool` | Generate an image |
| `audioTranscribeTool` | Transcribe audio to text |

The registry is shared across workspaces -- tools are stateless, and workspace-specific context (paths, permissions) is passed via `ToolContext` at call time.

### Step 7 -- Channel adapters

```ts
const channelAdapters: ChannelAdapter[] = [];
// conditionally add TelegramAdapter, WebChatAdapter
```

Channel adapters abstract over messaging platforms. Each adapter implements the `ChannelAdapter` interface:

- `onMessage(callback)` -- receive inbound messages
- `send(msg)` -- send an outbound message
- `start()` / `stop()` -- lifecycle

**Telegram** is only initialized if a valid bot token is present in the config (and isn't an unresolved `${ENV_VAR}` placeholder). **WebChat** is initialized if `config.channels.webchat.enabled` is true. Both feed into the same message pipeline.

### Step 8 -- Message router

```ts
const router = new MessageRouter(config);
```

The `MessageRouter` decides which workspace should handle an inbound message. Routing logic:

- **Telegram**: looks up the chat ID in a map built from workspace configs (each workspace can list which Telegram chats it handles)
- **WebChat**: parses the workspace ID out of the conversation ID (format is `workspaceId:sessionId`)
- **Fallback**: routes to the first workspace defined in the config

Returns `null` if no route can be determined, in which case the message is logged and dropped.

### Step 9 -- Send message function

```ts
const sendMessage = async (channelType: string, msg: OutboundMessage) => { ... };
```

A closure passed into `ToolContext` so tools (specifically `sendMessageTool`) can send messages back through any channel adapter. It finds the adapter matching the requested channel type and calls `adapter.send()`.

### Step 10 -- Gateway server

```ts
const gateway = new GatewayServer(
  { host, port, wsPath },
  { listWorkspaces, getWorkspace, listSessions, getTranscript, handleWebhook, getUsage },
);
```

The gateway provides two interfaces:

1. **REST API** (Hono) -- endpoints for the web dashboard to list workspaces, view sessions, fetch transcripts, check usage, and receive webhooks.
2. **WebSocket** (JSON-RPC protocol via `ws`) -- real-time bidirectional communication for the web chat UI.

The second argument is an `ApiContext` object -- a set of callback functions that the gateway calls to serve REST requests. This keeps the gateway package decoupled from bot-level state.

#### WebSocket method handlers

Five RPC methods are registered on the gateway:

| Method | What it does |
|--------|--------------|
| `chat.send` | Accepts `{ workspaceId, text }`, creates/resumes a session, runs the agent, and streams response events (`chat.text-delta`, `chat.tool-call`, `chat.done`, etc.) back over the WebSocket |
| `chat.history` | Returns the transcript for a given session |
| `session.list` | Lists all sessions in a workspace |
| `workspace.list` | Lists all workspaces with agent metadata |
| `workspace.get` | Returns a single workspace's details |

The `chat.send` handler is the most involved -- it records the user message, builds the full message history, retrieves relevant memory, constructs a `ToolContext`, and kicks off an `AgentRunner.run()` stream. The stream is consumed in a detached async IIFE so the RPC call can return the session ID immediately while events continue to flow.

### Step 11 -- Channel message pipeline

```ts
const messageQueue = new MessageQueue({ debounceMs: 500 });
messageQueue.onFlush(async (msg: InboundMessage) => { ... });
```

Messages from channel adapters flow through a debouncing queue (500ms). This batches rapid-fire messages from a user into a single flush. On flush:

1. The `MessageRouter` determines which workspace handles the message
2. A session is created or resumed
3. The user message is recorded to the transcript
4. The full transcript is loaded as conversation context
5. Relevant memory chunks are retrieved
6. The `AgentRunner` runs with all context, consuming the full stream
7. The final response is sent back through the originating channel adapter

This is the primary path for Telegram and WebChat messages. It differs from the WebSocket path (step 10) in that it collects the full response and sends it as a single message rather than streaming deltas.

### Step 12 -- Cron scheduler

```ts
const cronScheduler = new CronScheduler(resolve(configDir, 'data'));
cronScheduler.onJob(async (job) => { ... });
```

Scheduled jobs defined in the config. Each job specifies a workspace, a cron expression, and a prompt. When a job fires, it creates a session tagged with `cron:${job.id}`, runs the agent with the job's prompt, and consumes the stream (output isn't sent anywhere -- cron jobs are fire-and-forget side-effect tasks).

### Step 13 -- Heartbeat

```ts
const heartbeat = new Heartbeat({ intervalMinutes: 5 });
heartbeat.registerTask('idle-session-sweep', async () => { ... });
```

A periodic background task runner. Currently has one registered task: sweeping idle sessions. Every 5 minutes (configurable), it iterates all session managers and archives sessions that have exceeded the idle timeout. This prevents unbounded session growth.

### Step 14 -- Webhook manager

```ts
const webhookManager = new WebhookManager();
webhookManager.onWebhook(async (workspaceId, payload) => { ... });
```

Handles external webhook triggers (via `POST /api/webhook/:workspaceId`). When a webhook arrives:

1. A new session is created tagged with `webhook:<timestamp>`
2. The agent runs with the webhook payload's prompt
3. The final response is returned in the HTTP response body

This enables external systems (CI, monitoring, etc.) to trigger agent actions.

### Step 15 -- Start everything

```ts
await gateway.start();         // HTTP + WebSocket server
for (adapter of channelAdapters) await adapter.start();  // Telegram polling, etc.
heartbeat.start();             // Background task timer
```

Services are started in dependency order: the gateway first (so it can accept connections), then channel adapters (which may immediately start receiving messages), then the heartbeat timer.

### Step 16 -- Graceful shutdown

```ts
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

On `SIGINT` or `SIGTERM`, shutdown proceeds in reverse dependency order:

1. Stop heartbeat and cron (no new background work)
2. Dispose message queue (no new messages processed)
3. Stop channel adapters (disconnect from Telegram, etc.)
4. Stop gateway (close HTTP server and all WebSocket connections)
5. Close memory service databases (flush SQLite)

Then `process.exit(0)`.

---

## Data flow

```
Inbound:
  Telegram  --> TelegramAdapter --\
  WebChat   --> WebChatAdapter  ---+--> MessageQueue --> MessageRouter --> AgentRunner
  WebSocket --> Gateway RPC (chat.send) ---------------------------->  AgentRunner
  Cron      --> CronScheduler ----------------------------------------> AgentRunner
  Webhook   --> WebhookManager ----------------------------------------> AgentRunner

AgentRunner:
  Messages + Memory + Tools + Models --> LLM stream --> events

Outbound:
  Channel messages: AgentRunner --> ChannelAdapter.send()
  WebSocket:        AgentRunner --> Gateway.sendEvent() (streamed deltas)
  Webhook:          AgentRunner --> HTTP response body
```
