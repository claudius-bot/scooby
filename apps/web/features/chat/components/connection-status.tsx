'use client';

import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  status: string;
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  const dotColor =
    status === 'connected'
      ? 'bg-accent-500'
      : status === 'connecting'
        ? 'bg-warning-500'
        : 'bg-danger-500';

  const label =
    status === 'connected'
      ? 'Connected'
      : status === 'connecting'
        ? 'Connecting...'
        : 'Disconnected';

  return (
    <div className="group relative flex items-center">
      <span
        className={cn('size-1.5 rounded-full', dotColor)}
        style={
          status === 'connected'
            ? { animation: 'pulse-dot 2s ease-in-out infinite' }
            : undefined
        }
      />
      <span className="ml-1.5 text-[11px] text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100">
        {label}
      </span>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
