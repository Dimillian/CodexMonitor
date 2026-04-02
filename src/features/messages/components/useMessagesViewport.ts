import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { SCROLL_THRESHOLD_PX } from "../utils/messageRenderUtils";

type UseMessagesViewportArgs = {
  threadId: string | null;
  contentKey: string;
};

export function useMessagesViewport({
  threadId,
  contentKey,
}: UseMessagesViewportArgs) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const autoScrollEnabledRef = useRef(true);
  const waitingForBottomExitRef = useRef(false);
  const scrollingTimeoutRef = useRef<number | null>(null);
  const pendingScrollFrameRef = useRef<number | null>(null);
  const releaseProgrammaticScrollFrameRef = useRef<number | null>(null);
  const ignoreScrollEventsRef = useRef(false);

  const clearScrollingState = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      delete container.dataset.scrolling;
    }
    if (document.documentElement.dataset.codexScrolling === "true") {
      delete document.documentElement.dataset.codexScrolling;
    }
    if (scrollingTimeoutRef.current !== null) {
      window.clearTimeout(scrollingTimeoutRef.current);
      scrollingTimeoutRef.current = null;
    }
  }, []);

  const isNearBottom = useCallback(
    (node: HTMLDivElement) =>
      node.scrollHeight - node.scrollTop - node.clientHeight <= SCROLL_THRESHOLD_PX,
    [],
  );

  const canPinToBottom = useCallback(() => {
    return autoScrollEnabledRef.current;
  }, []);

  const cancelPendingAutoScroll = useCallback(() => {
    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
      pendingScrollFrameRef.current = null;
    }
    if (releaseProgrammaticScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(releaseProgrammaticScrollFrameRef.current);
      releaseProgrammaticScrollFrameRef.current = null;
    }
    ignoreScrollEventsRef.current = false;
  }, []);

  const scheduleScrollToBottom = useCallback(() => {
    if (pendingScrollFrameRef.current !== null) {
      return;
    }

    pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingScrollFrameRef.current = null;

      const container = containerRef.current;
      if (!container) {
        bottomRef.current?.scrollIntoView({ block: "end" });
        autoScrollEnabledRef.current = true;
        waitingForBottomExitRef.current = false;
        return;
      }

      const targetScrollTop = Math.max(
        container.scrollHeight - container.clientHeight,
        0,
      );
      const delta = Math.abs(container.scrollTop - targetScrollTop);
      if (delta <= 1) {
        autoScrollEnabledRef.current = true;
        waitingForBottomExitRef.current = false;
        return;
      }

      ignoreScrollEventsRef.current = true;
      container.scrollTop = targetScrollTop;
      autoScrollEnabledRef.current = true;
      waitingForBottomExitRef.current = false;

      if (releaseProgrammaticScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(releaseProgrammaticScrollFrameRef.current);
      }
      releaseProgrammaticScrollFrameRef.current = window.requestAnimationFrame(() => {
        ignoreScrollEventsRef.current = false;
        releaseProgrammaticScrollFrameRef.current = null;
      });
    });
  }, []);

  const requestAutoScroll = useCallback(() => {
    if (!canPinToBottom()) {
      return;
    }
    scheduleScrollToBottom();
  }, [canPinToBottom, scheduleScrollToBottom]);

  const updateAutoScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || ignoreScrollEventsRef.current) {
      return;
    }

    const nearBottom = isNearBottom(container);
    if (waitingForBottomExitRef.current) {
      if (!nearBottom) {
        waitingForBottomExitRef.current = false;
      }
      autoScrollEnabledRef.current = false;
    } else {
      autoScrollEnabledRef.current = nearBottom;
    }
    container.dataset.scrolling = "true";
    document.documentElement.dataset.codexScrolling = "true";

    if (scrollingTimeoutRef.current !== null) {
      window.clearTimeout(scrollingTimeoutRef.current);
    }
    scrollingTimeoutRef.current = window.setTimeout(() => {
      clearScrollingState();
    }, 140);
  }, [clearScrollingState, isNearBottom]);

  const handleUserScrollIntent = useCallback(() => {
    autoScrollEnabledRef.current = false;
    waitingForBottomExitRef.current = true;
    cancelPendingAutoScroll();
  }, [cancelPendingAutoScroll]);

  useLayoutEffect(() => {
    autoScrollEnabledRef.current = true;
    waitingForBottomExitRef.current = false;
    scheduleScrollToBottom();
  }, [scheduleScrollToBottom, threadId]);

  useLayoutEffect(() => {
    requestAutoScroll();
  }, [contentKey, requestAutoScroll]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!canPinToBottom()) {
        return;
      }
      scheduleScrollToBottom();
    });

    const container = containerRef.current;
    const content = contentRef.current;
    if (container) {
      observer.observe(container);
    }
    if (content) {
      observer.observe(content);
    }

    return () => {
      observer.disconnect();
    };
  }, [canPinToBottom, contentKey, scheduleScrollToBottom, threadId]);

  useEffect(() => {
    return () => {
      clearScrollingState();
      cancelPendingAutoScroll();
    };
  }, [cancelPendingAutoScroll, clearScrollingState]);

  return {
    bottomRef,
    containerRef,
    contentRef,
    handleUserScrollIntent,
    updateAutoScroll,
    requestAutoScroll,
  };
}
