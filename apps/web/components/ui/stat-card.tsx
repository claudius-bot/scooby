'use client';

import { ReactNode, ComponentType, forwardRef } from 'react';
import { motion, type Variants } from 'motion/react';
import { cn, formatNumber } from '../../lib/utils';
import { Card } from './card';
import { StatusDot, type StatusDotVariant } from './status-dot';

// ============================================================================
// Types
// ============================================================================

/** Color schemes for the stat card - controls background, border, and icon colors */
export type StatCardColor = 'blue' | 'violet' | 'green' | 'amber' | 'neutral' | 'rose' | 'cyan';

/** Semantic variant for value styling - applies to text color */
export type StatCardVariant = 'default' | 'danger' | 'warning' | 'success';

/** Size presets for the stat card */
export type StatCardSize = 'sm' | 'base' | 'lg';

export interface StatCardProps {
  /** Label displayed above the value */
  label: string;
  /** Primary value - can be string or number (numbers auto-format with commas) */
  value: string | number;
  /** Optional icon component displayed in the top right */
  icon?: ComponentType<{ className?: string }>;
  /** Color scheme for background tinting and icon styling */
  color?: StatCardColor;
  /** Semantic variant affecting value text color */
  variant?: StatCardVariant;
  /** Size preset - affects padding, typography scale, and grid span */
  size?: StatCardSize;
  /** Show a pulsing status dot indicator on the icon */
  pulse?: boolean;
  /** Status dot variant when pulse is enabled */
  pulseVariant?: StatusDotVariant;
  /** Secondary text displayed below the value */
  subvalue?: string;
  /** Style the subvalue as success (green) */
  subvalueSuccess?: boolean;
  /** Custom content to render beside the value */
  content?: ReactNode;
  /** Show loading skeleton instead of value */
  loading?: boolean;
  /** Disable entrance animation */
  noAnimation?: boolean;
  /** Animation delay in milliseconds (for staggered reveals) */
  animationDelay?: number;
  /** Additional className for the card */
  className?: string;
  /** Click handler - makes the card interactive with hover state */
  onClick?: () => void;
}

// ============================================================================
// Color & Style Maps
// ============================================================================

const colorStyles: Record<
  StatCardColor,
  {
    bg: string;
    border: string;
    icon: string;
    iconBg: string;
  }
> = {
  blue: {
    bg: 'bg-blue-50/80',
    border: 'border-blue-100',
    icon: 'text-blue-500',
    iconBg: 'bg-blue-100',
  },
  violet: {
    bg: 'bg-violet-50/80',
    border: 'border-violet-100',
    icon: 'text-violet-500',
    iconBg: 'bg-violet-100',
  },
  green: {
    bg: 'bg-green-50/80',
    border: 'border-green-100',
    icon: 'text-green-500',
    iconBg: 'bg-green-100',
  },
  amber: {
    bg: 'bg-amber-50/80',
    border: 'border-amber-100',
    icon: 'text-amber-500',
    iconBg: 'bg-amber-100',
  },
  neutral: {
    bg: 'bg-neutral-50/80',
    border: 'border-neutral-100',
    icon: 'text-neutral-400',
    iconBg: 'bg-neutral-100',
  },
  rose: {
    bg: 'bg-rose-50/80',
    border: 'border-rose-100',
    icon: 'text-rose-500',
    iconBg: 'bg-rose-100',
  },
  cyan: {
    bg: 'bg-cyan-50/80',
    border: 'border-cyan-100',
    icon: 'text-cyan-500',
    iconBg: 'bg-cyan-100',
  },
};

const variantStyles: Record<StatCardVariant, string> = {
  default: 'text-neutral-900',
  danger: 'text-red-600',
  warning: 'text-amber-600',
  success: 'text-green-600',
};

const sizeStyles: Record<
  StatCardSize,
  {
    padding: string;
    label: string;
    value: string;
    icon: string;
    iconContainer: string;
    subvalue: string;
    skeleton: string;
  }
> = {
  sm: {
    padding: 'p-3',
    label: 'text-[10px]',
    value: 'text-lg',
    icon: 'h-3 w-3',
    iconContainer: 'p-1 rounded',
    subvalue: 'text-[10px]',
    skeleton: 'h-5 w-10',
  },
  base: {
    padding: 'p-4',
    label: 'text-xs',
    value: 'text-xl',
    icon: 'h-3.5 w-3.5',
    iconContainer: 'p-1.5 rounded-md',
    subvalue: 'text-xs',
    skeleton: 'h-7 w-14',
  },
  lg: {
    padding: 'p-5',
    label: 'text-[11px]',
    value: 'text-3xl',
    icon: 'h-4 w-4',
    iconContainer: 'p-2 rounded-lg',
    subvalue: 'text-[11px]',
    skeleton: 'h-9 w-20',
  },
};

// ============================================================================
// Animation
// ============================================================================

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

// ============================================================================
// Component
// ============================================================================

