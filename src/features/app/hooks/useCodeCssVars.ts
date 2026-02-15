import { useLayoutEffect } from "react";
import type { AppSettings } from "../../../types";

export function useCodeCssVars(appSettings: AppSettings) {
  useLayoutEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    root.style.setProperty("--code-font-family", appSettings.codeFontFamily);
    root.style.setProperty("--code-font-size", `${appSettings.codeFontSize}px`);
  }, [appSettings.codeFontFamily, appSettings.codeFontSize]);
}
