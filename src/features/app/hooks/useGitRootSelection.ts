import { useCallback } from "react";
import { pickWorkspacePath } from "../../../services/tauri";
import type { WorkspaceInfo } from "../../../types";

type UseGitRootSelectionOptions = {
  activeWorkspace: WorkspaceInfo | null;
  updateWorkspaceSettings: (
    workspaceId: string,
    settings: { gitRoot?: string | null },
  ) => Promise<unknown> | unknown;
  clearGitRootCandidates: () => void;
  refreshGitStatus: () => void;
};

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function useGitRootSelection({
  activeWorkspace,
  updateWorkspaceSettings,
  clearGitRootCandidates,
  refreshGitStatus,
}: UseGitRootSelectionOptions) {
  const activeGitRoot = activeWorkspace?.settings.gitRoot ?? null;

  const handleSetGitRoot = useCallback(
    async (path: string | null) => {
      if (!activeWorkspace) {
        return;
      }
      await updateWorkspaceSettings(activeWorkspace.id, {
        gitRoot: path,
      });
      clearGitRootCandidates();
      refreshGitStatus();
    },
    [
      activeWorkspace,
      clearGitRootCandidates,
      refreshGitStatus,
      updateWorkspaceSettings,
    ],
  );

  const handlePickGitRoot = useCallback(async () => {
    if (!activeWorkspace) {
      return;
    }
    const selection = await pickWorkspacePath();
    if (!selection) {
      return;
    }
    const workspacePath = normalizePath(activeWorkspace.path);
    const selectedPath = normalizePath(selection);
    let nextRoot: string | null = null;
    if (selectedPath === workspacePath) {
      nextRoot = null;
    } else if (selectedPath.startsWith(`${workspacePath}/`)) {
      nextRoot = selectedPath.slice(workspacePath.length + 1);
    } else {
      nextRoot = selectedPath;
    }
    await handleSetGitRoot(nextRoot);
  }, [activeWorkspace, handleSetGitRoot]);

  return {
    activeGitRoot,
    handleSetGitRoot,
    handlePickGitRoot,
  };
}
