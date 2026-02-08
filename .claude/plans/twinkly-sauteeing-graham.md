# Chat Page — Full Implementation Plan

## Context

The app needs a production-grade chat page at `/chat`. Existing infrastructure includes: a `WsClient` with JSON-RPC, a `useChat` hook with streaming support, basic chat components (dark-themed), REST + WebSocket APIs for sessions/transcripts, and React Query hooks for data fetching. The existing components are functional but minimal and dark-themed. This plan replaces them with a Claude.ai-quality light-themed chat experience.

---

## Architecture

```
chat/page.tsx (nuqs URL state, workspace selection, layout)
├── ChatSidebar (280px, session list with time grouping)
│   ├── NewChatButton
│   └── SessionRow[] (grouped: Today / Yesterday / Older)
└── ChatMain (flex-1, message thread + input)
    ├── ChatHeader (connection status dot + model indicator)
    ├── MessageThread (smart scroll container)
    │   ├── ChatEmptyState (greeting when no messages)
    │   ├── ChatMessage[] (markdown-rendered, grouped by role)
    │   │   ├── MarkdownRenderer (react-markdown + remark-gfm)
    │   │   └── StreamingCursor (blinking cursor / bouncing dots)
    │   ├── ToolCallCard (light-themed expandable card)
    │   └── ScrollToBottomButton (floating, shows when scrolled up)
    └── ChatInputArea (focal point)
        ├── AgentSelector (cmdk popover — emoji + name chip)
        ├── AutoExpandTextarea (Enter=send, Shift+Enter=newline)
        ├── FileUploadButton (Paperclip icon, hidden file input)
        ├── TTSButton (Web Speech API on last assistant msg)
        └── SendButton (circular accent-600, ArrowUp icon)
```

---

## Step 1: Enhanced Chat Hook — `apps/web/hooks/useChatSession.ts`

Replace the existing `useChat` hook with a session-aware state machine using `useReducer`.

**State:** `{ status, messages, currentSessionId, modelGroup, error }`

- `status`: `'idle' | 'loading' | 'ready' | 'streaming' | 'error'`

**Actions:** `SELECT_SESSION`, `SESSION_LOADED`, `NEW_CONVERSATION`, `SEND_MESSAGE`, `STREAMING_START`, `TEXT_DELTA`, `TOOL_CALL`, `TOOL_RESULT`, `MODEL_SWITCH`, `STREAM_DONE`, `STREAM_ERROR`

**Key behaviors:**

- `selectSession(id)` — fetches transcript via WS `chat.history` method, converts `TranscriptEntry[]` → `ChatMessage[]`, dispatches `SESSION_LOADED`
- `sendMessage(text)` — appends user msg + streaming placeholder, calls WS `chat.send`. The `chat.send` response returns `{ sessionId }` which is captured. After `chat.done`, invalidates session list query so sidebar refreshes
- `newConversation()` — resets to `idle` state, clears messages and sessionId
- Uses `useWebSocket` hook for WS connection (same pattern as existing)
- Uses `streamingRef` for accumulating text-delta content (existing pattern)
- WebSocket event listeners: `chat.text-delta`, `chat.tool-call`, `chat.tool-result`, `chat.model-switch`, `chat.done`, `chat.error`

**Interface:**

```typescript
useChatSession({ workspaceId, agentId? }) → {
  messages, state, modelGroup, connectionStatus, currentSessionId, error,
  sendMessage, selectSession, newConversation, retry
}
```

**Reuse:** `useWebSocket` hook, `WsClient` class — unchanged.

---

## Step 2: Chat Page — `apps/web/app/(dashboard)/chat/page.tsx`

Full-viewport layout below TopNav: `h-[calc(100vh-3.5rem)]` with sidebar + main.

**URL state via nuqs:**

- `useQueryState('session', parseAsString.withDefault(''))` — selected session ID
- `useQueryState('workspace', parseAsString.withDefault(''))` — workspace ID

**Data fetching:**

