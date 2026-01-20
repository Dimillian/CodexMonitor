import { useCallback, useEffect, useState } from "react";
import type { AppSettings } from "../../../types";
import { getAppSettings, runCodexDoctor, updateAppSettings } from "../../../services/tauri";
import { clampUiScale, UI_SCALE_DEFAULT } from "../../../utils/uiScale";

const allowedThemes = new Set(["system", "light", "dark"]);
const allowedNatsAuthModes = new Set(["url", "userpass", "creds"]);

const defaultSettings: AppSettings = {
  codexBin: null,
  backendMode: "local",
  remoteBackendHost: "127.0.0.1:4732",
  remoteBackendToken: null,
  defaultAccessMode: "current",
  composerModelShortcut: "cmd+shift+m",
  composerAccessShortcut: "cmd+shift+a",
  composerReasoningShortcut: "cmd+shift+r",
  lastComposerModelId: null,
  lastComposerReasoningEffort: null,
  uiScale: UI_SCALE_DEFAULT,
  theme: "system",
  notificationSoundsEnabled: true,
  experimentalCollabEnabled: false,
  experimentalSteerEnabled: false,
  experimentalUnifiedExecEnabled: false,
  dictationEnabled: false,
  dictationModelId: "base",
  dictationPreferredLanguage: null,
  dictationHoldKey: "alt",
  workspaceGroups: [],

  runnerId: "unknown",
  cloudProvider: "local",
  natsUrl: null,
  natsAuthMode: "url",
  natsUsername: null,
  natsPassword: null,
  natsCreds: null,
  cloudKitContainerId: null,

  telegramEnabled: false,
  telegramBotToken: null,
  telegramAllowedUserIds: null,
  telegramDefaultChatId: null,
  telegramPairingSecret: "unknown",
};

function normalizeAppSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    uiScale: clampUiScale(settings.uiScale),
    theme: allowedThemes.has(settings.theme) ? settings.theme : "system",
    natsUrl: settings.natsUrl?.trim() ? settings.natsUrl.trim() : null,
    natsAuthMode: allowedNatsAuthModes.has(settings.natsAuthMode)
      ? settings.natsAuthMode
      : "url",
    natsUsername: settings.natsUsername?.trim() ? settings.natsUsername.trim() : null,
    natsPassword: settings.natsPassword?.length ? settings.natsPassword : null,
    natsCreds: settings.natsCreds?.trim() ? settings.natsCreds.trim() : null,
    cloudKitContainerId: settings.cloudKitContainerId?.trim()
      ? settings.cloudKitContainerId.trim()
      : null,
  };
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await getAppSettings();
        if (active) {
          setSettings(
            normalizeAppSettings({
              ...defaultSettings,
              ...response,
            }),
          );
        }
      } catch {
        // Defaults stay in place if loading settings fails.
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
    const normalized = normalizeAppSettings(next);
    const saved = await updateAppSettings(normalized);
    setSettings(
      normalizeAppSettings({
        ...defaultSettings,
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
