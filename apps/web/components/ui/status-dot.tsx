'use client';

import { cn } from '../../lib/utils';

export type StatusDotVariant = 'success' | 'warning' | 'error' | 'neutral' | 'info';
export type StatusDotSize = 'xs' | 'sm' | 'md' | 'lg';

interface StatusDotProps {
  variant?: StatusDotVariant;
  size?: StatusDotSize;
  pulse?: boolean;
  className?: string;
  /** Position the dot absolutely (for overlaying on icons) */
  absolute?: boolean;
  /** Include a white border ring (useful when overlaying) */
  bordered?: boolean;
}

const variantColors: Record<StatusDotVariant, { dot: string; ping: string }> = {
  success: {
    dot: 'bg-green-500',
    ping: 'bg-green-400',
  },
  warning: {
    dot: 'bg-amber-500',
    ping: 'bg-amber-400',
  },
  error: {
    dot: 'bg-red-500',
    ping: 'bg-red-400',
  },
  neutral: {
    dot: 'bg-neutral-400',
    ping: 'bg-neutral-300',
  },
  info: {
    dot: 'bg-blue-500',
    ping: 'bg-blue-400',
  },
};

const sizeClasses: Record<StatusDotSize, { outer: string; inner: string }> = {
  xs: {
    outer: 'h-1.5 w-1.5',
    inner: 'h-1.5 w-1.5',
  },
  sm: {
    outer: 'h-2 w-2',
    inner: 'h-2 w-2',
  },
  md: {
    outer: 'h-2.5 w-2.5',
    inner: 'h-2.5 w-2.5',
  },
  lg: {
    outer: 'h-3 w-3',
    inner: 'h-3 w-3',
  },
};

/**
 * A reusable status indicator dot with optional pulse animation.
 * Can be positioned absolutely for overlaying on icons/buttons.
 *
 * @example
 * // Basic usage
 * <StatusDot variant="success" pulse />
 *
 * @example
 * // Positioned on an icon
 * <div className="relative">
 *   <CalendarClock className="h-5 w-5" />
 *   <StatusDot variant="success" pulse absolute bordered />
 * </div>
 */
export function StatusDot({
  variant = 'success',
  size = 'sm',
  pulse = false,
  className,
  absolute = false,
  bordered = false,
}: StatusDotProps) {
  const colors = variantColors[variant];
  const sizes = sizeClasses[size];

  return (
    <span
      className={cn(
        'flex',
        absolute ? '-top-0.5 -right-0.5 absolute' : 'relative',
        sizes.outer,
        className
      )}
    >
      {pulse && (
        <span
          className={cn('absolute inset-0 rounded-full opacity-75 animate-ping', colors.ping)}
        />
      )}
      <span
        className={cn(
          'relative rounded-full',
          sizes.inner,
          colors.dot,
          bordered && 'border-2 border-white'
        )}
      />
    </span>
  );
}

/**
 * Convenience component for a success status dot that pulses when active
 */
export function ActiveStatusDot({
  active,
  size = 'sm',
  ...props
}: Omit<StatusDotProps, 'variant' | 'pulse'> & { active: boolean }) {
  return (
    <StatusDot variant={active ? 'success' : 'neutral'} pulse={active} size={size} {...props} />
  );
}
