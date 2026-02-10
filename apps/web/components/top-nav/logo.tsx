'use client';

import Link from 'next/link';
import { Activity } from 'lucide-react';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 group">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 group-hover:bg-neutral-800 transition-colors">
        <Activity className="h-4 w-4 text-white" />
      </div>
      <div className="hidden sm:flex items-baseline gap-0.5">
        <span className="text-[14px] font-semibold text-neutral-900 tracking-tight">
          Clawdbot
        </span>
        <span className="text-[14px] font-normal text-neutral-400 tracking-tight">
          Command
        </span>
      </div>
    </Link>
  );
}
