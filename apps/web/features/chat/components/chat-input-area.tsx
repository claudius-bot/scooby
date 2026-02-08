'use client';

import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import { ArrowUp, Square, Paperclip, Volume2, VolumeX, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/avatar';
import { getGatewayUrl } from '@/lib/gateway-config';
import type { AgentDetail } from '@scooby/schemas';
import type { ChatMessageAgent } from '@/hooks/useChatSession';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';

// ── Helpers ─────────────────────────────────────────────────────────────

function resolveAvatarUrl(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  const base = getGatewayUrl();
  return base ? `${base}${path}` : undefined;
}

// ── Agent Selector ──────────────────────────────────────────────────────

interface AgentSelectorProps {
  agents: AgentDetail[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
}

function AgentSelector({ agents, selectedId, onSelect }: AgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = agents.find((a) => a.id === selectedId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
      >
        {selected ? (
          <Avatar src={resolveAvatarUrl(selected.avatar)} name={selected.name} className="size-4" />
        ) : (
          <Sparkles className="size-3.5 text-neutral-400" />
        )}
        <span>{selected?.name ?? 'Auto-route'}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
            <Command>
              <CommandInput placeholder="Search agents..." />
              <CommandList>
                <CommandEmpty>No agents found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      onSelect(undefined);
                      setOpen(false);
                    }}
                  >
                    <Sparkles className="size-4 text-neutral-400" />
                    <span>Auto-route</span>
                  </CommandItem>
                  {agents.map((agent) => (
                    <CommandItem
                      key={agent.id}
                      onSelect={() => {
                        onSelect(agent.id);
                        setOpen(false);
                      }}
                    >
                      <Avatar
                        src={resolveAvatarUrl(agent.avatar)}
                        name={agent.name}
                        className="size-5"
                      />
                      <span>{agent.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        </>
      )}
    </div>
  );
}

// ── File Upload Button ──────────────────────────────────────────────────

function FileUploadButton({ files, onFiles }: { files: File[]; onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
        aria-label="Attach files"
      >
        <Paperclip className="size-4" />
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const selected = Array.from(e.target.files ?? []);
          if (selected.length > 0) {
            onFiles([...files, ...selected]);
          }
          e.target.value = '';
        }}
      />
    </>
  );
}

// ── TTS Button ──────────────────────────────────────────────────────────

function TTSButton({ lastAssistantContent }: { lastAssistantContent?: string }) {
  const [speaking, setSpeaking] = useState(false);

  const toggle = useCallback(() => {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!lastAssistantContent) return;
    const utter = new SpeechSynthesisUtterance(lastAssistantContent);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    speechSynthesis.speak(utter);
    setSpeaking(true);
  }, [speaking, lastAssistantContent]);

  return (
    <button
      onClick={toggle}
      disabled={!lastAssistantContent}
      className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
      aria-label={speaking ? 'Stop speaking' : 'Read aloud'}
    >
      {speaking ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
    </button>
  );
}

// ── Main Input Area ─────────────────────────────────────────────────────

interface ChatInputAreaProps {
  onSend: (text: string, options?: { files?: File[]; agent?: ChatMessageAgent }) => void;
  isStreaming: boolean;
  connectionStatus: string;
  agents?: AgentDetail[];
  agentId?: string;
  onAgentChange?: (id: string | undefined) => void;
  onStop?: () => void;
  lastAssistantContent?: string;
}

export function ChatInputArea({
  onSend,
  isStreaming,
  connectionStatus,
  agents = [],
  agentId,
  onAgentChange,
  onStop,
  lastAssistantContent,
}: ChatInputAreaProps) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim().length > 0 && connectionStatus === 'connected' && !isStreaming;

  const selectedAgent = agents.find((a) => a.id === agentId);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || !canSend) return;

    // Build the agent snapshot for this message
    const agentSnapshot: ChatMessageAgent | undefined = selectedAgent
      ? {
          id: selectedAgent.id,
          name: selectedAgent.name,
          emoji: selectedAgent.emoji,
          avatar: selectedAgent.avatar,
        }
      : agents[0]
        ? {
            id: agents[0].id,
            name: agents[0].name,
            emoji: agents[0].emoji,
            avatar: agents[0].avatar,
          }
        : undefined;

    onSend(trimmed, {
      files: files.length > 0 ? files : undefined,
      agent: agentSnapshot,
    });
    setValue('');
    setFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, canSend, onSend, files, selectedAgent, agents]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      {/* File previews */}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-600"
            >
              <Paperclip className="size-3" />
              <span className="max-w-[120px] truncate">{f.name}</span>
              <button
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="ml-0.5 text-neutral-400 hover:text-neutral-600"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          'rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all',
          'focus-within:ring-2 focus-within:ring-accent-500/20 focus-within:border-accent-300'
        )}
      >
        {/* Agent selector row */}
        {agents.length > 0 && onAgentChange && (
          <div className="px-3 pt-2">
            <AgentSelector agents={agents} selectedId={agentId} onSelect={onAgentChange} />
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={selectedAgent ? `Message ${selectedAgent.name}...` : 'Send a message...'}
          disabled={connectionStatus !== 'connected'}
          rows={1}
          className="w-full resize-none bg-transparent px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 outline-none disabled:cursor-not-allowed disabled:opacity-50  focus:shadow-none!"
        />

        {/* Bottom row */}
        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-0.5">
            <FileUploadButton files={files} onFiles={setFiles} />
            <TTSButton lastAssistantContent={lastAssistantContent} />
          </div>

          {isStreaming ? (
            <button
              onClick={onStop}
              className="flex size-8 items-center justify-center rounded-full bg-neutral-900 text-white transition-colors hover:bg-neutral-700"
              aria-label="Stop generating"
            >
              <Square className="size-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="flex size-8 items-center justify-center rounded-full bg-accent-600 text-white transition-colors hover:bg-accent-700 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
