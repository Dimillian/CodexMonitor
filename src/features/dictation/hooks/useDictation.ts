import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DictationEvent,
  DictationSessionState,
  DictationTranscript,
} from "../../../types";
import { cancelDictation, startDictation, stopDictation } from "../../../services/tauri";
import { subscribeDictationEvents } from "../../../services/events";

type UseDictationResult = {
  state: DictationSessionState;
  level: number;
  transcript: DictationTranscript | null;
  error: string | null;
  hint: string | null;
  start: (preferredLanguage: string | null) => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => Promise<void>;
  clearTranscript: (id: string) => void;
  clearError: () => void;
  clearHint: () => void;
};

export function useDictation(): UseDictationResult {
  const [state, setState] = useState<DictationSessionState>("idle");
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState<DictationTranscript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    void (async () => {
      try {
        const handler = await subscribeDictationEvents((event: DictationEvent) => {
          if (!active) {
            return;
          }
          if (event.type === "state") {
            setState(event.state);
            if (event.state === "idle") {
              setLevel(0);
            }
            return;
          }
          if (event.type === "level") {
            setLevel(event.value);
            return;
          }
          if (event.type === "transcript") {
            setTranscript({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              text: event.text,
            });
            return;
          }
          if (event.type === "error") {
            setError(event.message);
            return;
          }
          if (event.type === "canceled") {
            setHint(event.message);
            if (hintTimeoutRef.current) {
              window.clearTimeout(hintTimeoutRef.current);
            }
            hintTimeoutRef.current = window.setTimeout(() => {
              setHint(null);
              hintTimeoutRef.current = null;
            }, 2000);
            return;
          }
        });
        if (active) {
          unlisten = handler;
        } else {
          handler();
        }
      } catch {
        // Ignore dictation event errors.
      }
    })();

    return () => {
      active = false;
      if (unlisten) {
        unlisten();
      }
      if (hintTimeoutRef.current) {
        window.clearTimeout(hintTimeoutRef.current);
        hintTimeoutRef.current = null;
      }
    };
  }, []);

  const start = useCallback(async (preferredLanguage: string | null) => {
    setError(null);
    setHint(null);
    await startDictation(preferredLanguage);
  }, []);

  const stop = useCallback(async () => {
    await stopDictation();
  }, []);

  const cancel = useCallback(async () => {
    await cancelDictation();
  }, []);

  const clearTranscript = useCallback(
    (id: string) => {
      setTranscript((prev) => (prev?.id === id ? null : prev));
    },
    [],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearHint = useCallback(() => {
    setHint(null);
    if (hintTimeoutRef.current) {
      window.clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
  }, []);

  return {
    state,
    level,
    transcript,
    error,
    hint,
    start,
    stop,
    cancel,
    clearTranscript,
    clearError,
    clearHint,
  };
}
