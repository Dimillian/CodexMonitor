import Layers from "lucide-react/dist/esm/icons/layers";
import type { MouseEvent, ReactNode } from "react";

import type { ThreadSummary, WorkspaceInfo } from "../../../types";
import type { ThreadStatusById } from "../../../utils/threadStatus";
import { ThreadList } from "./ThreadList";
import { ThreadLoading } from "./ThreadLoading";
import { WorktreeCard } from "./WorktreeCard";

type ThreadRowsResult = {
  pinnedRows: Array<{ thread: ThreadSummary; depth: number }>;
  unpinnedRows: Array<{ thread: ThreadSummary; depth: number }>;
  totalRoots: number;
  hasMoreRoots: boolean;
};

type WorktreeSectionProps = {
  worktrees: WorkspaceInfo[];
  deletingWorktreeIds: Set<string>;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadStatusById: ThreadStatusById;
  threadListLoadingByWorkspace: Record<string, boolean>;
  threadListPagingByWorkspace: Record<string, boolean>;
  threadListCursorByWorkspace: Record<string, string | null>;
  expandedWorkspaces: Set<string>;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  pendingUserInputKeys?: Set<string>;
  getThreadRows: (
    threads: ThreadSummary[],
    isExpanded: boolean,
    workspaceId: string,
    getPinTimestamp: (workspaceId: string, threadId: string) => number | null,
    pinVersion?: number,
  ) => ThreadRowsResult;
  getThreadTime: (thread: ThreadSummary) => string | null;
  getThreadArgsBadge?: (workspaceId: string, threadId: string) => string | null;
  getThreadTokenUsageLabel?: (workspaceId: string, threadId: string) => string | null;
  getWorkspaceTokenUsageLabel?: (workspaceId: string) => string | null;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  getPinTimestamp: (workspaceId: string, threadId: string) => number | null;
  pinnedThreadsVersion: number;
  onSelectWorkspace: (id: string) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onShowThreadMenu: (
    event: MouseEvent,
    workspaceId: string,
    threadId: string,
    canPin: boolean,
  ) => void;
  onShowWorktreeMenu: (event: MouseEvent, worktree: WorkspaceInfo) => void;
  onToggleExpanded: (workspaceId: string) => void;
  onLoadOlderThreads: (workspaceId: string) => void;
  sectionLabel?: string;
  sectionIcon?: ReactNode;
  className?: string;
};

export function WorktreeSection({
  worktrees,
  deletingWorktreeIds,
  threadsByWorkspace,
  threadStatusById,
  threadListLoadingByWorkspace,
  threadListPagingByWorkspace,
  threadListCursorByWorkspace,
  expandedWorkspaces,
  activeWorkspaceId,
  activeThreadId,
  pendingUserInputKeys,
  getThreadRows,
  getThreadTime,
  getThreadArgsBadge,
  getThreadTokenUsageLabel,
  getWorkspaceTokenUsageLabel,
  isThreadPinned,
  getPinTimestamp,
  pinnedThreadsVersion,
  onSelectWorkspace,
  onConnectWorkspace,
  onToggleWorkspaceCollapse,
  onSelectThread,
  onShowThreadMenu,
  onShowWorktreeMenu,
  onToggleExpanded,
  onLoadOlderThreads,
  sectionLabel = "Worktrees",
  sectionIcon,
  className,
}: WorktreeSectionProps) {
  if (!worktrees.length) {
    return null;
  }

  return (
    <div className={`worktree-section${className ? ` ${className}` : ""}`}>
      <div className="worktree-header">
        {sectionIcon ?? <Layers className="worktree-header-icon" aria-hidden />}
        {sectionLabel}
      </div>
      <div className="worktree-list">
        {worktrees.map((worktree) => {
          const worktreeThreads = threadsByWorkspace[worktree.id] ?? [];
          const isLoadingWorktreeThreads =
            threadListLoadingByWorkspace[worktree.id] ?? false;
          const showWorktreeLoader =
            isLoadingWorktreeThreads && worktreeThreads.length === 0;
          const worktreeNextCursor =
            threadListCursorByWorkspace[worktree.id] ?? null;
          const showWorktreeThreadList =
            worktreeThreads.length > 0 || Boolean(worktreeNextCursor);
          const isWorktreePaging =
            threadListPagingByWorkspace[worktree.id] ?? false;
          const isWorktreeExpanded = expandedWorkspaces.has(worktree.id);
          const {
            unpinnedRows: worktreeThreadRows,
            totalRoots: totalWorktreeRoots,
          } = getThreadRows(
            worktreeThreads,
            isWorktreeExpanded,
            worktree.id,
            getPinTimestamp,
            pinnedThreadsVersion,
          );

          return (
            <WorktreeCard
              key={worktree.id}
              worktree={worktree}
              isActive={worktree.id === activeWorkspaceId}
              isDeleting={deletingWorktreeIds.has(worktree.id)}
              worktreeTokenUsageLabel={getWorkspaceTokenUsageLabel?.(worktree.id) ?? null}
              onSelectWorkspace={onSelectWorkspace}
              onShowWorktreeMenu={onShowWorktreeMenu}
              onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
              onConnectWorkspace={onConnectWorkspace}
            >
              {showWorktreeThreadList && (
                <ThreadList
                  workspaceId={worktree.id}
                  pinnedRows={[]}
                  unpinnedRows={worktreeThreadRows}
                  totalThreadRoots={totalWorktreeRoots}
                  isExpanded={isWorktreeExpanded}
                  nextCursor={worktreeNextCursor}
                  isPaging={isWorktreePaging}
                  nested
                  showLoadOlder={false}
                  activeWorkspaceId={activeWorkspaceId}
                  activeThreadId={activeThreadId}
                  threadStatusById={threadStatusById}
                  pendingUserInputKeys={pendingUserInputKeys}
                  getThreadTime={getThreadTime}
                  getThreadArgsBadge={getThreadArgsBadge}
                  getThreadTokenUsageLabel={getThreadTokenUsageLabel}
                  isThreadPinned={isThreadPinned}
                  onToggleExpanded={onToggleExpanded}
                  onLoadOlderThreads={onLoadOlderThreads}
                  onSelectThread={onSelectThread}
                  onShowThreadMenu={onShowThreadMenu}
                />
              )}
              {showWorktreeLoader && <ThreadLoading nested />}
            </WorktreeCard>
          );
        })}
      </div>
    </div>
  );
}
