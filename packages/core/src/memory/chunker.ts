export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

export interface Chunk {
  content: string;
  index: number;
  tokenCount: number;
}

/**
 * Rough token estimation: ~4 characters per token for English text.
 * Avoids a heavy tiktoken dependency at chunking time.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into approximately `maxTokens`-sized chunks with `overlapTokens`
 * overlap between consecutive chunks. Prefers breaking at paragraph or
 * sentence boundaries when possible.
 */
export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const maxTokens = options.maxTokens ?? 400;
  const overlapTokens = options.overlapTokens ?? 80;
  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;

  if (text.length === 0) return [];

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    // When we are not at the end, try to break at a natural boundary
    if (end < text.length) {
      const halfwayPoint = start + Math.floor(maxChars * 0.5);

      // Prefer paragraph break (\n\n)
      const paraBreak = text.lastIndexOf('\n\n', end);
      if (paraBreak > halfwayPoint) {
        end = paraBreak;
      } else {
        // Fall back to sentence break (". ")
        const sentBreak = text.lastIndexOf('. ', end);
        if (sentBreak > halfwayPoint) {
          end = sentBreak + 1; // include the period
        }
        // Otherwise just cut at maxChars
      }
    }

    const content = text.slice(start, end).trim();
    if (content.length > 0) {
      chunks.push({
        content,
        index,
        tokenCount: estimateTokens(content),
      });
      index++;
    }

    // If we've consumed the entire text, stop
    if (end >= text.length) break;

    // Advance with overlap
    const nextStart = end - overlapChars;

    // Guard against non-progress (overlap >= chunk size would loop forever)
    if (nextStart <= start) {
      start = end;
    } else {
      start = nextStart;
    }
  }

  return chunks;
}
