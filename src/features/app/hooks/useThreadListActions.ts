import { useCallback } from "react";
import type { ThreadListSortKey, WorkspaceInfo } from "../../../types";

type ListThreadsOptions = {
  sortKey?: ThreadListSortKey;
};

type UseThreadListActionsOptions = {
  threadListSortKey: ThreadListSortKey;
  setThreadListSortKey: (sortKey: ThreadListSortKey) => void;
  workspaces: WorkspaceInfo[];
  refreshWorkspaces: () => Promise<WorkspaceInfo[] | undefined>;
  listThreadsForWorkspace: (
    workspace: WorkspaceInfo,
    options?: ListThreadsOptions,
  ) => void | Promise<void>;
  resetWorkspaceThreads: (workspaceId: string) => void;
};

export function useThreadListActions({
  threadListSortKey,
  setThreadListSortKey,
  workspaces,
  refreshWorkspaces,
  listThreadsForWorkspace,
  resetWorkspaceThreads,
}: UseThreadListActionsOptions) {
  const handleSetThreadListSortKey = useCallback(
    (nextSortKey: ThreadListSortKey) => {
      if (nextSortKey === threadListSortKey) {
        return;
      }
      setThreadListSortKey(nextSortKey);
      workspaces
        .filter((workspace) => workspace.connected)
        .forEach((workspace) => {
          void listThreadsForWorkspace(workspace, { sortKey: nextSortKey });
        });
    },
    [threadListSortKey, setThreadListSortKey, workspaces, listThreadsForWorkspace],
  );

  const handleRefreshAllWorkspaceThreads = useCallback(async () => {
    const refreshed = await refreshWorkspaces();
    const source = refreshed ?? workspaces;
    const connectedWorkspaces = source.filter((workspace) => workspace.connected);
    connectedWorkspaces.forEach((workspace) => {
      resetWorkspaceThreads(workspace.id);
      void listThreadsForWorkspace(workspace);
    });
  }, [refreshWorkspaces, workspaces, resetWorkspaceThreads, listThreadsForWorkspace]);

  return {
    handleSetThreadListSortKey,
    handleRefreshAllWorkspaceThreads,
  };
}
