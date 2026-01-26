import { useCallback, useMemo } from "react";
import { useMenuAccelerators } from "./useMenuAccelerators";
import type { AppSettings, DebugEntry } from "../../../types";

type Params = {
  appSettings: AppSettings;
  onDebug: (entry: DebugEntry) => void;
};

export function useMenuAcceleratorController({ appSettings, onDebug }: Params) {
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
        id: "composer_cycle_access",
        shortcut: appSettings.composerAccessShortcut,
      },
      {
        id: "composer_cycle_reasoning",
        shortcut: appSettings.composerReasoningShortcut,
      },
      {
        id: "composer_cycle_collaboration",
        shortcut: appSettings.experimentalCollaborationModesEnabled
          ? appSettings.composerCollaborationShortcut
          : null,
      },
    ],
    [
      appSettings.composerAccessShortcut,
      appSettings.composerCollaborationShortcut,
      appSettings.composerModelShortcut,
      appSettings.composerReasoningShortcut,
      appSettings.cycleAgentNextShortcut,
      appSettings.cycleAgentPrevShortcut,
      appSettings.cycleWorkspaceNextShortcut,
      appSettings.cycleWorkspacePrevShortcut,
      appSettings.experimentalCollaborationModesEnabled,
      appSettings.newAgentShortcut,
      appSettings.newCloneAgentShortcut,
      appSettings.newWorktreeAgentShortcut,
      appSettings.toggleGitSidebarShortcut,
      appSettings.toggleDebugPanelShortcut,
      appSettings.toggleProjectsSidebarShortcut,
      appSettings.toggleTerminalShortcut,
    ],
  );

  const handleMenuAcceleratorError = useCallback(
    (error: unknown) => {
      onDebug({
        id: `${Date.now()}-client-menu-accelerator-error`,
        timestamp: Date.now(),
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
