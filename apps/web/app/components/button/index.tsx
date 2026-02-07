import type React from 'react';
import { Fragment, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { Spinner } from '../spinner';
import { Tooltip } from '../tooltip';
import {
  Button as ButtonWithChildren,
  buttonVariants as defaultButtonVariants,
} from '@/components/ui/button';

const textVariants = cva('min-w-0 truncate font-medium', {
  variants: {
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      default: '',
      lg: '',
      icon: '',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

const buttonVariants = cva(
  "cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground border-primary shadow-xs hover:bg-primary/90 hover:ring-4 hover:ring-neutral-200',
        brand:
          'bg-brand text-brand-foreground border-brand shadow-xs hover:bg-brand/90 hover:ring-4 hover:ring-neutral-200',
        destructive:
          'bg-destructive text-white border-destructive shadow-xs hover:bg-destructive/90 hover:ring-4 hover:ring-destructive/20 focus-visible:ring-destructive/20',
        'destructive-outline':
          'border border-destructive/20 text-destructive bg-background shadow-xs hover:bg-[#ffe4e4] hover:border-destructive/40',
        outline:
          'border border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary:
          'border-border bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost:
          'border-transparent hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
        muted:
          'border-muted bg-muted text-muted-foreground hover:bg-muted/90 hover:ring-4 hover:ring-neutral-200',
        'muted-1':
          'border-muted-1 bg-muted-1 text-muted-1-foreground hover:bg-muted-1/90 hover:ring-4 hover:ring-neutral-200',
        background:
          'border-background bg-background text-foreground hover:bg-muted hover:ring-4 hover:ring-muted-0',
        foreground:
          'border-foreground bg-foreground text-background hover:bg-foreground-hover hover:ring-4 hover:ring-neutral-200',
      },
      size: {
        icon: 'h-[28px] p-1 rounded-md gap-2',
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: 'h-8 px-2 gap-2',
        sm: 'h-9 px-3 gap-2',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
const iconButtonVariants = cva(
  "cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground border-primary shadow-xs hover:bg-primary/90 hover:ring-4 hover:ring-neutral-200',
        brand:
          'bg-brand text-brand-foreground border-brand shadow-xs hover:bg-brand/90 hover:ring-4 hover:ring-neutral-200',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        'destructive-outline':
          'border border-destructive/20 text-destructive bg-background shadow-xs hover:bg-[#ffe4e4] hover:border-destructive/40',
        outline:
          'border border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary:
          'border-border bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost:
          'border-transparent hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
        muted:
          'border-muted bg-muted text-muted-foreground hover:bg-muted/90 hover:ring-4 hover:ring-neutral-200',
        accent:
          'border-border bg-accent shadow-xs text-muted-foreground hover:bg-background hover:ring-4 hover:ring-neutral-200',
        'muted-1':
          'border-muted-1 bg-muted-1 text-muted-1-foreground hover:bg-muted-1/90 hover:ring-4 hover:ring-neutral-200',
        background:
          'border-background bg-background text-foreground hover:bg-muted hover:ring-4 hover:ring-muted-0',
        foreground:
          'border-foreground bg-foreground text-background hover:bg-foreground-hover hover:ring-4 hover:ring-neutral-200',
      },
      size: {
        xs: 'h-[28px] w-[28px] p-1 rounded-md',
        icon: 'h-8 w-8 gap-2',
        sm: 'h-9 w-9 gap-2',
        default: 'h-10 w-10 gap-2',
        lg: 'h-12 w-12 gap-2',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof defaultButtonVariants> & {
    text?: ReactNode | string;
    textWrapperClassName?: string;
    loading?: boolean;
    icon?: ReactNode;
    shortcut?: string;
    right?: ReactNode;
    disabledTooltip?: string | ReactNode;
    tooltip?: string | ReactNode;
    asChild?: boolean;
    children?: never;
  };

function Button({
  className,
  variant,
  size,
  text,
  textWrapperClassName,
  loading,
  icon,
  shortcut,
  disabledTooltip,
  tooltip,
  right,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? 'div' : 'button';

  if (tooltip) {
    return (
      <Tooltip content={tooltip}>
        {/* @ts-ignore */}
        <Comp
          // if onClick is passed, it's a "button" type, otherwise it's being used in a form, hence "submit"
          type={props.onClick ? 'button' : 'submit'}
          className={cn(
            'group flex items-center justify-center whitespace-nowrap rounded-md border text-sm',
            defaultButtonVariants({ variant, size }),
            (props.disabled || loading) &&
              'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed outline-none pointer-events-none',
            props.disabled && 'pointer-events-none',
            className
          )}
          disabled={props.disabled || loading}
          {...props}
        >
          {icon}
          {text && (
            <div
              className={cn(
                'min-w-0 truncate shrink',
                shortcut && 'flex-1 text-left',

                textWrapperClassName
              )}
            >
              {text}
            </div>
          )}

          {shortcut && (
            <kbd
              className={cn(
                'shrink-0 border-gray-200 bg-gray-100 text-gray-400 hidden rounded border px-2 py-0.5 text-xs font-light md:inline-block',
                {
                  'bg-gray-100': variant?.endsWith('outline'),
                }
              )}
            >
              {shortcut}
            </kbd>
          )}
          {right}
        </Comp>
      </Tooltip>
    );
  }
  return (
    // @ts-ignore
    <Comp
      // if onClick is passed, it's a "button" type, otherwise it's being used in a form, hence "submit"
      type={props.onClick ? 'button' : 'submit'}
      className={cn(
        'group flex items-center justify-center whitespace-nowrap rounded-md border text-sm',
        defaultButtonVariants({ variant, size }),
        (props.disabled || loading) &&
          'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed outline-none pointer-events-none',
        props.disabled && 'pointer-events-none',
        className
      )}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading ? <Spinner /> : icon ? icon : null}
      {text && (
        <div
          className={cn(
            textVariants({ size }),
            shortcut && 'flex-1 text-left',
            textWrapperClassName
          )}
        >
          {text}
        </div>
      )}

      {shortcut && (
        <kbd
          className={cn(
            'hidden rounded px-2 py-0.5 text-xs font-light transition-all duration-75 md:inline-block',
            {
              'bg-gray-700 text-gray-400 group-hover:bg-gray-600 group-hover:text-gray-300':
                variant === 'default',
              'bg-gray-200 text-gray-400 group-hover:bg-gray-100 group-hover:text-gray-500':
                variant === 'secondary',
              'bg-gray-100 text-gray-500 group-hover:bg-gray-200': variant === 'outline',
              'bg-red-100 text-red-600 group-hover:bg-red-500 group-hover:text-white':
                variant === 'destructive',
            }
          )}
        >
          {shortcut}
        </kbd>
      )}
      {right}
    </Comp>
  );
}
export type IconButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof iconButtonVariants> & {
    childrenWrapperClassName?: string;
    loading?: boolean;
    icon?: ReactNode;
    shortcut?: string;
    right?: ReactNode;
    disabledTooltip?: string | ReactNode;
    tooltip?: string | ReactNode;
    asChild?: boolean;
  };

function IconButton({
  className,
  variant,
  size,
  children,
  childrenWrapperClassName,
  loading,
  icon,
  shortcut,
  disabledTooltip,
  tooltip,
  right,
  asChild = false,
  ...props
}: IconButtonProps) {
  if (tooltip) {
    return (
      <Tooltip content={tooltip} delayDuration={200} contentClassName="px-2 py-1 rounded-sm">
        <button
          // if onClick is passed, it's a "button" type, otherwise it's being used in a form, hence "submit"
          type={props.onClick ? 'button' : 'submit'}
          className={cn(
            'group flex items-center justify-center whitespace-nowrap rounded-md border text-sm',
            iconButtonVariants({ variant, size }),
            (props.disabled || loading) && 'opacity-50 cursor-not-allowed outline-none ',
            className
          )}
          disabled={props.disabled || loading}
          {...props}
        >
          {icon}
          {children && (
            <div
              className={cn(
                props.disabled && 'pointer-events-none',
                iconButtonVariants({ size, variant }),
                shortcut && 'flex-1 text-left ',
                childrenWrapperClassName
              )}
            >
              {children}
            </div>
          )}
          {shortcut && (
            <kbd
              className={cn(
                'border-gray-200 bg-gray-100 text-gray-400 hidden rounded border px-2 py-0.5 text-xs font-light md:inline-block',
                {
                  'bg-gray-100': variant?.endsWith('outline'),
                }
              )}
            >
              {shortcut}
            </kbd>
          )}
          {right}
        </button>
      </Tooltip>
    );
  }
  return (
    <button
      // if onClick is passed, it's a "button" type, otherwise it's being used in a form, hence "submit"
      type={props.onClick ? 'button' : 'submit'}
      className={cn(
        'group flex items-center justify-center whitespace-nowrap rounded-md border text-sm',
        iconButtonVariants({ variant, size }),
        (props.disabled || loading) &&
          'opacity-50 cursor-not-allowed outline-none pointer-events-none',
        className
      )}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {icon}
      {children && (
        <div
          className={cn(
            props.disabled && 'pointer-events-none',
            iconButtonVariants({ size, variant }),
            shortcut && 'flex-1 text-left',
            childrenWrapperClassName
          )}
        >
          {children}
        </div>
      )}
      {shortcut && (
        <kbd
          className={cn(
            'hidden rounded px-2 py-0.5 text-xs font-light transition-all duration-75 md:inline-block',
            {
              'bg-gray-700 text-gray-400 group-hover:bg-gray-600 group-hover:text-gray-300':
                variant === 'default',
              'bg-gray-200 text-gray-400 group-hover:bg-gray-100 group-hover:text-gray-500':
                variant === 'secondary',
              'bg-gray-100 text-gray-500 group-hover:bg-gray-200': variant === 'outline',
              'bg-red-100 text-red-600 group-hover:bg-red-500 group-hover:text-white':
                variant === 'destructive',
            }
          )}
        >
          {shortcut}
        </kbd>
      )}
      {right}
    </button>
  );
}

export { Button, buttonVariants, IconButton, iconButtonVariants, ButtonWithChildren };
