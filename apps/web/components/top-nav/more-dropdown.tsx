'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { operationsNav, adminNav, developerNav } from './nav-config';

interface MoreDropdownProps {
  pathname: string;
  pendingCount: number;
}

export function MoreDropdown({ pathname, pendingCount }: MoreDropdownProps) {
  const [showMore, setShowMore] = useState(false);

  // Check if current path is in any secondary nav
  const isInOperations = operationsNav.some(
    (item) => pathname === item.href || pathname.startsWith(item.href)
  );
  const isInAdmin = adminNav.some(
    (item) => pathname === item.href || pathname.startsWith(item.href)
  );
  const isInDeveloper = developerNav.some(
    (item) => pathname === item.href || pathname.startsWith(item.href)
  );

  const isActive = isInOperations || isInAdmin || isInDeveloper;

  return (
    <div className="relative">
      <button
        onClick={() => setShowMore(!showMore)}
        className={cn(
          'flex items-center gap-1 px-2.5 py-1.5 h-8 rounded-md text-[13px] font-medium transition-colors',
          isActive
            ? 'text-neutral-900 bg-neutral-100'
            : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
        )}
      >
        More
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showMore && 'rotate-180')} />
        {pendingCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full">
            {pendingCount}
          </span>
        )}
      </button>

      {/* Dropdown menu */}
      {showMore && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMore(false)} />
          <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 py-1">
            {/* Operations */}
            <NavSection
              title="Operations"
              items={operationsNav}
              pathname={pathname}
              onItemClick={() => setShowMore(false)}
            />

            <div className="my-1 border-t border-neutral-100" />

            {/* Admin */}
            <NavSection
              title="Admin"
              items={adminNav}
              pathname={pathname}
              pendingCount={pendingCount}
              onItemClick={() => setShowMore(false)}
            />

            <div className="my-1 border-t border-neutral-100" />

            {/* Developer */}
            <NavSection
              title="Developer"
              items={developerNav}
              pathname={pathname}
              onItemClick={() => setShowMore(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}

interface NavSectionProps {
  title: string;
  items: typeof operationsNav;
  pathname: string;
  pendingCount?: number;
  onItemClick: () => void;
}

function NavSection({ title, items, pathname, pendingCount, onItemClick }: NavSectionProps) {
  return (
    <>
      <div className="px-3 py-1.5">
        <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wide">
          {title}
        </span>
      </div>
      {items.map((item) => (
        <Link
          key={item.name}
          href={item.href}
          onClick={onItemClick}
          className={cn(
            'flex items-center gap-2 px-3 py-2 text-[13px] transition-colors',
            pathname === item.href || pathname.startsWith(item.href)
              ? 'text-neutral-900 bg-neutral-50'
              : 'text-neutral-600 hover:bg-neutral-50'
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.name}
          {!!item.badge && !!pendingCount && pendingCount > 0 && (
            <span className="ml-auto px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full">
              {pendingCount}
            </span>
          )}
        </Link>
      ))}
    </>
  );
}
