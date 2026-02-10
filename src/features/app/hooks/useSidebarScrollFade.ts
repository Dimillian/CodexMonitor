import { useCallback, useEffect, useRef, useState } from "react";

type ScrollFadeState = {
  top: boolean;
  bottom: boolean;
};

export function useSidebarScrollFade(deps: ReadonlyArray<unknown>) {
  const sidebarBodyRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [scrollFade, setScrollFade] = useState<ScrollFadeState>({
    top: false,
    bottom: false,
  });

  const computeFade = useCallback(() => {
    rafRef.current = null;
    const node = sidebarBodyRef.current;
    if (!node) {
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = node;
    const canScroll = scrollHeight > clientHeight;
    const next = {
      top: canScroll && scrollTop > 0,
      bottom: canScroll && scrollTop + clientHeight < scrollHeight - 1,
    };
    setScrollFade((prev) =>
      prev.top === next.top && prev.bottom === next.bottom ? prev : next,
    );
  }, []);

  // Throttle scroll handler with requestAnimationFrame
  const updateScrollFade = useCallback(() => {
    if (rafRef.current !== null) {
      return; // already scheduled
    }
    rafRef.current = requestAnimationFrame(computeFade);
  }, [computeFade]);

  useEffect(() => {
    const frame = requestAnimationFrame(computeFade);
    return () => {
      cancelAnimationFrame(frame);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [computeFade, deps]);

  return { sidebarBodyRef, scrollFade, updateScrollFade };
}
