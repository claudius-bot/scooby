import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[13px]',
          'ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'placeholder:text-neutral-400',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-300 focus-visible:bg-white',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-all',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
