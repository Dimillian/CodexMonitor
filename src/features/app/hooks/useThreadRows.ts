import { useCallback } from "react";

import type { ThreadSummary } from "../../../types";

type ThreadRow = {
  thread: ThreadSummary;
  depth: number;
};

type ThreadRowResult = {
  pinnedRows: ThreadRow[];
  unpinnedRows: ThreadRow[];
  totalRoots: number;
  hasMoreRoots: boolean;
};

export function useThreadRows(threadParentById: Record<string, string>) {
  const getThreadRows = useCallback(
    (
      threads: ThreadSummary[],
      isExpanded: boolean,
      workspaceId: string,
      getPinTimestamp: (workspaceId: string, threadId: string) => number | null,
    ): ThreadRowResult => {
      const threadIds = new Set(threads.map((thread) => thread.id));
      const childrenByParent = new Map<string, ThreadSummary[]>();
      const roots: ThreadSummary[] = [];

      threads.forEach((thread) => {
        const parentId = threadParentById[thread.id];
        if (parentId && parentId !== thread.id && threadIds.has(parentId)) {
          const list = childrenByParent.get(parentId) ?? [];
          list.push(thread);
          childrenByParent.set(parentId, list);
        } else {
          roots.push(thread);
        }
      });

      const pinnedRoots: ThreadSummary[] = [];
      const unpinnedRoots: ThreadSummary[] = [];

      roots.forEach((thread) => {
        const pinTime = getPinTimestamp(workspaceId, thread.id);
        if (pinTime !== null) {
          pinnedRoots.push(thread);
        } else {
          unpinnedRoots.push(thread);
        }
      });

      pinnedRoots.sort((a, b) => {
        const aTime = getPinTimestamp(workspaceId, a.id) ?? 0;
        const bTime = getPinTimestamp(workspaceId, b.id) ?? 0;
        return aTime - bTime;
      });

      const visibleRootCount = isExpanded ? unpinnedRoots.length : 3;
      const visibleRoots = unpinnedRoots.slice(0, visibleRootCount);

      const appendThread = (
        thread: ThreadSummary,
        depth: number,
        rows: ThreadRow[],
      ) => {
        rows.push({ thread, depth });
        const children = childrenByParent.get(thread.id) ?? [];
        children.forEach((child) => appendThread(child, depth + 1, rows));
      };

      const pinnedRows: ThreadRow[] = [];
      pinnedRoots.forEach((thread) => appendThread(thread, 0, pinnedRows));

      const unpinnedRows: ThreadRow[] = [];
      visibleRoots.forEach((thread) => appendThread(thread, 0, unpinnedRows));

      return {
        pinnedRows,
        unpinnedRows,
        totalRoots: unpinnedRoots.length,
        hasMoreRoots: unpinnedRoots.length > visibleRootCount,
      };
    },
    [threadParentById],
  );

  return { getThreadRows };
}
