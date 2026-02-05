import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return;
    }
    let cancelled = false;
    const handle = globalThis.setTimeout(() => {
      if (cancelled) {
        return;
      }

      // During test teardown, jsdom may be removed before pending timers flush.
      // Avoid scheduling a React state update when no browser window exists.
      if (typeof window === "undefined") {
        return;
      }

      setDebounced(value);
    }, delayMs);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(handle);
    };
  }, [delayMs, value]);

  return debounced;
}
