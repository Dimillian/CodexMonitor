import { useEffect, useRef } from "react";
import {
  applyCurrentWindowHudEffect,
  clearCurrentWindowEffects,
  isLiquidGlassSupported,
  setLiquidGlassEnabled,
} from "@services/tauri";
import type { DebugEntry } from "@/types";
import { isMobilePlatform } from "@utils/platformPaths";

type Params = {
  reduceTransparency: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

export function useLiquidGlassEffect({ reduceTransparency, onDebug }: Params) {
  const supportedRef = useRef<boolean | null>(null);
  const platformRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const toMessage = (error: string | Error): string =>
      typeof error === "string" ? error : error.message;
    const currentPlatform = (): string => {
      if (platformRef.current) {
        return platformRef.current;
      }
      if (isMobilePlatform()) {
        platformRef.current = "mobile";
        return platformRef.current;
      }
      const userAgent = navigator.userAgent ?? "";
      const isMac = userAgent.includes("Macintosh");
      const isLinux = userAgent.includes("Linux");
      const isWindows = userAgent.includes("Windows");
      if (isMac) {
        platformRef.current = "mac";
      } else if (isLinux) {
        platformRef.current = "linux";
      } else if (isWindows) {
        platformRef.current = "windows";
      } else {
        platformRef.current = "mobile";
      }
      return platformRef.current;
    };
    const isDesktopPlatform = (): boolean => currentPlatform() !== "mobile";
    const supportsHudFallback = (): boolean => {
      const platform = currentPlatform();
      return platform === "mac" || platform === "linux";
    };

    const addDebugError = (label: string, message: string) => {
      if (cancelled || !onDebug) {
        return;
      }
      onDebug({
        id: `${Date.now()}-${label}`,
        timestamp: Date.now(),
        source: "error",
        label,
        payload: message,
      });
    };

    const resolveGlassSupport = async (): Promise<boolean> => {
      if (supportedRef.current !== null) {
        return supportedRef.current;
      }
      if (!isDesktopPlatform()) {
        supportedRef.current = false;
        return false;
      }
      try {
        supportedRef.current = await isLiquidGlassSupported();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Unexpected error: ${String(error)}`;
        supportedRef.current = false;
        addDebugError("liquid-glass/is-supported-error", message);
      }
      return supportedRef.current;
    };

    const apply = async () => {
      try {
        if (reduceTransparency) {
          await clearCurrentWindowEffects();
          if (isDesktopPlatform()) {
            try {
              await setLiquidGlassEnabled(false);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : `Unexpected error: ${String(error)}`;
              supportedRef.current = false;
              addDebugError("liquid-glass/disable-error", message);
            }
          }
          return;
        }

        const supported = await resolveGlassSupport();
        if (cancelled) {
          return;
        }
        if (supported) {
          try {
            await clearCurrentWindowEffects();
            await setLiquidGlassEnabled(true, 16);
            return;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : `Unexpected error: ${String(error)}`;
            supportedRef.current = false;
            addDebugError("liquid-glass/enable-error", message);
          }
        }

        if (!supportsHudFallback()) {
          return;
        }
        await applyCurrentWindowHudEffect(16);
      } catch (error) {
        const message =
          error instanceof Error ? toMessage(error) : `Unexpected error: ${String(error)}`;
        addDebugError("liquid-glass/apply-error", message);
      }
    };

    void apply();

    return () => {
      cancelled = true;
    };
  }, [onDebug, reduceTransparency]);
}
