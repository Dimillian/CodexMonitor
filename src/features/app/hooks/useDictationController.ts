import { useCallback, useEffect, useRef } from "react";
import { useDictation } from "../../dictation/hooks/useDictation";
import { useDictationModel } from "../../dictation/hooks/useDictationModel";
import { useHoldToDictate } from "../../dictation/hooks/useHoldToDictate";
import type { AppSettings } from "../../../types";
import { requestDictationPermission } from "../../../services/tauri";

type DictationController = {
  dictationModel: ReturnType<typeof useDictationModel>;
  dictationState: ReturnType<typeof useDictation>["state"];
  dictationLevel: ReturnType<typeof useDictation>["level"];
  dictationTranscript: ReturnType<typeof useDictation>["transcript"];
  dictationError: ReturnType<typeof useDictation>["error"];
  dictationHint: ReturnType<typeof useDictation>["hint"];
  dictationReady: boolean;
  handleToggleDictation: () => Promise<void>;
  clearDictationTranscript: ReturnType<typeof useDictation>["clearTranscript"];
  clearDictationError: ReturnType<typeof useDictation>["clearError"];
  clearDictationHint: ReturnType<typeof useDictation>["clearHint"];
  startDictation: ReturnType<typeof useDictation>["start"];
  stopDictation: ReturnType<typeof useDictation>["stop"];
  cancelDictation: ReturnType<typeof useDictation>["cancel"];
};

export function useDictationController(appSettings: AppSettings): DictationController {
  const dictationModel = useDictationModel(appSettings.dictationModelId);
  const {
    state: dictationState,
    level: dictationLevel,
    transcript: dictationTranscript,
    error: dictationError,
    hint: dictationHint,
    start: startDictation,
    stop: stopDictation,
    cancel: cancelDictation,
    clearTranscript: clearDictationTranscript,
    clearError: clearDictationError,
    clearHint: clearDictationHint,
  } = useDictation();
  const dictationReady = dictationModel.status?.state === "ready";
  const holdDictationKey = (appSettings.dictationHoldKey ?? "").toLowerCase();
  const permissionRequestPendingRef = useRef(false);
  const permissionRequestedRef = useRef(false);

  const handleToggleDictation = useCallback(async () => {
    if (!appSettings.dictationEnabled || !dictationReady) {
      return;
    }
    try {
      if (dictationState === "listening") {
        await stopDictation();
        return;
      }
      if (dictationState === "idle") {
        await startDictation(appSettings.dictationPreferredLanguage);
      }
    } catch {
      // Errors are surfaced through dictation events.
    }
  }, [
    appSettings.dictationEnabled,
    appSettings.dictationPreferredLanguage,
    dictationReady,
    dictationState,
    startDictation,
    stopDictation,
  ]);

  const escapeHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    escapeHandlerRef.current = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (dictationState !== "listening" && dictationState !== "processing") {
        return;
      }
      event.preventDefault();
      void cancelDictation();
    };
  }, [cancelDictation, dictationState]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      escapeHandlerRef.current(event);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  useHoldToDictate({
    enabled: appSettings.dictationEnabled,
    ready: dictationReady,
    state: dictationState,
    preferredLanguage: appSettings.dictationPreferredLanguage,
    holdKey: holdDictationKey,
    startDictation,
    stopDictation,
    cancelDictation,
  });

  useEffect(() => {
    if (!appSettings.dictationEnabled) {
      permissionRequestedRef.current = false;
      return;
    }
    if (permissionRequestPendingRef.current) {
      return;
    }
    if (!dictationReady) {
      permissionRequestedRef.current = false;
      return;
    }
    if (permissionRequestedRef.current) {
      return;
    }
    permissionRequestedRef.current = true;
    permissionRequestPendingRef.current = true;
    void requestDictationPermission()
      .catch(() => {
        // Errors are surfaced during dictation start.
      })
      .finally(() => {
        permissionRequestPendingRef.current = false;
      });
  }, [appSettings.dictationEnabled, dictationReady]);

  return {
    dictationModel,
    dictationState,
    dictationLevel,
    dictationTranscript,
    dictationError,
    dictationHint,
    dictationReady,
    handleToggleDictation,
    clearDictationTranscript,
    clearDictationError,
    clearDictationHint,
    startDictation,
    stopDictation,
    cancelDictation,
  };
}
