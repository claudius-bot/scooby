// @scooby/commands - Slash command system

export * from './types.js';
export * from './parser.js';
export * from './registry.js';
export * from './processor.js';

// Re-export handler creators
export {
  createHelpCommand,
  createStatusCommand,
  createResetCommand,
  createModelCommand,
  createStopCommand,
  createUsageCommand,
  createSkillCommand,
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

  // Help command needs registry to list commands
  registry.register(createHelpCommand(registry));

  return registry;
}
