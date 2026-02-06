import type { OutputFormat } from './types.js';

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function markdownToText(markdown: string): string {
  let text = markdown;
  // Remove images
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, '');
  // Convert links to just their label
  text = text.replace(/\[([^\]]+)]\([^)]+\)/g, '$1');
  // Strip code blocks (keep content)
  text = text.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/```[^\n]*\n?/g, '').replace(/```/g, ''),
  );
  // Strip inline code markers
  text = text.replace(/`([^`]+)`/g, '$1');
  // Strip headings markers
  text = text.replace(/^#{1,6}\s+/gm, '');
  // Strip unordered list markers
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  // Strip ordered list markers
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  // Strip bold/italic: **text**, __text__, *text*, _text_
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  text = text.replace(/__(.+?)__/g, '$1');
  text = text.replace(/\*(.+?)\*/g, '$1');
  text = text.replace(/_(.+?)_/g, '$1');
  return normalizeWhitespace(text);
}

/**
 * Escape all Telegram MarkdownV2 reserved characters in a plain-text segment.
 *
 * Reserved: _ * [ ] ( ) ~ ` > # + - = | { } . ! \
 */
function escapeTelegramChars(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Convert standard markdown to Telegram MarkdownV2.
 *
 * Uses a placeholder-based approach:
 *  1. Split on code blocks / inline code (same syntax in both formats)
 *  2. In non-code segments, replace formatting constructs with null-byte placeholders
 *  3. Escape all remaining Telegram-reserved special chars
 *  4. Replace placeholders with Telegram MarkdownV2 markers
 */
export function markdownToTelegramV2(markdown: string): string {
  // Split on code fences and inline code to leave them untouched.
  const parts = markdown.split(/(```[\s\S]*?```|`[^`]*`)/);

  return parts
    .map((part, i) => {
      // Odd indices are code blocks/spans — leave as-is
      if (i % 2 === 1) return part;
      return convertSegment(part);
    })
    .join('');
}

// Placeholder tokens — use null bytes which won't appear in normal text
let placeholderIndex = 0;
const PH = () => `\0${placeholderIndex++}\0`;

function convertSegment(text: string): string {
  const replacements: Array<{ token: string; value: string }> = [];
  placeholderIndex = 0;

  const ph = (value: string): string => {
    const token = PH();
    replacements.push({ token, value });
    return token;
  };

  let result = text;

  // Images: ![alt](url) → just alt text
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_match, alt: string) => {
    return alt;
  });

  // Links: [text](url) — escape text but leave URL unescaped
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, linkText: string, url: string) => {
    const open = ph('[');
    const mid = ph('](');
    const close = ph(')');
    return `${open}${linkText}${mid}${url}${close}`;
  });

  // Bold+italic: ***text*** or ___text___
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, (_match, content: string) => {
    const open = ph('*_');
    const close = ph('_*');
    return `${open}${content}${close}`;
  });

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, (_match, content: string) => {
    const open = ph('*');
    const close = ph('*');
    return `${open}${content}${close}`;
  });
  result = result.replace(/__(.+?)__/g, (_match, content: string) => {
    const open = ph('*');
    const close = ph('*');
    return `${open}${content}${close}`;
  });

  // Italic: *text* or _text_
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_match, content: string) => {
    const open = ph('_');
    const close = ph('_');
    return `${open}${content}${close}`;
  });
  result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, (_match, content: string) => {
    const open = ph('_');
    const close = ph('_');
    return `${open}${content}${close}`;
  });

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, (_match, content: string) => {
    const open = ph('~');
    const close = ph('~');
    return `${open}${content}${close}`;
  });

  // Headings: # Heading → *Heading* (bold in Telegram)
  result = result.replace(/^#{1,6}\s+(.+)$/gm, (_match, content: string) => {
    const open = ph('*');
    const close = ph('*');
    return `${open}${content}${close}`;
  });

  // Escape all remaining Telegram-reserved characters
  result = escapeTelegramChars(result);

  // Replace placeholders with actual Telegram markers
  for (const { token, value } of replacements) {
    result = result.replace(token, value);
  }

  return result;
}

export function prepareOutboundText(
  text: string,
  format: 'text' | 'markdown' | undefined,
  outputFormat: OutputFormat,
): { text: string; format: 'text' | 'markdown' } {
  if (format !== 'markdown') {
    return { text, format: format ?? 'text' };
  }

  switch (outputFormat) {
    case 'markdown':
      return { text, format: 'markdown' };
    case 'telegram':
      return { text: markdownToTelegramV2(text), format: 'markdown' };
    case 'plaintext':
      return { text: markdownToText(text), format: 'text' };
    default: {
      const _exhaustive: never = outputFormat;
      return _exhaustive;
    }
  }
}
