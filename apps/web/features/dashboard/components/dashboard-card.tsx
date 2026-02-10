'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MoreHorizontal, ArrowUpRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

export interface CardMenuItem {
  label: string;
  onClick: () => void;
  active?: boolean;
}

interface DashboardCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  expandable?: boolean;
  more?: CardMenuItem[];
}

export function DashboardCard({
  title,
  subtitle,
  children,
  className,
  action,
  expandable = false,
  more,
}: DashboardCardProps) {
  return (
    <div className={cn('bg-white rounded-lg border border-neutral-200 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
          {subtitle && <span className="text-[12px] text-neutral-400">{subtitle}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          {action}
          {expandable && (
            <button className="p-1 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
          {!!more?.length && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors focus:outline-none">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                {more.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    onClick={item.onClick}
                    className={cn(
                      'text-[12px] cursor-pointer',
                      item.active && 'font-semibold text-neutral-900'
                    )}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">{children}</div>
    </div>
  );
}
