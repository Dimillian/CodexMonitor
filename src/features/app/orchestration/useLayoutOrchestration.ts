import { useMemo, type CSSProperties } from "react";
import type { AppSettings } from "@/types";
import { isWindowsPlatform } from "@utils/platformPaths";

type UseAppShellOrchestrationOptions = {
  isCompact: boolean;
  isPhone: boolean;
  isTablet: boolean;
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  shouldReduceTransparency: boolean;
  isWorkspaceDropActive: boolean;
  centerMode: "chat" | "diff";
  selectedDiffPath: string | null;
  showComposer: boolean;
  activeThreadId: string | null;
  sidebarWidth: number;
  rightPanelWidth: number;
  chatDiffSplitPositionPercent: number;
  planPanelHeight: number;
  terminalPanelHeight: number;
  debugPanelHeight: number;
  appSettings: Pick<AppSettings, "uiFontFamily" | "codeFontFamily" | "codeFontSize">;
};

export function useAppShellOrchestration({
  isCompact,
  isPhone,
  isTablet,
  sidebarCollapsed,
  rightPanelCollapsed,
  shouldReduceTransparency,
  isWorkspaceDropActive,
  centerMode,
  selectedDiffPath,
  showComposer,
  activeThreadId,
  sidebarWidth,
  rightPanelWidth,
  chatDiffSplitPositionPercent,
  planPanelHeight,
  terminalPanelHeight,
  debugPanelHeight,
  appSettings,
}: UseAppShellOrchestrationOptions) {
  const isWindows = isWindowsPlatform();
  const showGitDetail = Boolean(selectedDiffPath) && isPhone && centerMode === "diff";
  const isThreadOpen = Boolean(activeThreadId && showComposer);

  const appClassName = `app ${isCompact ? "layout-compact" : "layout-desktop"}${
    isPhone ? " layout-phone" : ""
  }${isTablet ? " layout-tablet" : ""}${
    shouldReduceTransparency ? " reduced-transparency" : ""
  }${!isCompact && sidebarCollapsed ? " sidebar-collapsed" : ""}${
    !isCompact && rightPanelCollapsed ? " right-panel-collapsed" : ""
  }`;

  const appStyle = useMemo<CSSProperties>(
    () => ({
      "--sidebar-width": `${isCompact ? sidebarWidth : sidebarCollapsed ? 0 : sidebarWidth}px`,
      "--right-panel-width": `${
        isCompact ? rightPanelWidth : rightPanelCollapsed ? 0 : rightPanelWidth
      }px`,
      "--chat-diff-split-position-percent": `${chatDiffSplitPositionPercent}%`,
      "--plan-panel-height": `${planPanelHeight}px`,
      "--terminal-panel-height": `${terminalPanelHeight}px`,
      "--debug-panel-height": `${debugPanelHeight}px`,
      "--ui-font-family": appSettings.uiFontFamily,
      "--code-font-family": appSettings.codeFontFamily,
      "--code-font-size": `${appSettings.codeFontSize}px`,
      "--sidebar-top-padding": isWindows ? "10px" : "36px",
      "--right-panel-top-padding": isWindows
        ? "calc(var(--main-topbar-height, 44px) + 6px)"
        : "12px",
      "--home-scroll-offset": isWindows ? "var(--main-topbar-height, 44px)" : "0px",
      "--window-caption-width": isWindows ? "138px" : "0px",
      "--window-caption-gap": isWindows ? "10px" : "0px",
      ...(isWindows
        ? {
            "--titlebar-height": "8px",
            "--titlebar-inset-left": "0px",
            "--titlebar-collapsed-left-extra": "0px",
            "--titlebar-toggle-size": "32px",
            "--titlebar-toggle-side-gap": "14px",
            "--titlebar-toggle-title-offset": "0px",
            "--titlebar-toggle-offset": "0px",
          }
        : {}),
    } as CSSProperties),
    [
      appSettings.codeFontFamily,
      appSettings.codeFontSize,
      appSettings.uiFontFamily,
      chatDiffSplitPositionPercent,
      debugPanelHeight,
      isWindows,
      isCompact,
      planPanelHeight,
      rightPanelCollapsed,
      rightPanelWidth,
      sidebarCollapsed,
      sidebarWidth,
      terminalPanelHeight,
    ],
  );

  return {
    showGitDetail,
    isThreadOpen,
    dropOverlayActive: isWorkspaceDropActive,
    dropOverlayText: "Drop Project Here",
    appClassName,
    appStyle,
  };
}
