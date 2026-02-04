'use client';

import type { ReactNode } from 'react';

interface SidebarProps {
  children: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({
  children,
  collapsed = false,
  onToggle,
}: SidebarProps) {
  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-gray-800 bg-gray-950 transition-all duration-200 ${
        collapsed ? 'w-0 overflow-hidden' : 'w-64'
      }`}
    >
      {onToggle && (
        <div className="flex items-center justify-end border-b border-gray-800 px-2 py-1">
          <button
            onClick={onToggle}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            >
              <path
                fillRule="evenodd"
                d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