- `useGateway.workspaces.list()` — for workspace selection (auto-select first)
- `useGateway.sessions.list({ workspaceId })` — for sidebar session list
- `useGateway.agents.list()` — for agent selector in input area
- `useChatSession({ workspaceId })` — the main chat hook

**Layout:** `flex h-full` → `ChatSidebar` (w-[280px]) + `ChatMain` (flex-1)

**Loading/empty states:** Skeleton sidebar + centered spinner, empty state when no workspaces.

---

## Step 3: Chat Sidebar — `apps/web/features/chat/components/chat-sidebar.tsx`

**Width:** 280px, `bg-neutral-50 border-r border-neutral-200 overflow-y-auto`

**Header:** "New Chat" button (accent bg, `Plus` icon) spanning full width

**Session list:**

- Sessions from `useGateway.sessions.list({ workspaceId })`, sorted by `lastActiveAt` desc
- Grouped by date using `date-fns`: "Today", "Yesterday", "Previous 7 Days", "Older"
- Group headers: `text-[11px] font-semibold text-neutral-400 uppercase tracking-wider`

**SessionRow:** Clickable button, shows:

- First line: session conversationId or "New conversation" (truncated), `text-[13px] font-medium`
- Second line: relative time (e.g. "2h ago") + message count badge, `text-[11px] text-neutral-400`
- Active state: `bg-white shadow-sm ring-1 ring-accent-500/30` (matches agent card pattern)
- Idle state: `hover:bg-white/50`

**Clicking:** Sets nuqs `session` param, calls `selectSession(id)` from hook

**New Chat button:** Clears nuqs `session` param, calls `newConversation()`

---

## Step 4: Markdown Renderer — `apps/web/features/chat/components/markdown-renderer.tsx`

Uses `react-markdown` v10 + `remark-gfm` v4 (both already in deps).

**Wrapper:** `prose prose-sm prose-neutral max-w-none` with overrides:

- `prose-p:my-1.5 prose-p:leading-relaxed`
- `prose-pre:bg-neutral-50 prose-pre:border prose-pre:border-neutral-200 prose-pre:rounded-lg`
- `prose-code:text-[13px] prose-code:font-[var(--font-mono)]`
- `prose-code:bg-neutral-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded`
- `prose-a:text-accent-600`

**Custom components:**

- `code` — block code gets copy button + language badge in top-right; inline code gets pill styling
- `a` — opens in new tab with `target="_blank"`
- `pre` — `bg-neutral-50 border border-neutral-200 rounded-lg` with `overflow-x-auto`

---

## Step 5: Chat Message — `apps/web/features/chat/components/chat-message.tsx`

Replaces existing `message-bubble.tsx`. Light theme, Claude.ai-inspired design.

**User messages:** Subtle `bg-neutral-100` rounded-2xl, `text-neutral-900`, right-aligned, max-w-[80%], `whitespace-pre-wrap`

**Assistant messages:** No background (flat), left-aligned, full width. Content rendered through `MarkdownRenderer`. Agent avatar (using @/components/avatar component) shown at top-left of first assistant message in a consecutive group.

**Tool messages:** `ToolCallCard` component (light-themed)

**System messages:** Centered pill, `text-[11px] text-neutral-400 bg-neutral-100 rounded-full px-3 py-1`

**Timestamps:** Shown on hover only — `opacity-0 group-hover:opacity-100 transition-opacity text-[11px] text-neutral-400`

**Message grouping:** Consecutive same-role messages: `gap-1` within group, `gap-6` between groups. Only first message in assistant group gets the avatar.

**Streaming:** When `message.streaming && !message.content`, show bouncing dots (3 dots animation). When `message.streaming && message.content`, append blinking cursor after markdown content.

**Model indicator inline:** When `modelGroup === 'slow'`, show `bg-purple-50 text-purple-600 border border-purple-100` pill with `Brain` icon + "Deep thinking" text above the assistant message.

---

## Step 6: Message Thread — `apps/web/features/chat/components/message-thread.tsx`

Scrollable container with smart auto-scroll.

**Smart scroll logic:**

