import type { InboundMessage, OutboundAttachment } from '@scooby/channels';
import type {
  Workspace,
  SessionMetadata,
  SessionManager,
  ScoobyConfig,
  ModelCandidate,
  SkillDefinition,
} from '@scooby/core';
import type { UsageSummary } from '@scooby/schemas';

/**
 * Info about a workspace for listing/switching.
 */
export interface WorkspaceInfo {
  id: string;
  name: string;
  emoji: string;
  hasAccess: boolean;
  isCurrentlyConnected: boolean;
}

/**
 * Context provided to command handlers with everything they need
 * to execute the command.
 */
export interface CommandContext {
  // Message
  message: InboundMessage;
  channelType: string;
  conversationId: string;

  // Workspace
  workspace: Workspace;
  workspaceId: string;

  // Session
  session: SessionMetadata;
  sessionManager: SessionManager;

  // Config
  config: ScoobyConfig;
  globalModels: {
    fast: ModelCandidate[];
    slow: ModelCandidate[];
  };
  modelOverrideStore?: import('@scooby/core').ModelOverrideStore;

  // Functions
  sendReply: (text: string, format?: 'text' | 'markdown') => Promise<void>;
  sendAttachment?: (attachment: OutboundAttachment) => Promise<void>;
  getRunningAgent?: () => AbortController | null;
  stopRunningAgent?: () => boolean;
  getUsageSummary?: (days?: number) => Promise<UsageSummary>;
  getSkills?: () => Promise<SkillDefinition[]>;
  generateWorkspaceCode?: () => string;

  // Memory
  searchMemory?: (query: string) => Promise<Array<{ source: string; content: string; score: number }>>;
  addMemory?: (text: string) => Promise<number>;
  clearMemory?: () => Promise<void>;

  // Workspace management
  /** Create a new workspace and return a code to join it. */
  createWorkspace?: (name: string, options?: { description?: string }) => Promise<{ workspaceId: string; code: string }>;
  /** Get workspaces the current channel can access. */
  getAccessibleWorkspaces?: () => Promise<WorkspaceInfo[]>;
  /** Switch the current channel to a different workspace. */
  switchWorkspace?: (workspaceId: string) => Promise<boolean>;
}

/**
 * Result returned by a command handler.
 */
export interface CommandResult {
  /** Whether the command was handled (response sent). */
  handled: boolean;
  /** Optional response text (for logging/debugging). */
  response?: string;
  /** If true, don't record this interaction in the transcript. */
  suppressTranscript?: boolean;
  /** If true, the session was reset. */
  sessionReset?: boolean;
}

/**
 * Handler function for a command.
 */
export type CommandHandler = (args: string, ctx: CommandContext) => Promise<CommandResult>;

/**
 * Definition of a slash command.
 */
export interface CommandDefinition {
  /** Primary name (without /). */
  name: string;
  /** Alternative names (without /). */
  aliases?: string[];
  /** Short description for /help listing. */
  description: string;
  /** Usage string (e.g., "/model [name]"). */
  usage?: string;
  /** The handler function. */
  handler: CommandHandler;
  /** If true, hide from /help listing. */
  hidden?: boolean;
}
