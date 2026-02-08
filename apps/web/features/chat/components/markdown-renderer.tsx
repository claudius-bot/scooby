'use client';

import { useState, useCallback, type ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function CodeBlock({ className, children, ...props }: ComponentProps<'code'>) {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match?.[1];
  const isInline = !lang && !String(children).includes('\n');

  if (isInline) {
    return (
      <code
        className="bg-neutral-100 px-1.5 py-0.5 rounded text-[13px] font-[var(--font-mono)]"
        {...props}
      >
        {children}
      </code>
    );
  }

  return <CodeBlockWithCopy lang={lang}>{children}</CodeBlockWithCopy>;
}

function CodeBlockWithCopy({
  lang,
  children,
}: {
  lang?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = String(children).replace(/\n$/, '');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="relative group">
      {lang && (
        <span className="absolute top-2 right-10 text-[10px] font-mono uppercase text-neutral-400">
          {lang}
        </span>
      )}
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-neutral-200"
        aria-label="Copy code"
      >
        {copied ? (
          <Check className="size-3.5 text-accent-500" />
        ) : (
          <Copy className="size-3.5 text-neutral-400" />
        )}
      </button>
      <code className="block text-[13px] font-[var(--font-mono)]">{children}</code>
    </div>
  );
}

const components: ComponentProps<typeof ReactMarkdown>['components'] = {
  code: CodeBlock,
  pre: ({ children, ...props }) => (
    <pre
      className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 overflow-x-auto"
      {...props}
    >
      {children}
    </pre>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-600 hover:underline"
      {...props}
    >
      {children}
    </a>
  ),
};

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        'prose prose-sm prose-neutral max-w-none',
        'prose-p:my-1.5 prose-p:leading-relaxed',
        'prose-pre:bg-neutral-50 prose-pre:border prose-pre:border-neutral-200 prose-pre:rounded-lg prose-pre:p-0',
        'prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none',
        'prose-a:text-accent-600',
        'prose-headings:text-neutral-900',
        'prose-strong:text-neutral-900',
        'prose-ul:my-2 prose-ol:my-2',
        'prose-li:my-0.5',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
