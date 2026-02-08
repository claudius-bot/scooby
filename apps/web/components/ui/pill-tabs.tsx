'use client';

import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PillTabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ElementType;
  /** Extra content rendered after the label (e.g. a count badge). */
  right?: ReactNode;
}

interface PillTabsProps<T extends string = string> {
  items: PillTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PillTabs<T extends string = string>({
  items,
  value,
  onChange,
  className,
}: PillTabsProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState({ left: 0, width: 0 });
  const [ready, setReady] = useState(false);

  const activeIndex = items.findIndex((item) => item.id === value);

  const measure = useCallback(() => {
    if (!containerRef.current || activeIndex === -1) return;
    const buttons = containerRef.current.querySelectorAll<HTMLElement>('[data-pill-tab]');
    const active = buttons[activeIndex];
    if (active) {
      setHighlight({ left: active.offsetLeft, width: active.offsetWidth });
      setReady(true);
    }
  }, [activeIndex]);

  useEffect(() => {
    measure();
  }, [measure]);

  // Re-measure on resize so the highlight stays aligned.
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative inline-flex items-center rounded-md bg-neutral-100 p-1 gap-0.5',
        className,
      )}
    >
      {/* Animated highlight */}
      {ready && activeIndex !== -1 && highlight.width > 0 && (
        <motion.div
          className="absolute h-[calc(100%-8px)] rounded bg-white shadow-sm"
          initial={false}
          animate={{ left: highlight.left, width: highlight.width }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}

      {items.map((item) => {
        const isActive = item.id === value;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            data-pill-tab
            onClick={() => onChange(item.id)}
            className={cn(
              'relative z-10 flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[13px] font-medium transition-colors cursor-pointer',
              isActive ? 'text-neutral-900' : 'text-neutral-500 hover:text-neutral-700',
            )}
          >
            {Icon && (
              <Icon
                className={cn('h-3.5 w-3.5', isActive && 'text-accent-600')}
              />
            )}
            {item.label}
            {item.right}
          </button>
        );
      })}
    </div>
  );
}
