'use client';

import { IconButton } from '../button';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { ArrowLeftIcon, PlusIcon, SearchIcon } from 'lucide-react';

type TitleActionHeaderSkeletonProps = {
  showBackButton?: boolean;
};

export function TitleActionHeaderSkeleton({
  showBackButton = false,
}: TitleActionHeaderSkeletonProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {showBackButton && (
            <div className="flex flex-col self-stretch justify-start shrink-0">
              <IconButton
                variant="muted"
                size="xs"
                className="shrink-0"
                icon={<ArrowLeftIcon className="h-4 w-4" />}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div>
              <Skeleton className="h-8 w-64" />
              <Skeleton className="mt-1 h-4 w-96" />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-8 w-40 lg:w-56 xl:w-64" />

          <Button variant="outline" size="icon" disabled>
            <PlusIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
