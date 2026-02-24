import type { CSSProperties, MouseEvent } from "react";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";

import type { ThreadSummary } from "../../../types";
import { getThreadStatusClass, type ThreadStatusById } from "../../../utils/threadStatus";

type ThreadRowProps = {
  thread: ThreadSummary;
  depth: number;
  workspaceId: string;
  indentUnit: number;
  hasChildren?: boolean;
  isCollapsed?: boolean;
  onToggleThreadCollapsed?: (workspaceId: string, threadId: string) => void;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusById;
  pendingUserInputKeys?: Set<string>;
  workspaceLabel?: string | null;
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
};

export function ThreadRow({
  thread,
  depth,
  workspaceId,
  indentUnit,
  hasChildren = false,
  isCollapsed = false,
  onToggleThreadCollapsed,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  pendingUserInputKeys,
  workspaceLabel,
  getThreadTime,
  getThreadArgsBadge,
  isThreadPinned,
  onSelectThread,
  onShowThreadMenu,
}: ThreadRowProps) {
  const relativeTime = getThreadTime(thread);
  const badge = getThreadArgsBadge?.(workspaceId, thread.id) ?? null;
  const modelBadge =
    thread.modelId && thread.modelId.trim().length > 0
      ? thread.effort && thread.effort.trim().length > 0
        ? `${thread.modelId} · ${thread.effort}`
        : thread.modelId
      : null;
  const indentStyle =
    depth > 0
      ? ({ "--thread-indent": `${depth * indentUnit}px` } as CSSProperties)
      : undefined;
  const hasPendingUserInput = Boolean(
    pendingUserInputKeys?.has(`${workspaceId}:${thread.id}`),
  );
  const statusClass = getThreadStatusClass(
    threadStatusById[thread.id],
    hasPendingUserInput,
  );
  const canPin = depth === 0;
  const isPinned = canPin && isThreadPinned(workspaceId, thread.id);
  const TreeIcon = isCollapsed ? ChevronRight : ChevronDown;
  const treeLabel = isCollapsed
    ? "Expand subagent threads"
    : "Collapse subagent threads";

  return (
    <div
      className={`thread-row ${
        workspaceId === activeWorkspaceId && thread.id === activeThreadId
          ? "active"
          : ""
      }`}
      style={indentStyle}
      onClick={() => onSelectThread(workspaceId, thread.id)}
      onContextMenu={(event) => onShowThreadMenu(event, workspaceId, thread.id, canPin)}
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
      {onToggleThreadCollapsed ? (
        hasChildren ? (
          <button
            type="button"
            className="thread-tree-toggle"
            aria-label={treeLabel}
            aria-expanded={!isCollapsed}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleThreadCollapsed(workspaceId, thread.id);
            }}
          >
            <TreeIcon size={12} aria-hidden />
          </button>
        ) : (
          <span className="thread-tree-spacer" aria-hidden />
        )
      ) : null}
      {isPinned && <span className="thread-pin-icon" aria-label="Pinned">📌</span>}
      <span className="thread-name">{thread.name}</span>
      <div className="thread-meta">
        {workspaceLabel && <span className="thread-workspace-label">{workspaceLabel}</span>}
        {modelBadge && (
          <span className="thread-model-badge" title={modelBadge}>
            {modelBadge}
          </span>
        )}
        {badge && <span className="thread-args-badge">{badge}</span>}
        {relativeTime && <span className="thread-time">{relativeTime}</span>}
        <div className="thread-menu">
          <div className="thread-menu-trigger" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
