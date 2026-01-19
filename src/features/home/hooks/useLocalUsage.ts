import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalUsageSnapshot } from "../../../types";
import { localUsageSnapshot } from "../../../services/tauri";

type LocalUsageState = {
  snapshot: LocalUsageSnapshot | null;
  isLoading: boolean;
  error: string | null;
};

const emptyState: LocalUsageState = {
  snapshot: null,
  isLoading: false,
  error: null,
};

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function useLocalUsage(enabled: boolean) {
  const [state, setState] = useState<LocalUsageState>(emptyState);
  const requestIdRef = useRef(0);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [enabled]);

  const refresh = useCallback(() => {
    if (!enabledRef.current) {
      return Promise.resolve();
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    return localUsageSnapshot(30)
      .then((snapshot) => {
        if (requestIdRef.current !== requestId || !enabledRef.current) {
          return;
        }
        setState({ snapshot, isLoading: false, error: null });
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId || !enabledRef.current) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
      });
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    refresh()?.catch(() => {});
    const interval = window.setInterval(() => {
      refresh()?.catch(() => {});
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
    };
  }, [enabled, refresh]);

  return { ...state, refresh };
}
