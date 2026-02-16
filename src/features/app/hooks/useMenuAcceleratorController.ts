import { useCallback, useMemo, useRef } from "react";
import { useMenuAccelerators } from "./useMenuAccelerators";
import type { AppSettings, DebugEntry } from "../../../types";
import { pushErrorToast } from "../../../services/toasts";

type Params = {
  appSettings: AppSettings;
  onDebug: (entry: DebugEntry) => void;
};

export function useMenuAcceleratorController({ appSettings, onDebug }: Params) {
  const lastToastAtRef = useRef(0);
  const menuAccelerators = useMemo(
    () => [
      {
        id: "file_new_agent",
        shortcut: appSettings.newAgentShortcut,
      },
      {
        id: "file_new_worktree_agent",
        shortcut: appSettings.newWorktreeAgentShortcut,
      },
      {
        id: "file_new_clone_agent",
        shortcut: appSettings.newCloneAgentShortcut,
      },
      {
        id: "view_toggle_projects_sidebar",
        shortcut: appSettings.toggleProjectsSidebarShortcut,
      },
      {
        id: "view_toggle_git_sidebar",
        shortcut: appSettings.toggleGitSidebarShortcut,
      },
      {
        id: "view_branch_switcher",
        shortcut: appSettings.branchSwitcherShortcut,
      },
      {
        id: "view_toggle_debug_panel",
        shortcut: appSettings.toggleDebugPanelShortcut,
      },
      {
        id: "view_toggle_terminal",
        shortcut: appSettings.toggleTerminalShortcut,
      },
      {
        id: "view_next_agent",
        shortcut: appSettings.cycleAgentNextShortcut,
      },
      {
        id: "view_prev_agent",
        shortcut: appSettings.cycleAgentPrevShortcut,
      },
      {
        id: "view_next_workspace",
        shortcut: appSettings.cycleWorkspaceNextShortcut,
      },
      {
        id: "view_prev_workspace",
        shortcut: appSettings.cycleWorkspacePrevShortcut,
      },
      {
        id: "composer_cycle_model",
        shortcut: appSettings.composerModelShortcut,
      },
      {
        id: "composer_cycle_reasoning",
        shortcut: appSettings.composerReasoningShortcut,
      },
      {
        id: "composer_cycle_collaboration",
        shortcut: appSettings.collaborationModesEnabled
          ? appSettings.composerCollaborationShortcut
          : null,
      },
    ],
    [
      appSettings.composerCollaborationShortcut,
      appSettings.composerModelShortcut,
      appSettings.composerReasoningShortcut,
      appSettings.cycleAgentNextShortcut,
      appSettings.cycleAgentPrevShortcut,
      appSettings.cycleWorkspaceNextShortcut,
      appSettings.cycleWorkspacePrevShortcut,
      appSettings.collaborationModesEnabled,
      appSettings.newAgentShortcut,
      appSettings.newCloneAgentShortcut,
      appSettings.newWorktreeAgentShortcut,
      appSettings.toggleGitSidebarShortcut,
      appSettings.branchSwitcherShortcut,
      appSettings.toggleDebugPanelShortcut,
      appSettings.toggleProjectsSidebarShortcut,
      appSettings.toggleTerminalShortcut,
    ],
  );

  const handleMenuAcceleratorError = useCallback(
    (error: unknown) => {
      const now = Date.now();
      if (now - lastToastAtRef.current > 5000) {
        lastToastAtRef.current = now;
        pushErrorToast({
          title: "快捷键同步失败",
          message: "部分菜单快捷键未生效，请检查快捷键设置是否冲突。",
        });
      }
      onDebug({
        id: `${now}-client-menu-accelerator-error`,
        timestamp: now,
        source: "error",
        label: "menu/accelerator-error",
        payload: error instanceof Error ? error.message : String(error),
      });
    },
    [onDebug],
  );

  useMenuAccelerators({
    accelerators: menuAccelerators,
    onError: handleMenuAcceleratorError,
  });
}
