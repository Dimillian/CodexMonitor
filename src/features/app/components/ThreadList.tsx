import type { MouseEvent } from "react";

import type { ThreadSummary } from "../../../types";
import type { ThreadStatusById } from "../../../utils/threadStatus";
import { ThreadRow } from "./ThreadRow";

type ThreadListRow = {
  thread: ThreadSummary;
  depth: number;
  hasChildren: boolean;
};

type ThreadListProps = {
  workspaceId: string;
  pinnedRows: ThreadListRow[];
  unpinnedRows: ThreadListRow[];
  totalThreadRoots: number;
  isExpanded: boolean;
  nextCursor: string | null;
  isPaging: boolean;
  nested?: boolean;
  showLoadOlder?: boolean;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusById;
  pendingUserInputKeys?: Set<string>;
  getThreadTime: (thread: ThreadSummary) => string | null;
  getThreadArgsBadge?: (workspaceId: string, threadId: string) => string | null;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  onToggleExpanded: (workspaceId: string) => void;
  onLoadOlderThreads: (workspaceId: string) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onShowThreadMenu: (
    event: MouseEvent,
    workspaceId: string,
    threadId: string,
    canPin: boolean,
  ) => void;
  collapsedThreadIds?: ReadonlySet<string>;
  onToggleThreadChildren?: (workspaceId: string, threadId: string) => void;
};

export function ThreadList({
  workspaceId,
  pinnedRows,
  unpinnedRows,
  totalThreadRoots,
  isExpanded,
  nextCursor,
  isPaging,
  nested,
  showLoadOlder = true,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  pendingUserInputKeys,
  getThreadTime,
  getThreadArgsBadge,
  isThreadPinned,
  onToggleExpanded,
  onLoadOlderThreads,
  onSelectThread,
  onShowThreadMenu,
  collapsedThreadIds,
  onToggleThreadChildren,
}: ThreadListProps) {
  const indentUnit = nested ? 10 : 14;

  return (
    <div className={`thread-list${nested ? " thread-list-nested" : ""}`}>
      {pinnedRows.map(({ thread, depth, hasChildren }) => (
        <ThreadRow
          key={thread.id}
          thread={thread}
          depth={depth}
          hasChildren={hasChildren}
          workspaceId={workspaceId}
          indentUnit={indentUnit}
          activeWorkspaceId={activeWorkspaceId}
          activeThreadId={activeThreadId}
          threadStatusById={threadStatusById}
          pendingUserInputKeys={pendingUserInputKeys}
          getThreadTime={getThreadTime}
          getThreadArgsBadge={getThreadArgsBadge}
          isThreadPinned={isThreadPinned}
          onSelectThread={onSelectThread}
          onShowThreadMenu={onShowThreadMenu}
          isCollapsed={Boolean(collapsedThreadIds?.has(thread.id))}
          onToggleThreadChildren={onToggleThreadChildren}
        />
      ))}
      {pinnedRows.length > 0 && unpinnedRows.length > 0 && (
        <div className="thread-list-separator" aria-hidden="true" />
      )}
      {unpinnedRows.map(({ thread, depth, hasChildren }) => (
        <ThreadRow
          key={thread.id}
          thread={thread}
          depth={depth}
          hasChildren={hasChildren}
          workspaceId={workspaceId}
          indentUnit={indentUnit}
          activeWorkspaceId={activeWorkspaceId}
          activeThreadId={activeThreadId}
          threadStatusById={threadStatusById}
          pendingUserInputKeys={pendingUserInputKeys}
          getThreadTime={getThreadTime}
          getThreadArgsBadge={getThreadArgsBadge}
          isThreadPinned={isThreadPinned}
          onSelectThread={onSelectThread}
          onShowThreadMenu={onShowThreadMenu}
          isCollapsed={Boolean(collapsedThreadIds?.has(thread.id))}
          onToggleThreadChildren={onToggleThreadChildren}
        />
      ))}
      {totalThreadRoots > 3 && (
        <button
          className="thread-more"
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpanded(workspaceId);
          }}
        >
          {isExpanded ? "Show less" : "More..."}
        </button>
      )}
      {showLoadOlder && nextCursor && (isExpanded || totalThreadRoots <= 3) && (
        <button
          className="thread-more"
          onClick={(event) => {
            event.stopPropagation();
            onLoadOlderThreads(workspaceId);
          }}
          disabled={isPaging}
        >
          {isPaging
            ? "Loading..."
            : totalThreadRoots === 0
              ? "Search older..."
              : "Load older..."}
        </button>
      )}
    </div>
  );
}
