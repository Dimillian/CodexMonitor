import { useMemo, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { ThreadSummary } from "../../../types";
import type { ThreadStatusById } from "../../../utils/threadStatus";
import { ThreadRow } from "./ThreadRow";
import { buildThreadRowVisibility } from "./threadRowVisibility";

type ThreadListRow = {
  thread: ThreadSummary;
  depth: number;
};

type ThreadListProps = {
  workspaceId: string;
  pinnedRows: ThreadListRow[];
  unpinnedRows: ThreadListRow[];
  totalThreadRoots: number;
  isExpanded: boolean;
  showExpandToggle?: boolean;
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
};

export function ThreadList({
  workspaceId,
  pinnedRows,
  unpinnedRows,
  totalThreadRoots,
  isExpanded,
  showExpandToggle = true,
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
}: ThreadListProps) {
  const { t } = useTranslation();
  const indentUnit = nested ? 10 : 14;
  const [collapsedThreadKeys, setCollapsedThreadKeys] = useState<Set<string>>(new Set());

  const toggleThreadSubagents = (threadId: string) => {
    const threadKey = `${workspaceId}:${threadId}`;
    setCollapsedThreadKeys((prev) => {
      const next = new Set(prev);
      if (next.has(threadKey)) {
        next.delete(threadKey);
      } else {
        next.add(threadKey);
      }
      return next;
    });
  };

  const pinnedVisibility = useMemo(
    () =>
      buildThreadRowVisibility(
        pinnedRows,
        (row) => collapsedThreadKeys.has(`${workspaceId}:${row.thread.id}`),
      ),
    [collapsedThreadKeys, pinnedRows, workspaceId],
  );
  const unpinnedVisibility = useMemo(
    () =>
      buildThreadRowVisibility(
        unpinnedRows,
        (row) => collapsedThreadKeys.has(`${workspaceId}:${row.thread.id}`),
      ),
    [collapsedThreadKeys, unpinnedRows, workspaceId],
  );

  return (
    <div className={`thread-list${nested ? " thread-list-nested" : ""}`}>
      {pinnedVisibility.visibleRows.map((row) => (
        <ThreadRow
          key={row.thread.id}
          thread={row.thread}
          depth={row.depth}
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
          hasSubagentChildren={pinnedVisibility.rowsWithChildren.has(row)}
          subagentsExpanded={!collapsedThreadKeys.has(`${workspaceId}:${row.thread.id}`)}
          onToggleSubagents={(_, threadId) => toggleThreadSubagents(threadId)}
        />
      ))}
      {pinnedVisibility.visibleRows.length > 0 && unpinnedVisibility.visibleRows.length > 0 && (
        <div className="thread-list-separator" aria-hidden="true" />
      )}
      {unpinnedVisibility.visibleRows.map((row) => (
        <ThreadRow
          key={row.thread.id}
          thread={row.thread}
          depth={row.depth}
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
          hasSubagentChildren={unpinnedVisibility.rowsWithChildren.has(row)}
          subagentsExpanded={!collapsedThreadKeys.has(`${workspaceId}:${row.thread.id}`)}
          onToggleSubagents={(_, threadId) => toggleThreadSubagents(threadId)}
        />
      ))}
      {showExpandToggle && totalThreadRoots > 3 && (
        <button
          className="thread-more"
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpanded(workspaceId);
          }}
        >
          {isExpanded ? t("sidebar.showLess") : t("sidebar.more")}
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
            ? t("sidebar.loading")
            : totalThreadRoots === 0
              ? t("sidebar.searchOlder")
              : t("sidebar.loadOlder")}
        </button>
      )}
    </div>
  );
}
