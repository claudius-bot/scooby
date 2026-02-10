'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/avatar';
import { IconButton } from '@/components/button';
import { secondaryNav } from './nav-config';
import { Logo } from './logo';
import { PrimaryNav } from './primary-nav';
import { MoreDropdown } from './more-dropdown';
import { NavSearch } from './nav-search';
import { GatewayHealthBadge } from './gateway-health-badge';
import { MobileNav } from './mobile-nav';

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-neutral-200">
      <div className="max-w-[1400px] mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Logo + Navigation */}
          <div className="flex items-center gap-6">
            <Logo />
            <PrimaryNav pathname={pathname} />
            <MoreDropdown pathname={pathname} pendingCount={0} />
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <NavSearch />

            {/* Notifications */}
            <IconButton icon={<Bell className="h-4 w-4" />} size="sm" />

            {/* Secondary nav items */}
            {secondaryNav.map((item) => (
              <Link key={item.name} href={item.href} title={item.name}>
                <IconButton
                  icon={<item.icon className="h-4 w-4" />}
                  size="sm"
                  className={cn(
                    'p-1.5 rounded-md',
                    pathname === item.href
                      ? 'text-accent-600 bg-accent-50'
                      : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
                  )}
                />
              </Link>
            ))}

            {/* Status + User */}
            <div className="ml-2 flex items-center gap-2 pl-3 border-l border-neutral-200">
              {/* <GatewayHealthBadge
                status={gateway.status}
                onReconnect={gateway.connect}
                onShowTokenModal={gateway.showTokenModal}
                needsAuth={gateway.needsAuth}
              /> */}
              {/* User avatar placeholder */}
              <Avatar className="size-8 rounded-md bg-neutral-200" />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile navigation */}
      <MobileNav pathname={pathname} pendingCount={0} />
    </header>
  );
}

// Re-export components for direct imports if needed
export { Logo } from './logo';
export { PrimaryNav } from './primary-nav';
export { MoreDropdown } from './more-dropdown';
export { NavSearch } from './nav-search';
export { GatewayHealthBadge } from './gateway-health-badge';
export type { GatewayHealthBadgeProps } from './gateway-health-badge';
export { MobileNav } from './mobile-nav';
