import { cn } from '../lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';
import type { ReactNode } from 'react';

const badgeVariants = cva(
  'max-w-fit whitespace-nowrap rounded-full border px-2 py-0.5 font-medium text-xs flex items-center gap-1',
  {
    variants: {
      variant: {
        default: 'border-gray-400 text-gray-500',
        outline: 'border-gray-400 text-gray-500',
        muted: 'border-muted bg-muted text-muted-foreground',
        violet: 'border-violet-600 bg-violet-600 text-white',
        blue: 'border-blue-100 bg-blue-100 text-blue-800',
        green: 'border-green-100 bg-green-100 text-green-800',
        yellow: 'border-yellow-100 bg-yellow-100 text-yellow-800',
        orange: 'border-orange-100 bg-orange-100 text-orange-800',
        red: 'border-red-100 bg-red-100 text-red-800',
        pink: 'border-pink-100 bg-pink-100 text-pink-800',
        purple: 'border-purple-100 bg-purple-100 text-purple-800',
        sky: 'border-sky-100 bg-sky-100 text-sky-800',
        black: 'border-black bg-black text-white',
        gray: 'border-gray-200 bg-gray-100 text-gray-800',
        neutral: 'border-gray-400 text-gray-500',
        blueGradient:
          'border border-blue-200 bg-gradient-to-r from-blue-100 via-blue-100/50 to-blue-100 text-blue-900',
        rainbow: 'border-transparent bg-gradient-to-r from-violet-600 to-pink-600 text-white',
      },
      size: {
        default: 'text-xs',
        xs: 'text-[8px] gap-0.5 px-1 py-0.5',
        sm: 'text-xs',
        md: 'text-sm px-2.5',
        lg: 'text-base px-3 py-1',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'default',
    },
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  text?: ReactNode | string;
  textWrapperClassName?: string;
  icon?: ReactNode;
  shortcut?: string;
  right?: ReactNode;
  size?: 'default' | 'xs' | 'sm' | 'md' | 'lg';
}

function Badge({
  className,
  variant,
  text,
  textWrapperClassName,
  icon,
  shortcut,
  right,
  size,
  ...props
}: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {icon}
      {text && (
        <span
          className={cn(
            'min-w-0 truncate shrink text-sm/4',
            shortcut && 'flex-1 text-left',
            size === 'xs' && 'text-[10px]',
            textWrapperClassName
          )}
        >
          {text}
        </span>
      )}
      {shortcut}
      {right}
    </div>
  );
}

export { Badge, badgeVariants };

export type { BadgeProps };
