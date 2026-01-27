import { useEffect, useMemo, useRef, useState } from "react";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import * as Sentry from "@sentry/react";
import { openWorkspaceIn } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import type { OpenAppTarget } from "../../../types";
import {
  DEFAULT_OPEN_APP_ID,
  DEFAULT_OPEN_APP_TARGETS,
  OPEN_APP_STORAGE_KEY,
} from "../constants";
import { GENERIC_APP_ICON, getKnownOpenAppIcon } from "../utils/openAppIcons";

type OpenTarget = {
  id: string;
  label: string;
  icon: string;
  target: OpenAppTarget;
};

type OpenAppMenuProps = {
  path: string;
  openTargets: OpenAppTarget[];
  selectedOpenAppId: string;
  onSelectOpenAppId: (id: string) => void;
  iconById?: Record<string, string>;
};

export function OpenAppMenu({
  path,
  openTargets,
  selectedOpenAppId,
  onSelectOpenAppId,
  iconById = {},
}: OpenAppMenuProps) {
  const [openMenuOpen, setOpenMenuOpen] = useState(false);
  const openMenuRef = useRef<HTMLDivElement | null>(null);
  const availableTargets =
    openTargets.length > 0 ? openTargets : DEFAULT_OPEN_APP_TARGETS;
  const openAppId = useMemo(
    () =>
      availableTargets.find((target) => target.id === selectedOpenAppId)?.id,
    [availableTargets, selectedOpenAppId],
  );
  const resolvedOpenAppId =
    openAppId ?? availableTargets[0]?.id ?? DEFAULT_OPEN_APP_ID;

  const resolvedOpenTargets = useMemo<OpenTarget[]>(
    () =>
      availableTargets.map((target) => ({
        id: target.id,
        label: target.label,
        icon:
          getKnownOpenAppIcon(target.id) ??
          iconById[target.id] ??
          GENERIC_APP_ICON,
        target,
      })),
    [availableTargets, iconById],
  );

  const fallbackTarget: OpenTarget = {
    id: DEFAULT_OPEN_APP_ID,
    label: DEFAULT_OPEN_APP_TARGETS[0]?.label ?? "Open",
    icon: getKnownOpenAppIcon(DEFAULT_OPEN_APP_ID) ?? GENERIC_APP_ICON,
    target:
      DEFAULT_OPEN_APP_TARGETS[0] ?? {
        id: DEFAULT_OPEN_APP_ID,
        label: "VS Code",
        kind: "app",
        appName: "Visual Studio Code",
        command: null,
        args: [],
      },
  };
  const selectedOpenTarget =
    resolvedOpenTargets.find((target) => target.id === resolvedOpenAppId) ??
    resolvedOpenTargets[0] ??
    fallbackTarget;

  const reportOpenError = (error: unknown, target: OpenTarget) => {
    const message = error instanceof Error ? error.message : String(error);
    Sentry.captureException(error instanceof Error ? error : new Error(message), {
      tags: {
        feature: "open-app-menu",
      },
      extra: {
        path,
        targetId: target.id,
        targetKind: target.target.kind,
        targetAppName: target.target.appName ?? null,
        targetCommand: target.target.command ?? null,
      },
    });
    pushErrorToast({
      title: "Couldn’t open workspace",
      message,
    });
    console.warn("Failed to open workspace in target app", {
      message,
      path,
      targetId: target.id,
    });
  };

  useEffect(() => {
    if (!openMenuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const openContains = openMenuRef.current?.contains(target) ?? false;
      if (!openContains) {
        setOpenMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, [openMenuOpen]);

  const openWithTarget = async (target: OpenTarget) => {
    try {
      if (target.target.kind === "finder") {
        await revealItemInDir(path);
        return;
      }
      if (target.target.kind === "command") {
        if (!target.target.command) {
          return;
        }
        await openWorkspaceIn(path, {
          command: target.target.command,
          args: target.target.args,
        });
        return;
      }
      const appName = target.target.appName || target.label;
      if (!appName) {
        return;
      }
      await openWorkspaceIn(path, {
        appName,
        args: target.target.args,
      });
    } catch (error) {
      reportOpenError(error, target);
    }
  };

  const handleOpen = async () => {
    if (!selectedOpenTarget) {
      return;
    }
    await openWithTarget(selectedOpenTarget);
  };

  const handleSelectOpenTarget = async (target: OpenTarget) => {
    onSelectOpenAppId(target.id);
    window.localStorage.setItem(OPEN_APP_STORAGE_KEY, target.id);
    setOpenMenuOpen(false);
    await openWithTarget(target);
  };

  return (
    <div className="open-app-menu" ref={openMenuRef}>
      <div className="open-app-button">
        <button
          type="button"
          className="ghost main-header-action open-app-action"
          onClick={handleOpen}
          data-tauri-drag-region="false"
          aria-label={`Open in ${selectedOpenTarget.label}`}
          title={`Open in ${selectedOpenTarget.label}`}
        >
          <span className="open-app-label">
            <img
              className="open-app-icon"
              src={selectedOpenTarget.icon}
              alt=""
              aria-hidden
            />
            {selectedOpenTarget.label}
          </span>
        </button>
        <button
          type="button"
          className="ghost main-header-action open-app-toggle"
          onClick={() => setOpenMenuOpen((prev) => !prev)}
          data-tauri-drag-region="false"
          aria-haspopup="menu"
          aria-expanded={openMenuOpen}
          aria-label="Select editor"
          title="Select editor"
        >
          <ChevronDown size={14} aria-hidden />
        </button>
      </div>
      {openMenuOpen && (
        <div className="open-app-dropdown" role="menu">
          {resolvedOpenTargets.map((target) => (
            <button
              key={target.id}
              type="button"
              className={`open-app-option${
                target.id === resolvedOpenAppId ? " is-active" : ""
              }`}
              onClick={() => handleSelectOpenTarget(target)}
              role="menuitem"
              data-tauri-drag-region="false"
            >
              <img className="open-app-icon" src={target.icon} alt="" aria-hidden />
              {target.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
