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

export function prepareOutboundText(
  text: string,
  format: 'text' | 'markdown' | undefined,
  supportsMarkdown: boolean,
): { text: string; format: 'text' | 'markdown' } {
  if (format === 'markdown' && !supportsMarkdown) {
    return { text: markdownToText(text), format: 'text' };
  }
  return { text, format: format ?? 'text' };
}
