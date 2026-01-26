import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeMenuQuit } from "../../../services/events";
import { ackMenuQuit, requestAppQuit } from "../../../services/tauri";
import { useTauriEvent } from "./useTauriEvent";

export type QuitHoldState = {
  isVisible: boolean;
  progress: number;
  status: "idle" | "holding" | "canceled";
};

type UseHoldToQuitOptions = {
  enabled: boolean;
};

const HOLD_DURATION_MS = 1500;
const HOLD_TICK_MS = 50;
const CANCEL_HIDE_DELAY_MS = 900;
const MENU_WINDOW_MS = 500;
let quitInProgress = false;

const defaultState: QuitHoldState = {
  isVisible: false,
  progress: 0,
  status: "idle",
};

function detectMacPlatform() {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function useHoldToQuit({ enabled }: UseHoldToQuitOptions) {
  const [state, setState] = useState<QuitHoldState>(defaultState);
  const isMac = useMemo(() => detectMacPlatform(), []);
  const holdStartedAtRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const quitRequestedRef = useRef(false);
  const lastCmdQRef = useRef<number | null>(null);
  const isHoldingRef = useRef(false);

  useEffect(() => {
    isHoldingRef.current = state.status === "holding";
  }, [state.status]);

  const clearHoldInterval = useCallback(() => {
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimeout();
    hideTimeoutRef.current = window.setTimeout(() => {
      setState(defaultState);
    }, CANCEL_HIDE_DELAY_MS);
  }, [clearHideTimeout]);

  const cancelHold = useCallback(() => {
    if (holdStartedAtRef.current === null) {
      return;
    }
    holdStartedAtRef.current = null;
    clearHoldInterval();
    setState({ isVisible: true, progress: 0, status: "canceled" });
    scheduleHide();
  }, [clearHoldInterval, scheduleHide]);

  const startHold = useCallback(() => {
    if (holdStartedAtRef.current !== null || quitInProgress) {
      return;
    }
    clearHideTimeout();
    holdStartedAtRef.current = Date.now();
    quitRequestedRef.current = false;
    setState({ isVisible: true, progress: 0, status: "holding" });
    clearHoldInterval();
    holdIntervalRef.current = window.setInterval(() => {
      if (holdStartedAtRef.current === null) {
        return;
      }
      const elapsedMs = Date.now() - holdStartedAtRef.current;
      const progress = Math.min(1, elapsedMs / HOLD_DURATION_MS);
      setState({ isVisible: true, progress, status: "holding" });
      if (progress >= 1 && !quitRequestedRef.current && !quitInProgress) {
        quitRequestedRef.current = true;
        quitInProgress = true;
        holdStartedAtRef.current = null;
        clearHoldInterval();
        void requestAppQuit()
          .catch(() => {
            setState({ isVisible: true, progress: 0, status: "canceled" });
            scheduleHide();
          })
          .finally(() => {
            quitInProgress = false;
          });
      }
    }, HOLD_TICK_MS);
  }, [clearHideTimeout, clearHoldInterval, scheduleHide]);

  useEffect(() => {
    if (!isMac || !enabled) {
      holdStartedAtRef.current = null;
      clearHoldInterval();
      clearHideTimeout();
      setState(defaultState);
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.key.toLowerCase() !== "q") {
        return;
      }
      event.preventDefault();
      lastCmdQRef.current = Date.now();
      if (!event.repeat) {
        startHold();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (holdStartedAtRef.current === null) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "q" || event.key === "Meta") {
        cancelHold();
      }
    };

    const handleBlur = () => {
      cancelHold();
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
      clearHoldInterval();
      clearHideTimeout();
    };
  }, [cancelHold, clearHideTimeout, clearHoldInterval, enabled, isMac, startHold]);

  useTauriEvent(
    subscribeMenuQuit,
    () => {
      void ackMenuQuit();
      if (!enabled || !isMac) {
        void requestAppQuit();
        return;
      }
      if (isHoldingRef.current) {
        return;
      }
      const lastCmdQ = lastCmdQRef.current;
      if (lastCmdQ && Date.now() - lastCmdQ <= MENU_WINDOW_MS) {
        startHold();
      } else {
        void requestAppQuit();
      }
    },
    { enabled: enabled && isMac },
  );

  return { state };
}
