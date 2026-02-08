'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, Wifi, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface GatewayHealthBadgeProps {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  onReconnect: () => void;
  onShowTokenModal: () => void;
  needsAuth: boolean;
}

// Refined, minimal status indicator matching the dashboard's industrial aesthetic
export function GatewayHealthBadge({
  status,
  onReconnect,
  onShowTokenModal,
  needsAuth,
}: GatewayHealthBadgeProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  // Minimal, precise status configurations
  const statusConfig = {
    connected: {
      label: 'Online',
      ringColor: 'ring-emerald-500/20',
      dotColor: 'bg-emerald-500',
      textColor: 'text-neutral-600',
      pulse: true,
    },
    connecting: {
      label: 'Sync',
      ringColor: 'ring-amber-500/20',
      dotColor: 'bg-amber-500',
      textColor: 'text-neutral-500',
      pulse: false,
      spin: true,
    },
    error: {
      label: needsAuth ? 'Auth' : 'Error',
      ringColor: needsAuth ? 'ring-amber-500/20' : 'ring-red-500/20',
      dotColor: needsAuth ? 'bg-amber-500' : 'bg-red-500',
      textColor: 'text-neutral-600',
      pulse: false,
    },
    disconnected: {
      label: 'Offline',
      ringColor: 'ring-neutral-300',
      dotColor: 'bg-neutral-400',
      textColor: 'text-neutral-400',
      pulse: false,
    },
  };

  const config = statusConfig[status] || statusConfig.disconnected;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={cn(
          'group flex items-center gap-2 h-8 px-2.5 rounded-md transition-all duration-200',
          'bg-neutral-50 hover:bg-neutral-100',
          'ring-1 ring-inset ring-neutral-200/80',
          showDropdown && 'bg-neutral-100 ring-neutral-300'
        )}
      >
        {/* Status indicator dot with ring */}
        <div className="relative flex items-center justify-center">
          {'spin' in config && config.spin ? (
            <Loader2 className="h-3 w-3 text-amber-500 animate-spin" />
          ) : (
            <>
              {/* Outer ring pulse effect */}
              {config.pulse && (
                <span
                  className={cn(
                    'absolute h-2.5 w-2.5 rounded-full animate-ping opacity-40',
                    config.dotColor
                  )}
                />
              )}
              {/* Core dot */}
              <span
                className={cn(
                  'relative h-1.5 w-1.5 rounded-full ring-2',
                  config.dotColor,
                  config.ringColor
                )}
              />
            </>
          )}
        </div>

        {/* Label */}
        <span className={cn('text-[11px] font-medium tracking-wide uppercase', config.textColor)}>
          {config.label}
        </span>

        {/* Subtle chevron */}
        <ChevronDown
          className={cn(
            'h-3 w-3 text-neutral-400 transition-transform duration-200',
            showDropdown && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown panel */}
      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="absolute top-full right-0 mt-1.5 w-56 bg-white border border-neutral-200 rounded-lg shadow-lg shadow-neutral-200/50 z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="px-3 py-2.5 bg-neutral-50 border-b border-neutral-100">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                  Gateway
                </span>
                <div className="flex items-center gap-1.5">
                  {'spin' in config && config.spin ? (
                    <Loader2 className="h-3 w-3 text-amber-500 animate-spin" />
                  ) : (
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        config.dotColor,
                        config.pulse && 'animate-pulse'
                      )}
                    />
                  )}
                  <span className={cn('text-[11px] font-medium', config.textColor)}>
                    {status === 'connected' && 'Connected'}
                    {status === 'connecting' && 'Connecting...'}
                    {status === 'error' && (needsAuth ? 'Auth Required' : 'Error')}
                    {status === 'disconnected' && 'Disconnected'}
                  </span>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-2">
              {status === 'connected' ? (
                <div className="flex items-center gap-3 px-2 py-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50">
                    <Wifi className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-neutral-900">WebSocket Active</p>
                    <p className="text-[10px] text-neutral-500">Real-time sync enabled</p>
                  </div>
                </div>
              ) : needsAuth ? (
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    onShowTokenModal();
                  }}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-left hover:bg-neutral-50 transition-colors group/btn"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 group-hover/btn:bg-amber-100 transition-colors">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-neutral-900">Enter Token</p>
                    <p className="text-[10px] text-neutral-500">Authentication required</p>
                  </div>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    onReconnect();
                  }}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-left hover:bg-neutral-50 transition-colors group/btn"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 group-hover/btn:bg-neutral-200 transition-colors">
                    <Wifi className="h-4 w-4 text-neutral-600" />
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-neutral-900">Reconnect</p>
                    <p className="text-[10px] text-neutral-500">Attempt to restore connection</p>
                  </div>
                </button>
              )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-neutral-100 bg-neutral-50/50">
              <p className="text-[10px] text-neutral-400 text-center">
                {status === 'connected' ? 'Last sync: just now' : 'Gateway · localhost:18789'}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
