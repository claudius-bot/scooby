/**
 * Result of parsing a potential command message.
 */
export interface ParseResult {
  /** Parsed command info, or null if not a command. */
  command: {
    /** Command name (lowercase, without /). */
    name: string;
    /** Arguments after the command name. */
    args: string;
    /** Raw matched text. */
    raw: string;
  } | null;
  /** Whether the message contains only the command (no other text). */
  isCommandOnly: boolean;
  /** Any remaining text after the command. */
  remainingText: string;
}

/**
 * Regex to match a slash command at the start of a message.
 * - Starts with /
 * - Command name: starts with letter, then alphanumeric/underscore/hyphen
 * - Optional colon after name (handles /help: and /model: opus)
 * - Optional whitespace and arguments
 */
const COMMAND_REGEX = /^\/([a-zA-Z][a-zA-Z0-9_-]*):?\s*(.*)/s;

/**
 * Parse a message to extract any slash command.
 */
export function parseCommand(text: string): ParseResult {
  const trimmed = text.trim();
  const match = trimmed.match(COMMAND_REGEX);

  if (!match) {
    return {
      command: null,
      isCommandOnly: false,
      remainingText: text,
    };
  }

  const [raw, name, args] = match;
  const normalizedName = name.toLowerCase();

  return {
    command: {
      name: normalizedName,
      args: args.trim(),
      raw,
    },
    isCommandOnly: raw === trimmed,
    remainingText: trimmed.slice(raw.length).trim(),
  };
}

/**
 * Normalize a command name to lowercase.
 */
export function normalizeCommandName(name: string): string {
  return name.toLowerCase().replace(/^\//, '');
}
