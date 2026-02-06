import { readFile } from 'node:fs/promises';
import type { ModelMessage } from 'ai';
import type { TranscriptEntry, TranscriptContentPart } from './types.js';

/**
 * Convert transcript entries into AI SDK ModelMessage[],
 * reading image files from disk for vision support.
 */
export async function transcriptToMessages(
  entries: TranscriptEntry[],
): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = [];

  for (const entry of entries) {
    // Simple string content — pass through as-is
    if (typeof entry.content === 'string') {
      messages.push({ role: entry.role, content: entry.content } as ModelMessage);
      continue;
    }

    // Multi-part content — only user messages should have image parts
    const parts: Array<{ type: 'text'; text: string } | { type: 'image'; image: Buffer; mimeType?: string }> = [];

    for (const part of entry.content as TranscriptContentPart[]) {
      if (part.type === 'text') {
        parts.push({ type: 'text', text: part.text });
      } else if (part.type === 'image') {
        try {
          const imageData = await readFile(part.path);
          parts.push({
            type: 'image',
            image: imageData,
            ...(part.mediaType ? { mimeType: part.mediaType } : {}),
          });
        } catch {
          // Image file missing (deleted/archived) — skip silently
        }
      }
    }

    // If all image parts failed to load, fall back to text-only
    if (parts.length === 0) continue;

    messages.push({ role: entry.role, content: parts } as ModelMessage);
  }

  return messages;
}
