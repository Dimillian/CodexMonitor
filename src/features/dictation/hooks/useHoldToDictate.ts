import { useEffect, useRef } from "react";
import { matchesHoldKey } from "../../../utils/keys";
import type { DictationSessionState } from "../../../types";

type UseHoldToDictateArgs = {
  enabled: boolean;
  ready: boolean;
  state: DictationSessionState;
  preferredLanguage: string | null;
  holdKey: string;
  startDictation: (preferredLanguage: string | null) => void | Promise<void>;
  stopDictation: () => void | Promise<void>;
  cancelDictation: () => void | Promise<void>;
};

const HOLD_STOP_GRACE_MS = 1500;

export function useHoldToDictate({
  enabled,
  ready,
  state,
  preferredLanguage,
  holdKey,
  startDictation,
  stopDictation,
  cancelDictation,
}: UseHoldToDictateArgs) {
  const holdDictationActive = useRef(false);
  const holdDictationStopPending = useRef(false);
  const holdDictationStopTimeout = useRef<number | null>(null);

  useEffect(() => {
    const safeInvoke = (action: () => void | Promise<void>) => {
      try {
        void Promise.resolve(action()).catch(() => {
          // Errors are surfaced through dictation events.
        });
      } catch {
        // Errors are surfaced through dictation events.
      }
    };

    const normalizedHoldKey = holdKey.toLowerCase();
    if (!normalizedHoldKey) {
      return;
    }

    if (holdDictationStopPending.current && state === "listening") {
      holdDictationStopPending.current = false;
      if (holdDictationStopTimeout.current !== null) {
        window.clearTimeout(holdDictationStopTimeout.current);
        holdDictationStopTimeout.current = null;
      }
      safeInvoke(stopDictation);
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!matchesHoldKey(event, normalizedHoldKey) || event.repeat) {
        return;
      }
      if (!enabled || !ready) {
        return;
      }
      if (state !== "idle") {
        return;
      }
      holdDictationActive.current = true;
      holdDictationStopPending.current = false;
      if (holdDictationStopTimeout.current !== null) {
        window.clearTimeout(holdDictationStopTimeout.current);
        holdDictationStopTimeout.current = null;
      }
      safeInvoke(() => startDictation(preferredLanguage));
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!matchesHoldKey(event, normalizedHoldKey)) {
        return;
      }
      if (!holdDictationActive.current) {
        return;
      }
      holdDictationActive.current = false;
      holdDictationStopPending.current = true;
      if (holdDictationStopTimeout.current !== null) {
        window.clearTimeout(holdDictationStopTimeout.current);
      }
      holdDictationStopTimeout.current = window.setTimeout(() => {
        holdDictationStopPending.current = false;
        holdDictationStopTimeout.current = null;
      }, HOLD_STOP_GRACE_MS);
      if (state === "listening") {
        holdDictationStopPending.current = false;
        if (holdDictationStopTimeout.current !== null) {
          window.clearTimeout(holdDictationStopTimeout.current);
          holdDictationStopTimeout.current = null;
        }
        safeInvoke(stopDictation);
      }
    };

    const handleBlur = () => {
      if (!holdDictationActive.current) {
        return;
      }
      holdDictationActive.current = false;
      holdDictationStopPending.current = false;
      if (holdDictationStopTimeout.current !== null) {
        window.clearTimeout(holdDictationStopTimeout.current);
        holdDictationStopTimeout.current = null;
      }
      if (state === "listening") {
        safeInvoke(cancelDictation);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      if (holdDictationStopTimeout.current !== null) {
        window.clearTimeout(holdDictationStopTimeout.current);
        holdDictationStopTimeout.current = null;
      }
    };
  }, [
    cancelDictation,
    enabled,
    holdKey,
    preferredLanguage,
    ready,
    startDictation,
    state,
    stopDictation,
  ]);
}
