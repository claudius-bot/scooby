'use client';

import { useState } from 'react';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ToolCallCardProps {
  toolName: string;
  args?: unknown;
  result?: string;
}

export function ToolCallCard({ toolName, args, result }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isPending = result === undefined;

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        {isPending ? (
          <Loader2 className="size-3.5 text-accent-500 animate-spin" />
        ) : (
          <Check className="size-3.5 text-accent-500" />
        )}
        <span className="font-mono text-[13px] text-neutral-700">{toolName}</span>
        <ChevronDown
          className={`ml-auto size-3.5 text-neutral-400 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-neutral-200 px-3 py-2">
              {args !== undefined && (
                <div className="mb-2">
                  <span className="text-xs font-medium text-neutral-400">
                    Arguments
                  </span>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-white border border-neutral-100 p-2 font-mono text-xs text-neutral-700">
                    {JSON.stringify(args, null, 2)}
                  </pre>
                </div>
              )}
              {result !== undefined && (
                <div>
                  <span className="text-xs font-medium text-neutral-400">Result</span>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-white border border-neutral-100 p-2 font-mono text-xs text-neutral-700">
                    {result}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
