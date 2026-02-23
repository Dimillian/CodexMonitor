import type { CSSProperties, MouseEvent } from "react";

import type { ThreadSummary } from "../../../types";
import { getThreadStatusClass, type ThreadStatusById } from "../../../utils/threadStatus";

type ThreadRowProps = {
  thread: ThreadSummary;
  depth: number;
  workspaceId: string;
  indentUnit: number;
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
