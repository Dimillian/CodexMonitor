import { useThemePreference } from "../../layout/hooks/useThemePreference";
import { useTransparencyPreference } from "../../layout/hooks/useTransparencyPreference";
import { useUiScaleShortcuts } from "../../layout/hooks/useUiScaleShortcuts";
import { useAppSettings } from "../../settings/hooks/useAppSettings";
import { runOpenCodeUpdate } from "../../../services/tauri";

export function useAppSettingsController() {
  const {
    settings: appSettings,
    setSettings: setAppSettings,
    saveSettings,
    doctor,
    isLoading: appSettingsLoading,
  } = useAppSettings();

  useThemePreference(appSettings.theme);
  const { reduceTransparency, setReduceTransparency } =
    useTransparencyPreference();

  const {
    uiScale,
    scaleShortcutTitle,
    scaleShortcutText,
    queueSaveSettings,
  } = useUiScaleShortcuts({
    settings: appSettings,
    setSettings: setAppSettings,
    saveSettings,
  });

  return {
    appSettings,
    setAppSettings,
    saveSettings,
    queueSaveSettings,
    doctor,
    opencodeUpdate: (opencodeBin: string | null, opencodeArgs: string | null) =>
      runOpenCodeUpdate(opencodeBin, opencodeArgs),
    appSettingsLoading,
    reduceTransparency,
    setReduceTransparency,
    uiScale,
    scaleShortcutTitle,
    scaleShortcutText,
  };
}
