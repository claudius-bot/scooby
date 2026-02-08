'use client';

import {
  useRef,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MessageThreadProps {
  children: ReactNode;
  isStreaming: boolean;
  messageCount: number;
}

export function MessageThread({ children, isStreaming, messageCount }: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const prevMessageCount = useRef(messageCount);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
    },
    [],
  );

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 100;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsNearBottom(nearBottom);
    setShowScrollBtn(!nearBottom);
  }, []);

  // Auto-scroll on new messages or streaming
  useEffect(() => {
    if (isNearBottom) {
      requestAnimationFrame(() => {
        scrollToBottom(isStreaming ? 'instant' : 'smooth');
      });
    }
  }, [messageCount, isStreaming, isNearBottom, scrollToBottom]);

  // Force scroll on new message send (messageCount jump)
  useEffect(() => {
    if (messageCount > prevMessageCount.current) {
      // New message was sent — check if it's a user message (count increased)
      const jumped = messageCount - prevMessageCount.current;
      if (jumped >= 2) {
        // User sent + assistant placeholder: force scroll
        requestAnimationFrame(() => scrollToBottom('instant'));
        setIsNearBottom(true);
      }
    }
    prevMessageCount.current = messageCount;
  }, [messageCount, scrollToBottom]);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-6"
      >
        <div className="mx-auto max-w-3xl">{children}</div>
      </div>

      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => {
              scrollToBottom('smooth');
              setIsNearBottom(true);
            }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex size-8 items-center justify-center rounded-full bg-white shadow-md border border-neutral-200 text-neutral-500 hover:text-neutral-700 transition-colors"
            aria-label="Scroll to bottom"
          >
            <ChevronDown className="size-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
