import { useCallback, useEffect, useRef, useState } from "react";
import type { ErrorToast } from "../../../services/toasts";
import { subscribeErrorToasts } from "../../../services/toasts";

const DEFAULT_ERROR_TOAST_DURATION_MS = 6000;

export function useErrorToasts() {
  const [toasts, setToasts] = useState<ErrorToast[]>([]);
  const timeoutByIdRef = useRef(new Map<string, number>());

  const dismissToast = useCallback((id: string) => {
    const timeoutId = timeoutByIdRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutByIdRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    const timeouts = timeoutByIdRef.current;
    const unsubscribe = subscribeErrorToasts((toast) => {
      setToasts((prev) => [...prev, toast]);
      const durationMs = toast.durationMs ?? DEFAULT_ERROR_TOAST_DURATION_MS;
      const timeoutId = window.setTimeout(() => {
        dismissToast(toast.id);
      }, durationMs);
      timeouts.set(toast.id, timeoutId);
    });

    return () => {
      unsubscribe();
      for (const timeoutId of timeouts.values()) {
        window.clearTimeout(timeoutId);
      }
      timeouts.clear();
    };
  }, [dismissToast]);

  return {
    errorToasts: toasts,
    dismissErrorToast: dismissToast,
  };
}
