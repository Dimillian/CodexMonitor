import { useEffect } from "react";
import type { AppSettings } from "../../../types";

type Params = {
  appSettingsLoading: boolean;
  selectedModelId: string | null;
  selectedEffort: string | null;
  setAppSettings: (updater: (current: AppSettings) => AppSettings) => void;
  queueSaveSettings: (next: AppSettings) => Promise<AppSettings>;
};

export function usePersistComposerSettings({
  appSettingsLoading,
  selectedModelId,
  selectedEffort,
  setAppSettings,
  queueSaveSettings,
}: Params) {
  useEffect(() => {
    if (appSettingsLoading) {
      return;
    }
    if (!selectedModelId && selectedEffort === null) {
      return;
    }
    setAppSettings((current) => {
      if (
        current.lastComposerModelId === selectedModelId &&
        current.lastComposerReasoningEffort === selectedEffort
      ) {
        return current;
      }
      const nextSettings = {
        ...current,
        lastComposerModelId: selectedModelId,
        lastComposerReasoningEffort: selectedEffort,
      };
      void queueSaveSettings(nextSettings);
      return nextSettings;
    });
  }, [
    appSettingsLoading,
    queueSaveSettings,
    selectedEffort,
    selectedModelId,
    setAppSettings,
  ]);
}
