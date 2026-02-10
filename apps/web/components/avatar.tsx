import type { ComponentProps } from 'react';
import { memo } from 'react';
import { Avatar as DefaultAvatar, AvatarFallback } from './ui/avatar';
import { cn } from '../lib/utils';
import { BlurImage } from './blur-image';

// type AvatarProps = Omit<ComponentProps<typeof DefaultAvatar>, "children"> & {
//   name?: string | null;
//   src?: string | null;
//   width?: number;
// };

type AvatarProps = {
  name?: string | null;
  src?: string | null;
  width?: number;
  className?: string;
  children?: React.ReactNode;
  props?: ComponentProps<typeof DefaultAvatar>;
};
type AvatarTextProps = ComponentProps<typeof AvatarFallback>;
export const DICEBEAR_AVATAR_URL =
  'https://api.dicebear.com/7.x/initials/svg?backgroundType=gradientLinear&fontFamily=Helvetica&fontSize=40&seed=';

function PureAvatar({ name, src, className = 'rounded', width = 24, ...props }: AvatarProps) {
  if (src || name) {
    const alt = name ?? 'User';
    return (
      <DefaultAvatar
        className={cn('isolate size-6', !src && 'bg-muted', className)}
        // style={{
        //   width: width,
        //   height: width,
        // }}
        {...props}
      >
        {src && (
          <BlurImage
            src={
              src
                ? src.trimEnd()
                : `/api/image?url=${encodeURIComponent(DICEBEAR_AVATAR_URL + alt)}`
            }
            alt={alt ?? 'user'}
            className="z-10 h-full w-full flex-none overflow-hidden object-cover"
            width={width}
            height={width}
            referrerPolicy="no-referrer"
          />
        )}

        <AvatarFallback className="absolute inset-0 z-0 h-full w-full text-xs font-medium">
          {getInitials(alt)}
        </AvatarFallback>
      </DefaultAvatar>
    );
  }
  return (
    <DefaultAvatar className={cn('isolate', className)} {...props}>
      <BlurImage
        src={`/api/image?url=${DICEBEAR_AVATAR_URL}`}
        alt={'user'}
        className="z-10 h-full w-full flex-none overflow-hidden"
        width={width}
        height={width}
        referrerPolicy="no-referrer"
      />
      <AvatarFallback className="relative z-0 h-full w-full text-xs" />
    </DefaultAvatar>
  );
}
export const Avatar = memo(PureAvatar);

export const AvatarText = memo(function AvatarText({
  className = 'rounded',
  children,
  ...props
}: AvatarTextProps) {
  return (
    <DefaultAvatar className={cn('isolate size-6', className)} {...props}>
      <AvatarFallback className={cn('relative z-0 h-full w-full text-xs', className)} {...props}>
        {children}
      </AvatarFallback>
    </DefaultAvatar>
  );
});

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n, i) => (i < 2 ? n[0]?.toUpperCase() : ''))
    .join('');
}
