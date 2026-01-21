import type { MutableRefObject } from "react";
import { useCallback, useMemo } from "react";
import type { ThreadSummary, WorkspaceInfo } from "../../../types";

type ThreadRowsFn = (
  threads: ThreadSummary[],
  includeArchived: boolean,
  workspaceId: string,
  getPinTimestamp: (workspaceId: string, threadId: string) => number | null,
) => {
  pinnedRows: { thread: { id: string } }[];
  unpinnedRows: { thread: { id: string } }[];
};

type Params = {
  workspaces: WorkspaceInfo[];
  groupedWorkspaces: { workspaces: WorkspaceInfo[] }[];
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  getThreadRows: ThreadRowsFn;
  getPinTimestamp: (workspaceId: string, threadId: string) => number | null;
  activeWorkspaceIdRef: MutableRefObject<string | null>;
  activeThreadIdRef: MutableRefObject<string | null>;
  exitDiffView: () => void;
  resetPullRequestSelection: () => void;
  selectWorkspace: (workspaceId: string) => void;
  setActiveThreadId: (threadId: string | null, workspaceId: string) => void;
};

export function useWorkspaceCycling({
  workspaces,
  groupedWorkspaces,
  threadsByWorkspace,
  getThreadRows,
  getPinTimestamp,
  activeWorkspaceIdRef,
  activeThreadIdRef,
  exitDiffView,
  resetPullRequestSelection,
  selectWorkspace,
  setActiveThreadId,
}: Params) {
  const orderedWorkspaceIds = useMemo(() => {
    const worktreesByParent = new Map<string, WorkspaceInfo[]>();
    workspaces
      .filter(
        (entry) =>
          (entry.kind ?? "main") === "worktree" && Boolean(entry.parentId),
      )
      .forEach((entry) => {
        const parentId = entry.parentId as string;
        const list = worktreesByParent.get(parentId) ?? [];
        list.push(entry);
        worktreesByParent.set(parentId, list);
      });
    worktreesByParent.forEach((entries) => {
      entries.sort((a, b) => a.name.localeCompare(b.name));
    });

    const ordered: WorkspaceInfo[] = [];
    groupedWorkspaces.forEach((group) => {
      group.workspaces.forEach((workspace) => {
        ordered.push(workspace);
        const worktrees = worktreesByParent.get(workspace.id);
        if (worktrees?.length) {
          ordered.push(...worktrees);
        }
      });
    });

    const seen = new Set(ordered.map((entry) => entry.id));
    workspaces.forEach((entry) => {
      if (!seen.has(entry.id)) {
        ordered.push(entry);
      }
    });

    return ordered.map((entry) => entry.id);
  }, [groupedWorkspaces, workspaces]);

  const getOrderedThreadIds = useCallback(
    (workspaceId: string) => {
      const threads = threadsByWorkspace[workspaceId] ?? [];
      if (!threads.length) {
        return [];
      }
      const { pinnedRows, unpinnedRows } = getThreadRows(
        threads,
        true,
        workspaceId,
        getPinTimestamp,
      );
      return [...pinnedRows, ...unpinnedRows].map((row) => row.thread.id);
    },
    [getPinTimestamp, getThreadRows, threadsByWorkspace],
  );

  const handleCycleAgent = useCallback(
    (direction: "next" | "prev") => {
      const workspaceId = activeWorkspaceIdRef.current;
      if (!workspaceId) {
        return;
      }
      const orderedThreadIds = getOrderedThreadIds(workspaceId);
      if (!orderedThreadIds.length) {
        return;
      }
      const currentThreadId = activeThreadIdRef.current;
      let index = currentThreadId
        ? orderedThreadIds.indexOf(currentThreadId)
        : -1;
      if (index === -1) {
        index = direction === "next" ? -1 : 0;
      }
      const nextIndex =
        direction === "next"
          ? (index + 1) % orderedThreadIds.length
          : (index - 1 + orderedThreadIds.length) % orderedThreadIds.length;
      const nextThreadId = orderedThreadIds[nextIndex];
      exitDiffView();
      resetPullRequestSelection();
      selectWorkspace(workspaceId);
      setActiveThreadId(nextThreadId, workspaceId);
    },
    [
      exitDiffView,
      getOrderedThreadIds,
      activeWorkspaceIdRef,
      activeThreadIdRef,
      resetPullRequestSelection,
      selectWorkspace,
      setActiveThreadId,
    ],
  );

  const handleCycleWorkspace = useCallback(
    (direction: "next" | "prev") => {
      if (!orderedWorkspaceIds.length) {
        return;
      }
      const currentWorkspaceId = activeWorkspaceIdRef.current;
      let index = currentWorkspaceId
        ? orderedWorkspaceIds.indexOf(currentWorkspaceId)
        : -1;
      if (index === -1) {
        index = direction === "next" ? -1 : 0;
      }
      const nextIndex =
        direction === "next"
          ? (index + 1) % orderedWorkspaceIds.length
          : (index - 1 + orderedWorkspaceIds.length) % orderedWorkspaceIds.length;
      const nextWorkspaceId = orderedWorkspaceIds[nextIndex];
      exitDiffView();
      resetPullRequestSelection();
      selectWorkspace(nextWorkspaceId);
      const orderedThreadIds = getOrderedThreadIds(nextWorkspaceId);
      if (orderedThreadIds.length > 0) {
        setActiveThreadId(orderedThreadIds[0], nextWorkspaceId);
      } else {
        setActiveThreadId(null, nextWorkspaceId);
      }
    },
    [
      exitDiffView,
      getOrderedThreadIds,
      activeWorkspaceIdRef,
      orderedWorkspaceIds,
      resetPullRequestSelection,
      selectWorkspace,
      setActiveThreadId,
    ],
  );

  return {
    handleCycleAgent,
    handleCycleWorkspace,
  };
}
