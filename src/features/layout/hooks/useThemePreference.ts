import { useEffect } from "react";
import type { ThemePreference } from "../../../types";

export function useThemePreference(theme: ThemePreference) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme !== "system") {
      root.dataset.theme = theme;
      return;
    }

    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) {
      delete root.dataset.theme;
      return;
    }

    const applySystemTheme = () => {
      root.dataset.theme = media.matches ? "dark" : "light";
    };

    applySystemTheme();

    const mediaAny = media as unknown as {
      addEventListener?: (type: string, listener: () => void) => void;
      removeEventListener?: (type: string, listener: () => void) => void;
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };

    if (typeof mediaAny.addEventListener === "function") {
      mediaAny.addEventListener("change", applySystemTheme);
      return () => mediaAny.removeEventListener?.("change", applySystemTheme);
    }

    if (typeof mediaAny.addListener === "function") {
      mediaAny.addListener(applySystemTheme);
      return () => mediaAny.removeListener?.(applySystemTheme);
    }

    return;
  }, [theme]);
}
