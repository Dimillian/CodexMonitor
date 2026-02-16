import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { AppSettings } from "../../../types";
import { pushErrorToast } from "../../../services/toasts";
import { clampUiScale, UI_SCALE_STEP } from "../../../utils/uiScale";
import { isMacPlatform } from "../../../utils/shortcuts";

type UseUiScaleShortcutsOptions = {
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
};

type UseUiScaleShortcutsResult = {
  uiScale: number;
  scaleShortcutTitle: string;
  scaleShortcutText: string;
  queueSaveSettings: (next: AppSettings) => Promise<AppSettings>;
};

export function useUiScaleShortcuts({
  settings,
  setSettings,
  saveSettings,
}: UseUiScaleShortcutsOptions): UseUiScaleShortcutsResult {
  const uiScale = clampUiScale(settings.uiScale);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      getCurrentWebview()
        .setZoom(uiScale)
        .catch(() => undefined);
    } catch {
      // Browser preview / non-Tauri runtime: no-op.
    }
  }, [uiScale]);

  const scaleShortcutLabel = useMemo(() => {
    return isMacPlatform() ? "Cmd" : "Ctrl";
  }, []);

  const scaleShortcutTitle = `${scaleShortcutLabel}+ 和 ${scaleShortcutLabel}-，${scaleShortcutLabel}+0 重置。`;
  const scaleShortcutText = `快捷键：${scaleShortcutLabel}+ 和 ${scaleShortcutLabel}-，${scaleShortcutLabel}+0 重置。`;

  const saveQueueRef = useRef(Promise.resolve());
  const lastSaveErrorRef = useRef<{ message: string; atMs: number } | null>(null);
  const reportSaveSettingsError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const now = Date.now();
    const previous = lastSaveErrorRef.current;
    if (
      previous
      && previous.message === message
      && now - previous.atMs < 3000
    ) {
      return;
    }
    lastSaveErrorRef.current = { message, atMs: now };
    pushErrorToast({
      title: "保存设置失败",
      message,
    });
  }, []);
  const queueSaveSettings = useCallback(
    (next: AppSettings) => {
      const task = () => saveSettings(next);
      const queued = saveQueueRef.current
        .then(task, task)
        .catch((error) => {
          reportSaveSettingsError(error);
          throw error;
        });
      saveQueueRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
    [reportSaveSettingsError, saveSettings],
  );

  const handleScaleDelta = useCallback(
    (delta: number) => {
      setSettings((current) => {
        const nextScale = clampUiScale(current.uiScale + delta);
        if (nextScale === current.uiScale) {
          return current;
        }
        const nextSettings = {
          ...current,
          uiScale: nextScale,
        };
        void queueSaveSettings(nextSettings);
        return nextSettings;
      });
    },
    [queueSaveSettings, setSettings],
  );

  const handleScaleReset = useCallback(() => {
    setSettings((current) => {
      if (current.uiScale === 1) {
        return current;
      }
      const nextSettings = {
        ...current,
        uiScale: 1,
      };
      void queueSaveSettings(nextSettings);
      return nextSettings;
    });
  }, [queueSaveSettings, setSettings]);

  useEffect(() => {
    const handleScaleShortcut = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) {
        return;
      }
      if (event.altKey) {
        return;
      }
      const key = event.key;
      const isIncrease = key === "+" || key === "=";
      const isDecrease = key === "-" || key === "_";
      const isReset = key === "0";
      if (!isIncrease && !isDecrease && !isReset) {
        return;
      }
      event.preventDefault();
      if (isReset) {
        handleScaleReset();
        return;
      }
      handleScaleDelta(isDecrease ? -UI_SCALE_STEP : UI_SCALE_STEP);
    };
    window.addEventListener("keydown", handleScaleShortcut);
    return () => {
      window.removeEventListener("keydown", handleScaleShortcut);
    };
  }, [handleScaleDelta, handleScaleReset]);

  return {
    uiScale,
    scaleShortcutTitle,
    scaleShortcutText,
    queueSaveSettings,
  };
}
