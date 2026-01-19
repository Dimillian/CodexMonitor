import type { CSSProperties, MouseEvent } from "react";

import type { ThreadSummary } from "../../../types";

type ThreadStatusMap = Record<
  string,
  { isProcessing: boolean; hasUnread: boolean; isReviewing: boolean }
>;

type ThreadRow = {
  thread: ThreadSummary;
  depth: number;
};

type ThreadListProps = {
  workspaceId: string;
  threadRows: ThreadRow[];
  totalThreadRoots: number;
  isExpanded: boolean;
  nextCursor: string | null;
  isPaging: boolean;
  nested?: boolean;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusMap;
  getThreadTime: (thread: ThreadSummary) => string | null;
  onToggleExpanded: (workspaceId: string) => void;
  onLoadOlderThreads: (workspaceId: string) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onShowThreadMenu: (
    event: MouseEvent,
    workspaceId: string,
    threadId: string,
  ) => void;
};

export function ThreadList({
  workspaceId,
  threadRows,
  totalThreadRoots,
  isExpanded,
  nextCursor,
  isPaging,
  nested,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  getThreadTime,
  onToggleExpanded,
  onLoadOlderThreads,
  onSelectThread,
  onShowThreadMenu,
}: ThreadListProps) {
  return (
    <div className={`thread-list${nested ? " thread-list-nested" : ""}`}>
      {threadRows.map(({ thread, depth }) => {
        const relativeTime = getThreadTime(thread);
        const indentStyle =
          depth > 0
            ? ({ "--thread-indent": `${depth * 14}px` } as CSSProperties)
            : undefined;
        const status = threadStatusById[thread.id];
        const statusClass = status?.isReviewing
          ? "reviewing"
          : status?.isProcessing
            ? "processing"
            : status?.hasUnread
              ? "unread"
              : "ready";

        return (
          <div
            key={thread.id}
            className={`thread-row ${
              workspaceId === activeWorkspaceId && thread.id === activeThreadId
                ? "active"
                : ""
            }`}
            style={indentStyle}
            onClick={() => onSelectThread(workspaceId, thread.id)}
            onContextMenu={(event) => onShowThreadMenu(event, workspaceId, thread.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectThread(workspaceId, thread.id);
              }
            }}
          >
            <span className={`thread-status ${statusClass}`} aria-hidden />
            <span className="thread-name">{thread.name}</span>
            <div className="thread-meta">
              {relativeTime && <span className="thread-time">{relativeTime}</span>}
              <div className="thread-menu">
                <div className="thread-menu-trigger" aria-hidden="true" />
              </div>
            </div>
          </div>
        );
      })}
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
      {isExpanded && nextCursor && (
        <button
          className="thread-more"
          onClick={(event) => {
            event.stopPropagation();
            onLoadOlderThreads(workspaceId);
          }}
          disabled={isPaging}
        >
          {isPaging ? "Loading..." : "Load older..."}
        </button>
      )}
    </div>
  );
}
