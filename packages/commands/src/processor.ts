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
import type { CommandResult, CommandContext, WorkspaceInfo } from './types.js';
import type { CommandRegistry } from './registry.js';
import { parseCommand } from './parser.js';

export interface ProcessMessageOptions {
  message: InboundMessage;
  workspace: Workspace;
  session: SessionMetadata;
  sessionManager: SessionManager;
  config: ScoobyConfig;
  globalModels: {
    fast: ModelCandidate[];
    slow: ModelCandidate[];
  };
  sendReply: (text: string, format?: 'text' | 'markdown') => Promise<void>;
  sendAttachment?: (attachment: OutboundAttachment) => Promise<void>;
  getRunningAgent?: () => AbortController | null;
  stopRunningAgent?: () => boolean;
  getUsageSummary?: (days?: number) => Promise<UsageSummary>;
  getSkills?: () => Promise<SkillDefinition[]>;
  generateWorkspaceCode?: () => string;

  // Workspace management
  createWorkspace?: (name: string) => Promise<{ workspaceId: string; code: string }>;
  getAccessibleWorkspaces?: () => Promise<WorkspaceInfo[]>;
  switchWorkspace?: (workspaceId: string) => Promise<boolean>;
}

export interface CommandProcessorConfig {
  registry: CommandRegistry;
  config: ScoobyConfig;
}

/**
 * CommandProcessor intercepts messages and handles slash commands.
 */
export class CommandProcessor {
  constructor(private options: CommandProcessorConfig) {}

  /**
   * Try to handle a message as a slash command.
   * Returns null if the message is not a command or if the command is unknown.
   */
  async tryHandle(opts: ProcessMessageOptions): Promise<CommandResult | null> {
    const parsed = parseCommand(opts.message.text);

    // Not a command
    if (!parsed.command) {
      return null;
    }

    // Check if we know this command
    const handler = this.options.registry.getHandler(parsed.command.name);

    if (!handler) {
      // Unknown command - let it pass through to the agent
      return null;
    }

    // Build command context
    const ctx: CommandContext = {
      message: opts.message,
      channelType: opts.message.channelType,
      conversationId: opts.message.conversationId,
      workspace: opts.workspace,
      workspaceId: opts.workspace.id,
      session: opts.session,
      sessionManager: opts.sessionManager,
      config: opts.config,
      globalModels: opts.globalModels,
      sendReply: opts.sendReply,
      sendAttachment: opts.sendAttachment,
      getRunningAgent: opts.getRunningAgent,
      stopRunningAgent: opts.stopRunningAgent,
      getUsageSummary: opts.getUsageSummary,
      getSkills: opts.getSkills,
      generateWorkspaceCode: opts.generateWorkspaceCode,
      createWorkspace: opts.createWorkspace,
      getAccessibleWorkspaces: opts.getAccessibleWorkspaces,
      switchWorkspace: opts.switchWorkspace,
    };

    // Execute the command
    return handler(parsed.command.args, ctx);
  }

  /**
   * Check if a message text starts with a known command.
   */
  isKnownCommand(text: string): boolean {
    const parsed = parseCommand(text);
    if (!parsed.command) {
      return false;
    }
    return this.options.registry.has(parsed.command.name);
  }

  /**
   * Get the underlying registry.
   */
  get registry(): CommandRegistry {
    return this.options.registry;
  }
}
