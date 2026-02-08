'use client';

import { cn } from '../lib/utils';
import { useEffect, useState } from 'react';

export function BlurImage(
  props: React.ImgHTMLAttributes<HTMLImageElement> & {
    children?: React.ReactNode;
    unoptimized?: boolean;
  }
) {
  const { children, src: srcProp, alt, unoptimized = true, ...rest } = props;
  const [loading, setLoading] = useState(true);
  const [src, setSrc] = useState(srcProp);
  useEffect(() => setSrc(srcProp), [srcProp]); // update the `src` value when the `prop.src` value changes

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setLoading(false);
    const target = e.target as HTMLImageElement;
    if (target.naturalWidth <= 16 && target.naturalHeight <= 16) {
      setSrc(`https://avatar.vercel.sh/${encodeURIComponent(props.alt ?? '')}`);
    }
  };

  return (
    // biome-ignore lint/a11y/useAltText: <explanation>
    <img
      src={src}
      alt={alt}
      aria-label={alt}
      aria-labelledby={alt}
      className={cn(loading ? 'blur-[2px]' : 'blur-0', props.className)}
      onLoad={handleLoad}
      onError={() => {
        setSrc(`https://avatar.vercel.sh/${encodeURIComponent(props.alt ?? '')}`); // if the image fails to load, use the default avatar
      }}
      {...rest}
    />
  );
}
