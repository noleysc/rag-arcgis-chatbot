import { useCallback, useLayoutEffect, useRef } from "react";
import type { ChatMessage } from "../types";

// Gap left above the answer when it's pinned to the top of the view.
const TOP_GAP = 16;

// When a new answer starts, scrolls so the top of that answer sits at the
// top of the view, and holds it there while it streams: the reader starts at
// the beginning instead of being dragged to the bottom. Until the answer is
// tall enough to reach the top, the view advances as far as it can. Any
// manual scroll (wheel, touch, keys, scrollbar) releases the pin for that
// answer, so we never fight the user.
//
// Assumes the scroller's children are exactly the message rows, in order.
export function useAnswerScroll<T extends HTMLElement>(messages: ChatMessage[]) {
  const ref = useRef<T | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const pinnedRef = useRef(false);

  const release = useCallback(() => {
    pinnedRef.current = false;
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    const last = messages[messages.length - 1];
    if (!el || !last) return;

    if (last.id !== lastIdRef.current) {
      lastIdRef.current = last.id;
      pinnedRef.current = last.role === "bot";
    }
    if (!pinnedRef.current) return;

    const row = el.lastElementChild;
    if (!row) return;
    const top = el.scrollTop + row.getBoundingClientRect().top - el.getBoundingClientRect().top - TOP_GAP;
    // "instant": #messages has scroll-behavior: smooth, and restarting an
    // animation on every streamed token would jitter.
    el.scrollTo({ top, behavior: "instant" });
  }, [messages]);

  return {
    ref,
    scrollHandlers: {
      onWheel: release,
      onTouchMove: release,
      onKeyDown: release,
      onPointerDown: release,
    },
  };
}
