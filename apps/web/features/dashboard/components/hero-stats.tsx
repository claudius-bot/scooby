import { cn, formatNumber } from '@/lib/utils';
import { ReactNode } from 'react';

export function HeroStats({
  stats,
}: {
  stats: {
    label: string;
    value: string | number;
    content?: ReactNode;
    subvalue?: string;
    variant?: 'default' | 'danger' | 'warning';
    size?: 'base' | 'lg';
  }[];
}) {
  return (
    <div className="bg-white rounded-lg border border-neutral-200">
      <div className="grid grid-cols-5 divide-x divide-neutral-100">
        {stats.map(({ size, label, value, content, subvalue, variant }, index) => {
          if (size === 'lg') {
            return (
              <div key={label} className="col-span-2 p-4">
                <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
                  {label}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-3xl font-semibold text-neutral-900 tabular-nums tracking-tight">
                    {typeof value === 'number' ? formatNumber(value) : value}
                  </span>
                  {content}
                </div>
                {!!subvalue && <p className="text-[11px] text-neutral-400 mt-1">{subvalue}</p>}
              </div>
            );
          }
          return (
            <StatItem
              key={label}
              label={label}
              value={typeof value === 'number' ? formatNumber(value) : value}
              subvalue={subvalue}
              variant={variant}
              content={content}
              className={cn(index === 0 && stats.length < 5 && 'col-span-2')}
            />
          );
        })}
      </div>
    </div>
  );
}

function StatItem({
  label,
  value,
  subvalue,
  content,
  variant = 'default',
  className,
}: {
  label: string;
  value: string;
  subvalue?: string;
  content?: ReactNode;
  variant?: 'default' | 'danger' | 'warning';
  className?: string;
}) {
  return (
    <div className={cn('p-4', className)}>
      <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2">
        <p
          className={cn(
            'text-xl font-semibold tabular-nums mt-1',
            variant === 'danger' && 'text-red-600',
            variant === 'warning' && 'text-amber-600',
            variant === 'default' && 'text-neutral-900'
          )}
        >
          {value}
        </p>
        {content}
      </div>
      {!!subvalue && <p className="text-[11px] text-neutral-400 mt-0.5">{subvalue}</p>}
    </div>
  );
}
