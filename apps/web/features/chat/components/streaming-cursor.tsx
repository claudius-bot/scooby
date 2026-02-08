'use client';

export function BouncingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-neutral-400"
          style={{
            animation: 'bounce-dot 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes bounce-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </span>
  );
}

export function BlinkingCursor() {
  return (
    <span
      className="ml-0.5 inline-block h-[1.1em] w-[2px] bg-neutral-800 align-text-bottom"
      style={{ animation: 'blink-cursor 1s step-end infinite' }}
    >
      <style>{`
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </span>
  );
}
