import { useMemo, useRef, useState } from "react";
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
import {
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import {
  GENERIC_APP_ICON,
  getKnownOpenAppIcon,
  getKnownOpenAppIconAsset,
  type OpenAppIconAsset,
} from "../utils/openAppIcons";
import { useDismissibleMenu } from "../hooks/useDismissibleMenu";

type OpenTarget = {
  id: string;
  label: string;
  icon: OpenAppIconAsset;
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
          getKnownOpenAppIconAsset(target.id, 14) ??
          (iconById[target.id]
            ? {
                src: iconById[target.id],
                srcSet: `${iconById[target.id]} 1x, ${iconById[target.id]} 2x`,
              }
            : {
                src: GENERIC_APP_ICON,
                srcSet: `${GENERIC_APP_ICON} 1x, ${GENERIC_APP_ICON} 2x`,
              }),
        target,
      })),
    [availableTargets, iconById],
  );

  const defaultKnownIcon = getKnownOpenAppIcon(DEFAULT_OPEN_APP_ID) ?? GENERIC_APP_ICON;
  const fallbackTarget: OpenTarget = {
    id: DEFAULT_OPEN_APP_ID,
    label:
      DEFAULT_OPEN_APP_TARGETS.find((target) => target.id === DEFAULT_OPEN_APP_ID)
        ?.label ??
      DEFAULT_OPEN_APP_TARGETS[0]?.label ??
      "打开",
    icon:
      getKnownOpenAppIconAsset(DEFAULT_OPEN_APP_ID, 14) ?? {
        src: defaultKnownIcon,
        srcSet: `${defaultKnownIcon} 1x, ${defaultKnownIcon} 2x`,
      },
    target:
      DEFAULT_OPEN_APP_TARGETS.find((target) => target.id === DEFAULT_OPEN_APP_ID) ??
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
      title: "无法打开工作区",
      message,
    });
    console.warn("Failed to open workspace in target app", {
      message,
      path,
      targetId: target.id,
    });
  };

  useDismissibleMenu({
    isOpen: openMenuOpen,
    containerRef: openMenuRef,
    onClose: () => setOpenMenuOpen(false),
  });

  const resolveAppName = (target: OpenTarget) =>
    (target.target.appName ?? "").trim();
  const resolveCommand = (target: OpenTarget) =>
    (target.target.command ?? "").trim();
  const canOpenTarget = (target: OpenTarget) => {
    if (target.target.kind === "finder") {
      return true;
    }
    if (target.target.kind === "command") {
      return Boolean(resolveCommand(target));
    }
    return Boolean(resolveAppName(target));
  };

  const openWithTarget = async (target: OpenTarget) => {
    try {
      if (target.target.kind === "finder") {
        await revealItemInDir(path);
        return;
      }
      if (target.target.kind === "command") {
        const command = resolveCommand(target);
        if (!command) {
          return;
        }
        await openWorkspaceIn(path, {
          command,
          args: target.target.args,
        });
        return;
      }
      const appName = resolveAppName(target);
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
    if (!selectedOpenTarget || !canOpenTarget(selectedOpenTarget)) {
      return;
    }
    await openWithTarget(selectedOpenTarget);
  };

  const handleSelectOpenTarget = async (target: OpenTarget) => {
    if (!canOpenTarget(target)) {
      return;
    }
    onSelectOpenAppId(target.id);
    window.localStorage.setItem(OPEN_APP_STORAGE_KEY, target.id);
    setOpenMenuOpen(false);
    await openWithTarget(target);
  };

  const selectedCanOpen = canOpenTarget(selectedOpenTarget);
  const openLabel = selectedCanOpen
    ? `在 ${selectedOpenTarget.label} 中打开`
    : selectedOpenTarget.target.kind === "command"
      ? "请先在设置中配置命令"
      : "请先在设置中配置应用名称";

  return (
    <div className="open-app-menu" ref={openMenuRef}>
      <div className="open-app-button">
        <button
          type="button"
          className="ghost main-header-action open-app-action"
          onClick={handleOpen}
          disabled={!selectedCanOpen}
          data-tauri-drag-region="false"
          aria-label={`在 ${selectedOpenTarget.label} 中打开`}
          title={openLabel}
        >
          <span className="open-app-label">
            <img
              className="open-app-icon"
              src={selectedOpenTarget.icon.src}
              srcSet={selectedOpenTarget.icon.srcSet}
              alt=""
              aria-hidden
              width={14}
              height={14}
              sizes="14px"
              loading="eager"
              decoding="async"
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
          aria-label="选择编辑器"
          title="选择编辑器"
        >
          <ChevronDown size={14} aria-hidden />
        </button>
      </div>
      {openMenuOpen && (
        <PopoverSurface className="open-app-dropdown" role="menu">
          {resolvedOpenTargets.map((target) => (
            // Keep entries visible but disable ones missing required config.
            <PopoverMenuItem
              key={target.id}
              className="open-app-option"
              onClick={() => handleSelectOpenTarget(target)}
              disabled={!canOpenTarget(target)}
              role="menuitem"
              data-tauri-drag-region="false"
              icon={
                <img
                  className="open-app-icon"
                  src={target.icon.src}
                  srcSet={target.icon.srcSet}
                  alt=""
                  aria-hidden
                  width={14}
                  height={14}
                  sizes="14px"
                  loading="eager"
                  decoding="async"
                />
              }
              active={target.id === resolvedOpenAppId}
            >
              {target.label}
            </PopoverMenuItem>
          ))}
        </PopoverSurface>
      )}
    </div>
  );
}
