import { useCallback, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { AppSettings } from "@/types";
import { getCodexConfigPath } from "@services/tauri";

type UseSettingsFeaturesSectionArgs = {
  appSettings: AppSettings;
  hasCodexHomeOverrides: boolean;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export type SettingsFeaturesSectionProps = {
  appSettings: AppSettings;
  hasCodexHomeOverrides: boolean;
  openConfigError: string | null;
  onOpenConfig: () => void;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export const useSettingsFeaturesSection = ({
  appSettings,
  hasCodexHomeOverrides,
  onUpdateAppSettings,
}: UseSettingsFeaturesSectionArgs): SettingsFeaturesSectionProps => {
  const [openConfigError, setOpenConfigError] = useState<string | null>(null);

  const handleOpenConfig = useCallback(async () => {
    setOpenConfigError(null);
    try {
      const configPath = await getCodexConfigPath();
      await revealItemInDir(configPath);
    } catch (error) {
      setOpenConfigError(
        error instanceof Error ? error.message : "Unable to open config.",
      );
    }
  }, []);

  return {
    appSettings,
    hasCodexHomeOverrides,
    openConfigError,
    onOpenConfig: () => {
      void handleOpenConfig();
    },
    onUpdateAppSettings,
  };
};
