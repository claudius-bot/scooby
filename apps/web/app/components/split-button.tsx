'use client';

import type * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Button, type buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

interface SplitButtonProps
  extends React.ComponentProps<'div'>, VariantProps<typeof buttonVariants> {
  children: React.ReactNode;
  onMainClick?: () => void;
  dropdownItems?: Array<{
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }>;
  dropdownContent?: React.ReactNode;
  disabled?: boolean;
}

function SplitButton({
  children,
  onMainClick,
  dropdownItems,
  dropdownContent,
  variant = 'default',
  size = 'default',
  disabled = false,
  className,
  ...props
}: SplitButtonProps) {
  return (
    <div className={cn('inline-flex divide-x', className)} {...props}>
      {/* Main CTA Button */}
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={onMainClick}
        className="rounded-none rounded-l-md border-r border-r-border/50 cursor-pointer"
      >
        {children}
      </Button>

      {/* Dropdown Arrow Button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            disabled={disabled}
            className="rounded-none rounded-r-md px-2 cursor-pointer"
          >
            <ChevronDownIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {dropdownContent
            ? dropdownContent
            : dropdownItems?.map((item, index) => (
                <DropdownMenuItem key={index} onClick={item.onClick} disabled={item.disabled}>
                  {item.label}
                </DropdownMenuItem>
              ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export { SplitButton };
