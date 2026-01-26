import { useEffect, useMemo, useRef, useState } from "react";
import { getOpenAppIcon } from "../../../services/tauri";
import type { OpenAppTarget } from "../../../types";
import { getKnownOpenAppIcon } from "../utils/openAppIcons";

type OpenAppIconMap = Record<string, string>;

type ResolvedAppTarget = {
  id: string;
  appName: string;
};

function detectMacOS(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ?? navigator.platform ?? "";
  return platform.toLowerCase().includes("mac");
}

export function useOpenAppIcons(openTargets: OpenAppTarget[]): OpenAppIconMap {
  const isMacOS = detectMacOS();
  const iconCacheRef = useRef<Map<string, string>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const [iconById, setIconById] = useState<OpenAppIconMap>({});

  const appTargets = useMemo<ResolvedAppTarget[]>(
    () =>
      openTargets
        .filter((target) => target.kind === "app" && !getKnownOpenAppIcon(target.id))
        .map((target) => ({
          id: target.id,
          appName: (target.appName || target.label || "").trim(),
        }))
        .filter((target) => target.appName.length > 0),
    [openTargets],
  );

  useEffect(() => {
    if (!isMacOS || appTargets.length === 0) {
      setIconById({});
      return;
    }

    let cancelled = false;

    const resolveIcons = async () => {
      const nextIcons: OpenAppIconMap = {};

      await Promise.all(
        appTargets.map(async ({ id, appName }) => {
          const cached = iconCacheRef.current.get(appName);
          if (cached) {
            nextIcons[id] = cached;
            return;
          }

          let request = inFlightRef.current.get(appName);
          if (!request) {
            request = getOpenAppIcon(appName)
              .catch(() => null)
              .finally(() => {
                inFlightRef.current.delete(appName);
              });
            inFlightRef.current.set(appName, request);
          }

          const icon = await request;
          if (icon) {
            iconCacheRef.current.set(appName, icon);
            nextIcons[id] = icon;
          }
        }),
      );

      if (!cancelled) {
        setIconById(nextIcons);
      }
    };

    void resolveIcons();

    return () => {
      cancelled = true;
    };
  }, [appTargets, isMacOS]);

  return iconById;
}
