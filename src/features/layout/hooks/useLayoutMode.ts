import { useEffect, useState } from "react";
import { isMobileRuntime } from "../../../services/tauri";
import { isMobilePlatform } from "../../../utils/platformPaths";

export type LayoutMode = "desktop" | "tablet" | "phone";

const TABLET_MAX_WIDTH = 1100;
const PHONE_MAX_WIDTH = 520;

function getLayoutMode(width: number, forcePhoneLayout: boolean): LayoutMode {
  if (forcePhoneLayout) {
    return "phone";
  }
  if (width <= PHONE_MAX_WIDTH) {
    return "phone";
  }
  if (width <= TABLET_MAX_WIDTH) {
    return "tablet";
  }
  return "desktop";
}

export function useLayoutMode() {
  const [forcePhoneLayout, setForcePhoneLayout] = useState<boolean>(() =>
    isMobilePlatform(),
  );
  const [mode, setMode] = useState<LayoutMode>(() =>
    getLayoutMode(window.innerWidth, forcePhoneLayout),
  );

  useEffect(() => {
    let active = true;
    if (forcePhoneLayout) {
      return () => {
        active = false;
      };
    }
    isMobileRuntime()
      .then((mobileRuntime) => {
        if (active && mobileRuntime) {
          setForcePhoneLayout(true);
        }
      })
      .catch(() => {
        // Ignore runtime detection errors and keep browser heuristic fallback.
      });
    return () => {
      active = false;
    };
  }, [forcePhoneLayout]);

  useEffect(() => {
    setMode(getLayoutMode(window.innerWidth, forcePhoneLayout));
    function handleResize() {
      setMode(getLayoutMode(window.innerWidth, forcePhoneLayout));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [forcePhoneLayout]);

  return mode;
}
