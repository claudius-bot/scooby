import type { TranscriptEntry, TranscriptContentPart } from '../session/types.js';

/**
 * Converts transcript entries into a Markdown document suitable for QMD indexing.
 */
export function sessionToMarkdown(sessionId: string, entries: TranscriptEntry[]): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Session ${sessionId}`);
  if (entries.length > 0) {
    lines.push(`Date: ${entries[0].timestamp}`);
  }
  lines.push('');

  for (const entry of entries) {
    // Skip tool role entries
    if (entry.role === 'tool') continue;

    const label = entry.role.charAt(0).toUpperCase() + entry.role.slice(1);
    lines.push(`## ${label}`);

    let text: string;
    if (typeof entry.content === 'string') {
      text = entry.content;
    } else if (Array.isArray(entry.content)) {
      text = (entry.content as TranscriptContentPart[])
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map(p => p.text)
        .join(' ');
    } else {
      text = '';
    }

    if (text.trim()) {
      lines.push(text.trim());
    }
    lines.push('');
  }

  return lines.join('\n');
}
