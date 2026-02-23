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
    defaultCodexBin: appSettings.codexBin,
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
    workspacePathsPrompt,
    updateWorkspacePathsPromptValue,
    browseWorkspacePathsPromptDirectory,
    browseWorkspacePathsPromptParentDirectory,
    browseWorkspacePathsPromptHomeDirectory,
    retryWorkspacePathsPromptDirectoryListing,
    toggleWorkspacePathsPromptHiddenDirectories,
    useWorkspacePathsPromptCurrentDirectory,
    cancelWorkspacePathsPrompt,
    confirmWorkspacePathsPrompt,
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        await showWorkspaceRemovalError(errorMessage);
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        await showWorktreeRemovalError(errorMessage);
      }
    },
    [confirmWorktreeRemoval, removeWorktreeCore, showWorktreeRemovalError, workspaces],
  );

  return {
    ...workspaceCore,
    addWorkspace,
    addWorkspacesFromPaths,
    workspacePathsPrompt,
    updateWorkspacePathsPromptValue,
    browseWorkspacePathsPromptDirectory,
    browseWorkspacePathsPromptParentDirectory,
    browseWorkspacePathsPromptHomeDirectory,
    retryWorkspacePathsPromptDirectoryListing,
    toggleWorkspacePathsPromptHiddenDirectories,
    useWorkspacePathsPromptCurrentDirectory,
    cancelWorkspacePathsPrompt,
    confirmWorkspacePathsPrompt,
    removeWorkspace,
    removeWorktree,
  };
}
