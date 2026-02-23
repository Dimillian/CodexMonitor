import { useCallback } from "react";
import { useWorkspaces } from "../../workspaces/hooks/useWorkspaces";
import type { AppSettings, WorkspaceInfo } from "../../../types";
import type { DebugEntry } from "../../../types";
import { useWorkspaceDialogs } from "./useWorkspaceDialogs";

type WorkspaceControllerOptions = {
  appSettings: AppSettings;
  addDebugEntry: (entry: DebugEntry) => void;
  queueSaveSettings: (next: AppSettings) => Promise<AppSettings>;
};

export function useWorkspaceController({
  appSettings,
  addDebugEntry,
  queueSaveSettings,
}: WorkspaceControllerOptions) {
  const workspaceCore = useWorkspaces({
    onDebug: addDebugEntry,
    appSettings,
    onUpdateAppSettings: queueSaveSettings,
  });

  const {
    workspaces,
    addWorkspacesFromPaths: addWorkspacesFromPathsCore,
    removeWorkspace: removeWorkspaceCore,
    removeWorktree: removeWorktreeCore,
  } = workspaceCore;

  const {
    requestWorkspacePaths,
    mobileRemoteWorkspacePathPrompt,
    updateMobileRemoteWorkspacePathInput,
    cancelMobileRemoteWorkspacePathPrompt,
    submitMobileRemoteWorkspacePathPrompt,
    showAddWorkspacesResult,
    confirmWorkspaceRemoval,
    confirmWorktreeRemoval,
    showWorkspaceRemovalError,
    showWorktreeRemovalError,
  } = useWorkspaceDialogs();

  const addWorkspacesFromPaths = useCallback(
    async (paths: string[]): Promise<WorkspaceInfo | null> => {
      const result = await addWorkspacesFromPathsCore(paths);
      await showAddWorkspacesResult(result);
      return result.firstAdded;
    },
    [addWorkspacesFromPathsCore, showAddWorkspacesResult],
  );

  const addWorkspace = useCallback(async (): Promise<WorkspaceInfo | null> => {
    const paths = await requestWorkspacePaths(appSettings.backendMode);
    if (paths.length === 0) {
      return null;
    }
    return addWorkspacesFromPaths(paths);
  }, [addWorkspacesFromPaths, appSettings.backendMode, requestWorkspacePaths]);

  const removeWorkspace = useCallback(
    async (workspaceId: string) => {
      const confirmed = await confirmWorkspaceRemoval(workspaces, workspaceId);
      if (!confirmed) {
        return;
      }
      try {
        await removeWorkspaceCore(workspaceId);
      } catch (error) {
        await showWorkspaceRemovalError(error);
      }
    },
    [confirmWorkspaceRemoval, removeWorkspaceCore, showWorkspaceRemovalError, workspaces],
  );

  const removeWorktree = useCallback(
    async (workspaceId: string) => {
      const confirmed = await confirmWorktreeRemoval(workspaces, workspaceId);
      if (!confirmed) {
        return;
      }
      try {
        await removeWorktreeCore(workspaceId);
      } catch (error) {
        await showWorktreeRemovalError(error);
      }
    },
    [confirmWorktreeRemoval, removeWorktreeCore, showWorktreeRemovalError, workspaces],
  );

  return {
    ...workspaceCore,
    addWorkspace,
    addWorkspacesFromPaths,
    mobileRemoteWorkspacePathPrompt,
    updateMobileRemoteWorkspacePathInput,
    cancelMobileRemoteWorkspacePathPrompt,
    submitMobileRemoteWorkspacePathPrompt,
    removeWorkspace,
    removeWorktree,
  };
}
