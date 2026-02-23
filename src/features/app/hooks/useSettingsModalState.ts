import { useCallback, useState } from "react";

export type SettingsSection =
  | "projects"
  | "display"
  | "about"
  | "dictation"
  | "shortcuts"
  | "open-apps"
  | "git"
  | "codex"
  | "features";

export function useSettingsModalState() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(
    null,
  );

  const openSettings = useCallback((section?: SettingsSection) => {
    setSettingsSection(section ?? null);
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setSettingsSection(null);
  }, []);

  return {
    settingsOpen,
    settingsSection,
    openSettings,
    closeSettings,
    setSettingsOpen,
    setSettingsSection,
  };
}
