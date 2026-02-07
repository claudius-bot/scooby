'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

const ranges = [
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: '1y', label: '1y' },
  { id: 'all', label: 'All' },
] as const;

export function DateRangeSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState('all');

  const currentRange = ranges.find((r) => r.id === selectedRange);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded-md border transition-all text-[13px] font-medium',
          'bg-white',
          isOpen
            ? 'border-neutral-300 ring-1 ring-neutral-200'
            : 'border-neutral-200 hover:border-neutral-300'
        )}
      >
        <span className="text-neutral-700">{currentRange?.label}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-neutral-400 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-md border border-neutral-200 shadow-lg py-1 min-w-[80px]">
            {ranges.map((range) => (
              <button
                key={range.id}
                onClick={() => {
                  setSelectedRange(range.id);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-[13px] transition-colors',
                  selectedRange === range.id
                    ? 'bg-neutral-100 text-neutral-900 font-medium'
                    : 'text-neutral-600 hover:bg-neutral-50'
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
