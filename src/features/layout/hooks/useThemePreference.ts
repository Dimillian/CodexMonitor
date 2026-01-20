import { useEffect } from "react";
import type { ThemePreference } from "../../../types";

export function useThemePreference(theme: ThemePreference) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      delete root.dataset.theme;
      return;
    }
    root.dataset.theme = theme;
  }, [theme]);
}