- Track `isNearBottom` via scroll event (threshold: 100px from bottom)
- When `isNearBottom` + new messages → auto-scroll (`behavior: isStreaming ? 'instant' : 'smooth'`)
- When user scrolls up → stop auto-scrolling
- On `sendMessage` → force scroll to bottom
- Use `requestAnimationFrame` to batch scroll updates during streaming

**Scroll-to-bottom button:** Floating `ChevronDown` in circle (`bg-white shadow-md border border-neutral-200 size-8`), appears with `motion` animation when scrolled up + new messages exist. Positioned center-bottom of thread area.

**Container:** `flex-1 overflow-y-auto px-4 py-6`, inner `mx-auto max-w-3xl` for centered content

---

## Step 7: Chat Input Area — `apps/web/features/chat/components/chat-input-area.tsx`

The focal point of the page. Premium, substantial feel.

**Container:** Within `mx-auto max-w-3xl`, a card-like box:

- `bg-white rounded-2xl border border-neutral-200 shadow-sm`
- `focus-within:ring-2 focus-within:ring-accent-500/20 focus-within:border-accent-300` for focus glow

**Layout (vertical):**

1. **Top row:** Agent selector chip (optional, left-aligned inside card padding)
2. **Textarea:** Auto-expanding (1 row → max 200px), borderless, `bg-transparent px-4 py-3 text-sm`, placeholder "Message {agentName}..." or "Send a message..."
3. **Bottom row:** `flex items-center justify-between px-3 pb-2`
   - Left: `FileUploadButton` (Paperclip) + `TTSButton` (Volume2)
   - Right: `SendButton` (circular, accent-600 bg, ArrowUp icon, size-8)

**Agent selector:** Small chip showing `[emoji] AgentName` or `[Sparkles] Auto-route`. Click opens a Popover with Command (cmdk) for searchable agent list. Uses `useGateway.agents.list()`. Selecting sets `agentId` on the hook.

**File upload:** Paperclip icon button → hidden `<input type="file" multiple>`. Selected files shown as preview thumbnails above textarea. For now, UI is built but actual file sending shows a toast "File attachments coming soon" since the `chat.send` WS method doesn't accept attachments yet.

**TTS:** Volume2 icon → uses Web Speech API `speechSynthesis.speak()` on last assistant message. Toggles to VolumeX when speaking. Click to stop.

**Send button:** Disabled when empty or disconnected. During streaming, changes to a square Stop icon.

**Keyboard:** Enter = send, Shift+Enter = newline (preserving existing pattern)

---

## Step 8: Supporting Components

### `chat-empty-state.tsx`

Shown when `status === 'idle'` and no messages. Centered vertically:

