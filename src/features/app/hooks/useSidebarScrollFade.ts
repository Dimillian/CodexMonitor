import { useCallback, useEffect, useRef, useState } from "react";

type ScrollFadeState = {
  top: boolean;
  bottom: boolean;
};

export function useSidebarScrollFade(deps: ReadonlyArray<unknown>) {
  const sidebarBodyRef = useRef<HTMLDivElement | null>(null);
  const [scrollFade, setScrollFade] = useState<ScrollFadeState>({
    top: false,
    bottom: false,
  });

  const updateScrollFade = useCallback(() => {
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

  useEffect(() => {
    const frame = requestAnimationFrame(updateScrollFade);
    return () => cancelAnimationFrame(frame);
  }, [updateScrollFade, deps]);

  return { sidebarBodyRef, scrollFade, updateScrollFade };
}
