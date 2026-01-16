import { useCallback, useEffect, useState } from "react";
import type { AppSettings } from "../../../types";
import { getAppSettings, runCodexDoctor, updateAppSettings } from "../../../services/tauri";
import { clampUiScale, UI_SCALE_DEFAULT } from "../../../utils/uiScale";
import { isAppleMobile } from "../../../utils/platform";

function buildDefaultSettings(): AppSettings {
  // On iOS/iPadOS, the app is effectively a Cloud client. Default CloudKit to ON so
  // first launch can immediately check for a running Mac runner.
  const cloudDefault = isAppleMobile();
  return {
    codexBin: null,
    runnerId: "",
    cloudKitEnabled: cloudDefault,
    cloudKitContainerId: null,
    cloudKitPollIntervalMs: null,
    natsEnabled: false,
    natsUrl: null,
    natsNamespace: null,
    natsCredsFilePath: null,
    telegramEnabled: false,
    telegramBotToken: null,
    telegramAllowedUserIds: [],
    telegramDefaultChatId: null,
    defaultAccessMode: "current",
    uiScale: UI_SCALE_DEFAULT,
    notificationSoundsEnabled: true,
  };
}

function normalizeAppSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    uiScale: clampUiScale(settings.uiScale),
  };
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => buildDefaultSettings());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await getAppSettings();
        if (active) {
          const defaults = buildDefaultSettings();
          setSettings(
            normalizeAppSettings({
              ...defaults,
              ...response,
            }),
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const saveSettings = useCallback(async (next: AppSettings) => {
    const defaults = buildDefaultSettings();
    const normalized = normalizeAppSettings({
      ...defaults,
      ...next,
    });
    const saved = await updateAppSettings(normalized);
    setSettings(
      normalizeAppSettings({
        ...defaults,
        ...saved,
      }),
    );
    return saved;
  }, []);

  const doctor = useCallback(async (codexBin: string | null) => {
    return runCodexDoctor(codexBin);
  }, []);

  return {
    settings,
    setSettings,
    saveSettings,
    doctor,
    isLoading,
  };
}