- Agent avatar (workspace agent's avatar/emoji, size-16)
- "How can I help you today?" in Outfit font, text-2xl
- Agent's `about` text as subtitle, text-sm text-neutral-400
- 2-3 suggestion chips (rounded-full pills, clickable, pre-fill and send message)

### `tool-call-card.tsx` (rewrite)

Light theme version:

- `bg-neutral-50 border border-neutral-200 rounded-lg`
- Tool name in `font-mono text-[13px]`
- Pending: accent-500 spinner. Done: accent-500 check icon
- Expand/collapse with `motion` for smooth height animation
- Code blocks: `bg-white border border-neutral-100 rounded p-2`

### `connection-status.tsx`

Small dot (6px) in chat header:

- Connected: accent-500 with pulse. Connecting: warning-500. Disconnected: danger-500
- Label on hover via tooltip
- Disconnection triggers sonner toast "Connection lost. Reconnecting..."

### `model-indicator.tsx`

Pill in chat header:

- Fast: `bg-neutral-100 text-neutral-500` with Zap icon
- Slow: `bg-purple-50 text-purple-600 border border-purple-200` with Brain icon

---

## Step 9: Chat Main — `apps/web/features/chat/components/chat-main.tsx`

Assembles everything in the main area:

```tsx
<div className="flex flex-col h-full min-w-0">
  <ChatHeader connectionStatus={...} modelGroup={...} />
  <MessageThread messages={...} isStreaming={...} scrollToBottom={...}>
    {messages.length === 0 && status === 'idle' ? (
      <ChatEmptyState agent={...} onSuggestionClick={sendMessage} />
    ) : (
      messages.map(msg => <ChatMessage key={msg.id} ... />)
    )}
  </MessageThread>
  <div className="shrink-0 px-4 pb-4">
    <ChatInputArea
      onSend={sendMessage}
      isStreaming={isStreaming}
      connectionStatus={connectionStatus}
      agents={agents}
      agentId={agentId}
      onAgentChange={setAgentId}
    />
  </div>
</div>
```

---

## File Change Summary

| File                                                      | Action                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| `apps/web/hooks/useChatSession.ts`                        | Create — session-aware chat hook with useReducer state machine      |
| `apps/web/app/(dashboard)/chat/page.tsx`                  | Create — route page with nuqs, layout, data orchestration           |
| `apps/web/features/chat/components/chat-sidebar.tsx`      | Create — session sidebar with time grouping                         |
| `apps/web/features/chat/components/chat-main.tsx`         | Create — assembles thread + input + header                          |
| `apps/web/features/chat/components/message-thread.tsx`    | Create — scrollable list with smart scroll                          |
| `apps/web/features/chat/components/chat-message.tsx`      | Create — redesigned message rendering (replaces message-bubble.tsx) |
| `apps/web/features/chat/components/markdown-renderer.tsx` | Create — react-markdown with prose styling                          |
| `apps/web/features/chat/components/chat-input-area.tsx`   | Create — premium input with agent selector, upload, TTS             |
| `apps/web/features/chat/components/chat-empty-state.tsx`  | Create — greeting empty state                                       |
| `apps/web/features/chat/components/tool-call-card.tsx`    | Rewrite — light-themed expandable tool card                         |
| `apps/web/features/chat/components/streaming-cursor.tsx`  | Rewrite — bouncing dots + blinking cursor                           |
| `apps/web/features/chat/components/connection-status.tsx` | Create — dot indicator + disconnect toast                           |
| `apps/web/features/chat/components/model-indicator.tsx`   | Create — fast/slow model pill                                       |
| `apps/web/features/chat/components/index.ts`              | Create — barrel exports                                             |

**Existing files preserved (not deleted):**

- `apps/web/hooks/useChat.ts` — kept as-is, new hook is `useChatSession.ts`
- `apps/web/features/chat/components/chat-window.tsx` — kept, superseded by new page
- `apps/web/features/chat/components/chat-input.tsx` — kept, superseded by new input
- `apps/web/features/chat/components/message-bubble.tsx` — kept, superseded by new message

---

## Key Backend Details

- `chat.send` WS method accepts `{ workspaceId, text }`, returns `{ sessionId }` in the response
- `chat.send` does NOT currently accept `agentId` — we'll pass it but the backend ignores it (agent is resolved via router). Future enhancement.
- `chat.history` WS method accepts `{ workspaceId, sessionId, limit }`, returns `{ transcript: TranscriptEntry[] }`
- `session.list` WS method accepts `{ workspaceId }`, returns `{ sessions: SessionMetadata[] }`
- Stream events: `chat.text-delta`, `chat.tool-call`, `chat.tool-result`, `chat.model-switch`, `chat.done`, `chat.error`
- `chat.done` event: `{ type: 'done', response, usage: { promptTokens, completionTokens } }`

---

## Verification

1. `pnpm --filter @scooby/web typecheck` — all new files compile
2. `pnpm --filter @scooby/web build` — pages build successfully
3. Navigate to `/chat` — sidebar shows sessions, empty state in main area
4. Type a message and send — streams response with markdown rendering
5. Click a past session in sidebar — loads transcript
6. Click "New Chat" — clears to empty state
7. Smart scroll: scroll up during streaming, confirm it doesn't force scroll. Click scroll-to-bottom button.
8. Shift+Enter creates newline, Enter sends
9. Agent selector opens searchable popover, selecting changes the chip
10. TTS button speaks last assistant message
11. Connection status dot reflects WS state
