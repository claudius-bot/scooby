'use client';

import { useState } from 'react';

interface ToolCallCardProps {
  toolName: string;
  args?: unknown;
  result?: string;
}

export function ToolCallCard({ toolName, args, result }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isPending = result === undefined;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        {isPending ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-500 border-t-blue-400" />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3.5 w-3.5 text-green-400"
          >
            <path
              fillRule="evenodd"
              d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
              clipRule="evenodd"
            />
          </svg>
        )}
        <span className="font-mono text-xs text-gray-300">{toolName}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`ml-auto h-3.5 w-3.5 text-gray-500 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        >
          <path
            fillRule="evenodd"
            d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 px-3 py-2">
          {args !== undefined && (
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-500">
                Arguments
              </span>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-800 p-2 font-mono text-xs text-gray-300">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {result !== undefined && (
            <div>
              <span className="text-xs font-medium text-gray-500">Result</span>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-800 p-2 font-mono text-xs text-gray-300">
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
