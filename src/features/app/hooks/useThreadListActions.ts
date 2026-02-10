import { useCallback } from "react";
import type { ThreadListSortKey, WorkspaceInfo } from "../../../types";

type ListThreadsOptions = {
  sortKey?: ThreadListSortKey;
};

type UseThreadListActionsOptions = {
  threadListSortKey: ThreadListSortKey;
  setThreadListSortKey: (sortKey: ThreadListSortKey) => void;
  workspaces: WorkspaceInfo[];
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

  const handleRefreshAllWorkspaceThreads = useCallback(() => {
    const connectedWorkspaces = workspaces.filter((workspace) => workspace.connected);
    connectedWorkspaces.forEach((workspace) => {
      resetWorkspaceThreads(workspace.id);
      void listThreadsForWorkspace(workspace);
    });
  }, [workspaces, resetWorkspaceThreads, listThreadsForWorkspace]);

  return {
    handleSetThreadListSortKey,
    handleRefreshAllWorkspaceThreads,
  };
}
