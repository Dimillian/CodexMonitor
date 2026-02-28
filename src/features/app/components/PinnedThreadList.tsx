import type { MouseEvent } from "react";

import type { ThreadSummary } from "../../../types";
import type { ThreadStatusById } from "../../../utils/threadStatus";
import { ThreadRow } from "./ThreadRow";

type PinnedThreadRow = {
  thread: ThreadSummary;
  depth: number;
  hasChildren: boolean;
  workspaceId: string;
};

type PinnedThreadListProps = {
  rows: PinnedThreadRow[];
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusById;
  pendingUserInputKeys?: Set<string>;
  getWorkspaceLabel?: (workspaceId: string) => string | null;
  getThreadTime: (thread: ThreadSummary) => string | null;
  getThreadArgsBadge?: (workspaceId: string, threadId: string) => string | null;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onShowThreadMenu: (
    event: MouseEvent,
    workspaceId: string,
    threadId: string,
    canPin: boolean,
  ) => void;
  collapsedThreadIdsByWorkspace?: Record<string, ReadonlySet<string>>;
  onToggleThreadChildren?: (workspaceId: string, threadId: string) => void;
};

export function PinnedThreadList({
  rows,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  pendingUserInputKeys,
  getWorkspaceLabel,
  getThreadTime,
  getThreadArgsBadge,
  isThreadPinned,
  onSelectThread,
  onShowThreadMenu,
  collapsedThreadIdsByWorkspace,
  onToggleThreadChildren,
}: PinnedThreadListProps) {
  return (
    <div className="thread-list pinned-thread-list">
      {rows.map(({ thread, depth, hasChildren, workspaceId }) => {
        return (
          <ThreadRow
            key={`${workspaceId}:${thread.id}`}
            thread={thread}
            depth={depth}
            hasChildren={hasChildren}
            workspaceId={workspaceId}
            indentUnit={14}
            activeWorkspaceId={activeWorkspaceId}
            activeThreadId={activeThreadId}
            threadStatusById={threadStatusById}
            pendingUserInputKeys={pendingUserInputKeys}
            workspaceLabel={getWorkspaceLabel?.(workspaceId) ?? null}
            getThreadTime={getThreadTime}
            getThreadArgsBadge={getThreadArgsBadge}
            isThreadPinned={isThreadPinned}
            onSelectThread={onSelectThread}
            onShowThreadMenu={onShowThreadMenu}
            isCollapsed={Boolean(collapsedThreadIdsByWorkspace?.[workspaceId]?.has(thread.id))}
            onToggleThreadChildren={onToggleThreadChildren}
          />
        );
      })}
    </div>
  );
}
