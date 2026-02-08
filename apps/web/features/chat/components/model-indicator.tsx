'use client';

import { Zap, Brain } from 'lucide-react';

interface ModelIndicatorProps {
  modelGroup: 'fast' | 'slow';
}

export function ModelIndicator({ modelGroup }: ModelIndicatorProps) {
  if (modelGroup === 'slow') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-600 border border-purple-200">
        <Brain className="size-3" />
        Deep thinking
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
      <Zap className="size-3" />
      Fast
    </span>
  );
}
