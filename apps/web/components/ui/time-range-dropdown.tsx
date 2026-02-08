'use client';

import { Calendar, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface TimeRange {
  id: string;
  label: string;
  days: number | null;
}

interface TimeRangeDropdownProps {
  ranges: readonly TimeRange[];
  value: string;
  onChange: (id: string) => void;
}

export function TimeRangeDropdown({ ranges, value, onChange }: TimeRangeDropdownProps) {
  const selectedRange = ranges.find((r) => r.id === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 text-[11px] text-neutral-500 hover:text-neutral-700 transition-colors px-2 py-1 rounded hover:bg-neutral-100 focus:outline-none">
          <Calendar className="h-3 w-3" />
          {selectedRange?.label}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {ranges.map((range) => (
            <DropdownMenuRadioItem
              key={range.id}
              value={range.id}
              className="text-[12px] cursor-pointer"
            >
              {range.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
