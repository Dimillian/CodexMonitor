import { useCallback, useEffect, useState } from "react";
import type { GeminiSettings, GeminiMcpServerConfig } from "../../../types";
import { getGeminiSettings, updateGeminiSettings, getGeminiSettingsPath } from "../../../services/tauri";

const defaultGeminiSettings: GeminiSettings = {
  previewFeatures: null,
  vimMode: null,
  enableAutoUpdate: null,
  model: null,
  output: null,
  ui: null,
  checkpointing: null,
  privacy: null,
  tools: null,
  mcp: null,
  sandbox: null,
  ide: null,
  hooks: null,
};

export function useGeminiSettings() {
  const [settings, setSettings] = useState<GeminiSettings>(defaultGeminiSettings);
  const [settingsPath, setSettingsPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [response, path] = await Promise.all([
        getGeminiSettings(),
        getGeminiSettingsPath(),
      ]);
      setSettings({ ...defaultGeminiSettings, ...response });
      setSettingsPath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Gemini settings");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSettings = useCallback(async (next: GeminiSettings) => {
    setError(null);
    try {
      await updateGeminiSettings(next);
      setSettings(next);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save Gemini settings");
      return false;
    }
  }, []);

  const updatePreviewFeatures = useCallback(
    async (enabled: boolean) => {
      const next = { ...settings, previewFeatures: enabled };
      return saveSettings(next);
    },
    [settings, saveSettings],
  );

  const updateVimMode = useCallback(
    async (enabled: boolean) => {
      const next = { ...settings, vimMode: enabled };
      return saveSettings(next);
    },
    [settings, saveSettings],
  );

  const updateAutoUpdate = useCallback(
    async (enabled: boolean) => {
      const next = { ...settings, enableAutoUpdate: enabled };
      return saveSettings(next);
    },
    [settings, saveSettings],
  );

  const updateModelSettings = useCallback(
    async (model: GeminiSettings["model"]) => {
      const next = { ...settings, model };
      return saveSettings(next);
    },
    [settings, saveSettings],
  );

  const updateMcpServer = useCallback(
    async (serverName: string, config: GeminiMcpServerConfig | null) => {
      const servers = { ...(settings.mcp?.servers ?? {}) };
      if (config === null) {
        delete servers[serverName];
      } else {
        servers[serverName] = config;
      }
      const next = { ...settings, mcp: { servers } };
      return saveSettings(next);
    },
    [settings, saveSettings],
  );

  return {
    settings,
    settingsPath,
    isLoading,
    error,
    saveSettings,
    loadSettings,
    updatePreviewFeatures,
    updateVimMode,
    updateAutoUpdate,
    updateModelSettings,
    updateMcpServer,
  };
}
