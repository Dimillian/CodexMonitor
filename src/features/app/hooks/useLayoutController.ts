import { useLayoutMode } from "../../layout/hooks/useLayoutMode";
import { useResizablePanels } from "../../layout/hooks/useResizablePanels";
import { useSidebarToggles } from "../../layout/hooks/useSidebarToggles";
import { usePanelVisibility } from "../../layout/hooks/usePanelVisibility";
import { usePanelShortcuts } from "../../layout/hooks/usePanelShortcuts";

export function useLayoutController({
  activeWorkspaceId,
  setActiveTab,
  setDebugOpen,
  toggleDebugPanelShortcut,
  toggleTerminalShortcut,
}: {
  activeWorkspaceId: string | null;
  setActiveTab: (tab: "projects" | "codex" | "git" | "log") => void;
  setDebugOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  toggleDebugPanelShortcut: string | null;
  toggleTerminalShortcut: string | null;
}) {
  const {
    sidebarWidth,
    rightPanelWidth,
    onSidebarResizeStart,
    onRightPanelResizeStart,
    planPanelHeight,
    onPlanPanelResizeStart,
    terminalPanelHeight,
    onTerminalPanelResizeStart,
    debugPanelHeight,
    onDebugPanelResizeStart,
  } = useResizablePanels();

  const layoutMode = useLayoutMode();
  const isCompact = layoutMode !== "desktop";
  const isTablet = layoutMode === "tablet";
  const isPhone = layoutMode === "phone";

  const {
    sidebarCollapsed,
    rightPanelCollapsed,
    collapseSidebar,
    expandSidebar,
    collapseRightPanel,
    expandRightPanel,
  } = useSidebarToggles({ isCompact });

  const {
    terminalOpen,
    onToggleDebug: handleDebugClick,
    onToggleTerminal: handleToggleTerminal,
    openTerminal,
    closeTerminal,
  } = usePanelVisibility({
    isCompact,
    activeWorkspaceId,
    setActiveTab,
    setDebugOpen,
  });

  usePanelShortcuts({
    toggleDebugPanelShortcut,
    toggleTerminalShortcut,
    onToggleDebug: handleDebugClick,
    onToggleTerminal: handleToggleTerminal,
  });

  return {
    layoutMode,
    isCompact,
    isTablet,
    isPhone,
    sidebarWidth,
    rightPanelWidth,
    planPanelHeight,
    terminalPanelHeight,
    debugPanelHeight,
    onSidebarResizeStart,
    onRightPanelResizeStart,
    onPlanPanelResizeStart,
    onTerminalPanelResizeStart,
    onDebugPanelResizeStart,
    sidebarCollapsed,
    rightPanelCollapsed,
    collapseSidebar,
    expandSidebar,
    collapseRightPanel,
    expandRightPanel,
    terminalOpen,
    handleDebugClick,
    handleToggleTerminal,
    openTerminal,
    closeTerminal,
  };
}
