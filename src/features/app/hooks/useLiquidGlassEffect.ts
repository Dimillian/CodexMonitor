import { useEffect, useRef, useState } from "react";
import {
  isGlassSupported,
  setLiquidGlassEffect,
  GlassMaterialVariant,
} from "tauri-plugin-liquid-glass-api";
import { Effect, EffectState, getCurrentWindow } from "@tauri-apps/api/window";
import type { DebugEntry } from "../../../types";

type Params = {
  reduceTransparency: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

export function useLiquidGlassEffect({ reduceTransparency, onDebug }: Params) {
  const supportedRef = useRef<boolean | null>(null);
  const [suspendForConversation, setSuspendForConversation] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (!root) {
      return undefined;
    }

    const syncSuspendedState = () => {
      setSuspendForConversation(root.dataset.codexThinking === "true");
    };

    syncSuspendedState();

    const observer = new MutationObserver(syncSuspendedState);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-codex-thinking"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const shouldReduceTransparency = reduceTransparency || suspendForConversation;

    const apply = async () => {
      try {
        const window = getCurrentWindow();
        if (shouldReduceTransparency) {
          if (supportedRef.current === null) {
            supportedRef.current = await isGlassSupported();
          }
          if (supportedRef.current) {
            await setLiquidGlassEffect({ enabled: false });
          }
          await window.setEffects({ effects: [] });
          return;
        }

        if (supportedRef.current === null) {
          supportedRef.current = await isGlassSupported();
        }
        if (cancelled) {
          return;
        }
        if (supportedRef.current) {
          await window.setEffects({ effects: [] });
          await setLiquidGlassEffect({
            enabled: true,
            cornerRadius: 16,
            variant: GlassMaterialVariant.Regular,
          });
          return;
        }

        const userAgent = navigator.userAgent ?? "";
        const isMac = userAgent.includes("Macintosh");
        const isLinux = userAgent.includes("Linux");
        const isWindows = userAgent.includes("Windows");

        if (isWindows) {
          await window.setEffects({
            effects: [Effect.Acrylic],
            state: EffectState.Active,
          });
          return;
        }

        if (!isMac && !isLinux) {
          return;
        }
        await window.setEffects({
          effects: [Effect.HudWindow],
          state: EffectState.Active,
          radius: 16,
        });
      } catch (error) {
        if (cancelled || !onDebug) {
          return;
        }
        onDebug({
          id: `${Date.now()}-client-liquid-glass-error`,
          timestamp: Date.now(),
          source: "error",
          label: "liquid-glass/apply-error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void apply();

    return () => {
      cancelled = true;
    };
  }, [onDebug, reduceTransparency, suspendForConversation]);
}
