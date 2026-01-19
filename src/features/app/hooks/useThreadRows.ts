import { useCallback } from "react";

import type { ThreadSummary } from "../../../types";

type ThreadRow = {
  thread: ThreadSummary;
  depth: number;
};

type ThreadRowResult = {
  rows: ThreadRow[];
  totalRoots: number;
  hasMoreRoots: boolean;
};

export function useThreadRows(threadParentById: Record<string, string>) {
  const getThreadRows = useCallback(
    (threads: ThreadSummary[], isExpanded: boolean): ThreadRowResult => {
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

      const visibleRootCount = isExpanded ? roots.length : 3;
      const visibleRoots = roots.slice(0, visibleRootCount);
      const rows: ThreadRow[] = [];
      const appendThread = (thread: ThreadSummary, depth: number) => {
        rows.push({ thread, depth });
        const children = childrenByParent.get(thread.id) ?? [];
        children.forEach((child) => appendThread(child, depth + 1));
      };

      visibleRoots.forEach((thread) => appendThread(thread, 0));

      return {
        rows,
        totalRoots: roots.length,
        hasMoreRoots: roots.length > visibleRootCount,
      };
    },
    [threadParentById],
  );

  return { getThreadRows };
}
