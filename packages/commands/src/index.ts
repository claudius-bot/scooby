// @scooby/commands - Slash command system

export * from './types.js';
export * from './parser.js';
export * from './registry.js';
export * from './processor.js';
export * from './code-manager.js';
export * from './channel-access.js';
export * from './workspace-manager.js';

// Re-export handler creators
export {
  createHelpCommand,
  createStatusCommand,
  createResetCommand,
  createModelCommand,
  createStopCommand,
  createUsageCommand,
  createSkillCommand,
  createGenCodeCommand,
  createNewWorkspaceCommand,
  createSwitchCommand,
  createTtsCommand,
} from './handlers/index.js';

import { CommandRegistry } from './registry.js';
import {
  createHelpCommand,
  createStatusCommand,
  createResetCommand,
  createModelCommand,
  createStopCommand,
  createUsageCommand,
  createSkillCommand,
  createGenCodeCommand,
  createNewWorkspaceCommand,
  createSwitchCommand,
  createTtsCommand,
} from './handlers/index.js';

/**
 * Create a CommandRegistry with all default commands registered.
 */
export function createDefaultRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  // Register all default commands
  // Note: help needs the registry reference, so we register it last
  registry.register(createStatusCommand());
  registry.register(createResetCommand());
  registry.register(createModelCommand());
  registry.register(createStopCommand());
  registry.register(createUsageCommand());
  registry.register(createSkillCommand());
  registry.register(createGenCodeCommand());
  registry.register(createNewWorkspaceCommand());
  registry.register(createSwitchCommand());
  registry.register(createTtsCommand());

  // Help command needs registry to list commands
  registry.register(createHelpCommand(registry));

  return registry;
}
