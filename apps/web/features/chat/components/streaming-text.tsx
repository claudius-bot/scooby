'use client';

interface StreamingTextProps {
  content: string;
  streaming?: boolean;
}

export function StreamingText({ content, streaming = false }: StreamingTextProps) {
  if (!content && streaming) {
    return (
      <span className="inline-block h-4 w-1.5 animate-pulse bg-gray-400" />
    );
  }

  return (
    <span className="whitespace-pre-wrap">
      {content}
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-gray-400 align-text-bottom" />
      )}
    </span>
  );
}
