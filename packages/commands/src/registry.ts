import type { CommandDefinition, CommandHandler } from './types.js';
import { normalizeCommandName } from './parser.js';

/**
 * Registry for slash commands.
 */
export class CommandRegistry {
  private commands = new Map<string, CommandDefinition>();
  private aliases = new Map<string, string>(); // alias -> primary name

  /**
   * Register a command definition.
   */
  register(def: CommandDefinition): void {
    const name = normalizeCommandName(def.name);
    this.commands.set(name, { ...def, name });

    // Register aliases
    if (def.aliases) {
      for (const alias of def.aliases) {
        const normalizedAlias = normalizeCommandName(alias);
        this.aliases.set(normalizedAlias, name);
      }
    }
  }

  /**
   * Get a command definition by name or alias.
   */
  get(name: string): CommandDefinition | undefined {
    const normalized = normalizeCommandName(name);

    // Check direct match
    if (this.commands.has(normalized)) {
      return this.commands.get(normalized);
    }

    // Check alias
    const primaryName = this.aliases.get(normalized);
    if (primaryName) {
      return this.commands.get(primaryName);
    }

    return undefined;
  }

  /**
   * Get a command handler by name or alias.
   */
  getHandler(name: string): CommandHandler | undefined {
    const def = this.get(name);
    return def?.handler;
  }

  /**
   * Check if a command exists.
   */
  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  /**
   * List all registered commands (for /help).
   * Returns only non-hidden commands.
   */
  list(): CommandDefinition[] {
    const defs = Array.from(this.commands.values());
    return defs.filter((d) => !d.hidden).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * List all commands including hidden ones.
   */
  listAll(): CommandDefinition[] {
    return Array.from(this.commands.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
}
