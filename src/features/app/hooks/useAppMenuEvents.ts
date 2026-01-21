import type { MutableRefObject } from "react";
import { useTauriEvent } from "./useTauriEvent";
import {
  subscribeMenuAddWorkspace,
  subscribeMenuNewAgent,
  subscribeMenuNewCloneAgent,
  subscribeMenuNewWorktreeAgent,
  subscribeMenuOpenSettings,
  subscribeMenuPrevAgent,
  subscribeMenuNextAgent,
  subscribeMenuPrevWorkspace,
  subscribeMenuNextWorkspace,
  subscribeMenuToggleDebugPanel,
  subscribeMenuToggleGitSidebar,
  subscribeMenuToggleProjectsSidebar,
  subscribeMenuToggleTerminal,
} from "../../../services/events";
import type { WorkspaceInfo } from "../../../types";

type Params = {
  activeWorkspaceRef: MutableRefObject<WorkspaceInfo | null>;
  baseWorkspaceRef: MutableRefObject<WorkspaceInfo | null>;
  onAddWorkspace: () => void;
  onAddAgent: (workspace: WorkspaceInfo) => void;
  onAddWorktreeAgent: (workspace: WorkspaceInfo) => void;
  onAddCloneAgent: (workspace: WorkspaceInfo) => void;
  onOpenSettings: () => void;
  onCycleAgent: (direction: "next" | "prev") => void;
  onCycleWorkspace: (direction: "next" | "prev") => void;
  onToggleDebug: () => void;
  onToggleTerminal: () => void;
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  onExpandSidebar: () => void;
  onCollapseSidebar: () => void;
  onExpandRightPanel: () => void;
  onCollapseRightPanel: () => void;
};

export function useAppMenuEvents({
  activeWorkspaceRef,
  baseWorkspaceRef,
  onAddWorkspace,
  onAddAgent,
  onAddWorktreeAgent,
  onAddCloneAgent,
  onOpenSettings,
  onCycleAgent,
  onCycleWorkspace,
  onToggleDebug,
  onToggleTerminal,
  sidebarCollapsed,
  rightPanelCollapsed,
  onExpandSidebar,
  onCollapseSidebar,
  onExpandRightPanel,
  onCollapseRightPanel,
}: Params) {
  useTauriEvent(subscribeMenuNewAgent, () => {
    const workspace = activeWorkspaceRef.current;
    if (workspace) {
      onAddAgent(workspace);
    }
  });

  useTauriEvent(subscribeMenuNewWorktreeAgent, () => {
    const workspace = baseWorkspaceRef.current;
    if (workspace) {
      onAddWorktreeAgent(workspace);
    }
  });

  useTauriEvent(subscribeMenuNewCloneAgent, () => {
    const workspace = baseWorkspaceRef.current;
    if (workspace) {
      onAddCloneAgent(workspace);
    }
  });

  useTauriEvent(subscribeMenuAddWorkspace, () => {
    onAddWorkspace();
  });

  useTauriEvent(subscribeMenuOpenSettings, () => {
    onOpenSettings();
  });

  useTauriEvent(subscribeMenuNextAgent, () => {
    onCycleAgent("next");
  });

  useTauriEvent(subscribeMenuPrevAgent, () => {
    onCycleAgent("prev");
  });

  useTauriEvent(subscribeMenuNextWorkspace, () => {
    onCycleWorkspace("next");
  });

  useTauriEvent(subscribeMenuPrevWorkspace, () => {
    onCycleWorkspace("prev");
  });

  useTauriEvent(subscribeMenuToggleDebugPanel, () => {
    onToggleDebug();
  });

  useTauriEvent(subscribeMenuToggleTerminal, () => {
    onToggleTerminal();
  });

  useTauriEvent(subscribeMenuToggleProjectsSidebar, () => {
    if (sidebarCollapsed) {
      onExpandSidebar();
    } else {
      onCollapseSidebar();
    }
  });

  useTauriEvent(subscribeMenuToggleGitSidebar, () => {
    if (rightPanelCollapsed) {
      onExpandRightPanel();
    } else {
      onCollapseRightPanel();
    }
  });
}