/**
 * A versatile stat card component for displaying metrics with optional
 * icons, loading states, animations, and color schemes.
 *
 * @example
 * // Basic usage
 * <StatCard label="Total Users" value={1234} icon={Users} color="blue" />
 *
 * @example
 * // With loading state
 * <StatCard label="Revenue" value={0} icon={DollarSign} loading />
 *
 * @example
 * // With pulse indicator and subvalue
 * <StatCard
 *   label="Active Sessions"
 *   value={42}
 *   icon={Activity}
 *   color="green"
 *   pulse
 *   subvalue="5 started in last hour"
 * />
 *
 * @example
 * // Large variant with custom content
 * <StatCard
 *   label="Performance Score"
 *   value={98}
 *   size="lg"
 *   variant="success"
 *   content={<Badge>Excellent</Badge>}
 * />
 */
export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(function StatCard(
  {
    label,
    value,
    icon: Icon,
    color = 'neutral',
    variant = 'default',
    size = 'base',
    pulse = false,
    pulseVariant = 'success',
    subvalue,
    subvalueSuccess = false,
    content,
    loading = false,
    noAnimation = false,
    animationDelay = 0,
    className,
    onClick,
  },
  ref
) {
  const colorStyle = colorStyles[color];
  const sizeStyle = sizeStyles[size];

  const formattedValue = typeof value === 'number' ? formatNumber(value) : value;

  const cardContent = (
    <Card
      className={cn(
        'h-full',
        sizeStyle.padding,
        colorStyle.bg,
        colorStyle.border,
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-[0.99]',
        className
      )}
      onClick={onClick}
    >
      {/* Header: Label + Icon */}
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(sizeStyle.label, 'font-medium text-neutral-500 uppercase tracking-wider')}
        >
          {label}
        </span>
        {Icon && (
          <div className={cn('relative', sizeStyle.iconContainer, colorStyle.iconBg)}>
            <Icon className={cn(sizeStyle.icon, colorStyle.icon)} />
            {pulse && <StatusDot variant={pulseVariant} size="md" pulse absolute bordered />}
          </div>
        )}
      </div>

      {/* Value Row */}
      {loading ? (
        <div
          className={cn(
            sizeStyle.skeleton,
            'rounded animate-pulse',
            color === 'neutral' ? 'bg-neutral-200' : 'bg-white/60'
          )}
        />
      ) : (
        <div className="flex items-center gap-2">
          <span
            className={cn(
              sizeStyle.value,
              'font-semibold tabular-nums tracking-tight block truncate',
              variantStyles[variant]
            )}
          >
            {formattedValue}
          </span>
          {content}
        </div>
      )}

      {/* Subvalue */}
      {subvalue && !loading && (
        <span
          className={cn(
            sizeStyle.subvalue,
            'mt-1 block truncate',
            subvalueSuccess ? 'text-green-600' : 'text-neutral-500'
          )}
        >
          {subvalue}
        </span>
      )}
    </Card>
  );

  if (noAnimation) {
    return (
      <div ref={ref} className="h-full">
        {cardContent}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className="h-full"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      transition={{
        duration: 0.3,
        delay: animationDelay / 1000,
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      {cardContent}
    </motion.div>
  );
});

// ============================================================================
// StatCards Container
// ============================================================================

export interface StatCardsProps {
  /** Array of stat card props to render */
  stats: StatCardProps[];
  /** Number of columns in the grid (defaults to stat count, max 6) */
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Gap between cards */
  gap?: 'sm' | 'md' | 'lg';
  /** Stagger animation delay between cards (ms) */
  staggerDelay?: number;
  /** Additional className for the container */
  className?: string;
}

const gapStyles: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
};

const columnStyles: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
  6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
};

/**
 * A container component that renders an array of stat cards in a responsive
 * grid with equal heights and optional staggered animations.
 *
 * @example
 * // Basic usage
 * <StatCards
 *   stats={[
 *     { label: 'Users', value: 1234, icon: Users, color: 'blue' },
 *     { label: 'Revenue', value: '$5,678', icon: DollarSign, color: 'green' },
 *     { label: 'Orders', value: 89, icon: ShoppingCart, color: 'violet' },
 *   ]}
 * />
 *
 * @example
 * // With explicit columns and stagger animation
 * <StatCards
 *   stats={stats}
 *   columns={4}
 *   staggerDelay={50}
 *   gap="md"
 * />
 */
export function StatCards({
  stats,
  columns,
  gap = 'md',
  staggerDelay = 40,
  className,
}: StatCardsProps) {
  const effectiveColumns = columns || (Math.min(stats.length, 6) as 1 | 2 | 3 | 4 | 5 | 6);

  return (
    <div
      className={cn(
        'grid items-stretch',
        columnStyles[effectiveColumns],
        gapStyles[gap],
        className
      )}
    >
      {stats.map((stat, index) => (
        <StatCard
          key={stat.label}
          {...stat}
          animationDelay={stat.animationDelay ?? index * staggerDelay}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Utility: Create stat card props from common patterns
// ============================================================================

/**
 * Helper to create stat card props with sensible defaults
 */
export function createStatCard(
  label: string,
  value: string | number,
  options?: Partial<Omit<StatCardProps, 'label' | 'value'>>
): StatCardProps {
  return {
    label,
    value,
    ...options,
  };
}
