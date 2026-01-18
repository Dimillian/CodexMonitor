import type { RateLimitSnapshot, ThreadSummary, WorkspaceInfo } from "../../../types";
import { FolderKanban, Layers, ScrollText, Settings } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { formatRelativeTime, formatRelativeTimeShort } from "../../../utils/time";

type SidebarProps = {
  workspaces: WorkspaceInfo[];
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadStatusById: Record<
    string,
    { isProcessing: boolean; hasUnread: boolean; isReviewing: boolean }
  >;
  threadListLoadingByWorkspace: Record<string, boolean>;
  threadListPagingByWorkspace: Record<string, boolean>;
  threadListCursorByWorkspace: Record<string, string | null>;
  lastAgentMessageByThread: Record<string, { text: string; timestamp: number }>;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  accountRateLimits: RateLimitSnapshot | null;
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  onAddWorkspace: () => void;
  onSelectHome: () => void;
  onSelectWorkspace: (id: string) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onAddAgent: (workspace: WorkspaceInfo) => void;
  onAddWorktreeAgent: (workspace: WorkspaceInfo) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onDeleteWorktree: (workspaceId: string) => void;
  onLoadOlderThreads: (workspaceId: string) => void;
  onReloadWorkspaceThreads: (workspaceId: string) => void;
};

export function Sidebar({
  workspaces,
  threadsByWorkspace,
  threadStatusById,
  threadListLoadingByWorkspace,
  threadListPagingByWorkspace,
  threadListCursorByWorkspace,
  lastAgentMessageByThread,
  activeWorkspaceId,
  activeThreadId,
  accountRateLimits,
  onOpenSettings,
  onOpenDebug,
  showDebugButton,
  onAddWorkspace,
  onSelectHome,
  onSelectWorkspace,
  onConnectWorkspace,
  onAddAgent,
  onAddWorktreeAgent,
  onToggleWorkspaceCollapse,
  onSelectThread,
  onDeleteThread,
  onDeleteWorkspace,
  onDeleteWorktree,
  onLoadOlderThreads,
  onReloadWorkspaceThreads,
}: SidebarProps) {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState(
    new Set<string>(),
  );
  const [addMenuAnchor, setAddMenuAnchor] = useState<{
    workspaceId: string;
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const sidebarBodyRef = useRef<HTMLDivElement | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: false, bottom: false });

  const updateScrollFade = useCallback(() => {
    const node = sidebarBodyRef.current;
    if (!node) {
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = node;
    const canScroll = scrollHeight > clientHeight;
    const next = {
      top: canScroll && scrollTop > 0,
      bottom: canScroll && scrollTop + clientHeight < scrollHeight - 1,
    };
    setScrollFade((prev) =>
      prev.top === next.top && prev.bottom === next.bottom ? prev : next,
    );
  }, []);

  const getThreadTime = useCallback(
    (thread: ThreadSummary) => {
      const lastMessage = lastAgentMessageByThread[thread.id];
      const timestamp = lastMessage?.timestamp ?? thread.updatedAt ?? null;
      return timestamp ? formatRelativeTimeShort(timestamp) : null;
    },
    [lastAgentMessageByThread],
  );

  useEffect(() => {
    if (!addMenuAnchor) {
      return;
    }
    function handlePointerDown(event: Event) {
      const target = event.target as Node | null;
      if (addMenuRef.current && target && addMenuRef.current.contains(target)) {
        return;
      }
      setAddMenuAnchor(null);
    }
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handlePointerDown, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handlePointerDown, true);
    };
  }, [addMenuAnchor]);

  useEffect(() => {
    const frame = requestAnimationFrame(updateScrollFade);
    return () => cancelAnimationFrame(frame);
  }, [updateScrollFade, workspaces, threadsByWorkspace, expandedWorkspaces]);

  async function showThreadMenu(
    event: React.MouseEvent,
    workspaceId: string,
    threadId: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const archiveItem = await MenuItem.new({
      text: "Archive",
      action: () => onDeleteThread(workspaceId, threadId),
    });
    const copyItem = await MenuItem.new({
      text: "Copy ID",
      action: async () => {
        await navigator.clipboard.writeText(threadId);
      },
    });
    const menu = await Menu.new({ items: [copyItem, archiveItem] });
    const window = getCurrentWindow();
    const position = new LogicalPosition(event.clientX, event.clientY);
    await menu.popup(position, window);
  }

  async function showWorkspaceMenu(
    event: React.MouseEvent,
    workspaceId: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const reloadItem = await MenuItem.new({
      text: "Reload threads",
      action: () => onReloadWorkspaceThreads(workspaceId),
    });
    const deleteItem = await MenuItem.new({
      text: "Delete",
      action: () => onDeleteWorkspace(workspaceId),
    });
    const menu = await Menu.new({ items: [reloadItem, deleteItem] });
    const window = getCurrentWindow();
    const position = new LogicalPosition(event.clientX, event.clientY);
    await menu.popup(position, window);
  }

  async function showWorktreeMenu(
    event: React.MouseEvent,
    workspaceId: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const reloadItem = await MenuItem.new({
      text: "Reload threads",
      action: () => onReloadWorkspaceThreads(workspaceId),
    });
    const deleteItem = await MenuItem.new({
      text: "Delete worktree",
      action: () => onDeleteWorktree(workspaceId),
    });
    const menu = await Menu.new({ items: [reloadItem, deleteItem] });
    const window = getCurrentWindow();
    const position = new LogicalPosition(event.clientX, event.clientY);
    await menu.popup(position, window);
  }

  const usagePercent = accountRateLimits?.primary?.usedPercent;
  const globalUsagePercent = accountRateLimits?.secondary?.usedPercent;
  const credits = accountRateLimits?.credits ?? null;
  const creditsLabel = (() => {
    if (!credits?.hasCredits) {
      return null;
    }
    if (credits.unlimited) {
      return "Credits: Unlimited";
    }
    const balance = credits.balance?.trim() ?? "";
    if (!balance) {
      return null;
    }
    const intValue = Number.parseInt(balance, 10);
    if (Number.isFinite(intValue) && intValue > 0) {
      return `Credits: ${intValue} credits`;
    }
    const floatValue = Number.parseFloat(balance);
    if (Number.isFinite(floatValue) && floatValue > 0) {
      const rounded = Math.round(floatValue);
      return rounded > 0 ? `Credits: ${rounded} credits` : null;
    }
    return null;
  })();

  const clampPercent = (value: number) =>
    Math.min(Math.max(Math.round(value), 0), 100);
  const sessionPercent =
    typeof usagePercent === "number" ? clampPercent(usagePercent) : null;
  const weeklyPercent =
    typeof globalUsagePercent === "number" ? clampPercent(globalUsagePercent) : null;
  const sessionLabel = "Session";
  const weeklyLabel = "Weekly";
  const sessionResetLabel = (() => {
    const resetValue = accountRateLimits?.primary?.resetsAt;
    if (typeof resetValue !== "number" || !Number.isFinite(resetValue)) {
      return null;
    }
    const resetMs = resetValue > 1_000_000_000_000 ? resetValue : resetValue * 1000;
    const relative = formatRelativeTime(resetMs).replace(/^in\s+/i, "");
    return `Resets ${relative}`;
  })();
  const weeklyResetLabel = (() => {
    const resetValue = accountRateLimits?.secondary?.resetsAt;
    if (typeof resetValue !== "number" || !Number.isFinite(resetValue)) {
      return null;
    }
    const resetMs = resetValue > 1_000_000_000_000 ? resetValue : resetValue * 1000;
    const relative = formatRelativeTime(resetMs).replace(/^in\s+/i, "");
    return `Resets ${relative}`;
  })();

  const rootWorkspaces = workspaces
    .filter((entry) => (entry.kind ?? "main") !== "worktree" && !entry.parentId)
    .slice()
    .sort((a, b) => {
      const aOrder =
        typeof a.settings.sortOrder === "number"
          ? a.settings.sortOrder
          : Number.MAX_SAFE_INTEGER;
      const bOrder =
        typeof b.settings.sortOrder === "number"
          ? b.settings.sortOrder
          : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return a.name.localeCompare(b.name);
    });
  const worktreesByParent = new Map<string, WorkspaceInfo[]>();
  workspaces
    .filter((entry) => (entry.kind ?? "main") === "worktree" && entry.parentId)
    .forEach((entry) => {
      const parentId = entry.parentId as string;
      const list = worktreesByParent.get(parentId) ?? [];
      list.push(entry);
      worktreesByParent.set(parentId, list);
    });
  worktreesByParent.forEach((entries) => {
    entries.sort((a, b) => a.name.localeCompare(b.name));
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div>
          <button
            className="subtitle subtitle-button"
            onClick={onSelectHome}
            data-tauri-drag-region="false"
            aria-label="Open home"
          >
            <FolderKanban className="sidebar-nav-icon" />
            Projects
          </button>
        </div>
        <button
          className="ghost workspace-add"
          onClick={onAddWorkspace}
          data-tauri-drag-region="false"
          aria-label="Add workspace"
        >
          +
        </button>
      </div>
      <div
        className={`sidebar-body${scrollFade.top ? " fade-top" : ""}${
          scrollFade.bottom ? " fade-bottom" : ""
        }`}
        onScroll={updateScrollFade}
        ref={sidebarBodyRef}
      >
        <div className="workspace-list">
          {rootWorkspaces.map((entry) => {
            const threads = threadsByWorkspace[entry.id] ?? [];
            const isCollapsed = entry.settings.sidebarCollapsed;
            const showThreads = !isCollapsed && threads.length > 0;
            const isLoadingThreads =
              threadListLoadingByWorkspace[entry.id] ?? false;
            const showThreadLoader =
              !isCollapsed && isLoadingThreads && threads.length === 0;
            const nextCursor = threadListCursorByWorkspace[entry.id] ?? null;
            const isPaging = threadListPagingByWorkspace[entry.id] ?? false;
            const worktrees = worktreesByParent.get(entry.id) ?? [];

            return (
              <div key={entry.id} className="workspace-card">
                <div
                  className={`workspace-row ${
                    entry.id === activeWorkspaceId ? "active" : ""
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectWorkspace(entry.id)}
                  onContextMenu={(event) => showWorkspaceMenu(event, entry.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectWorkspace(entry.id);
                    }
                  }}
                >
                  <div>
                    <div className="workspace-name-row">
                      <div className="workspace-title">
                        <span className="workspace-name">{entry.name}</span>
                        <button
                          className={`workspace-toggle ${
                            isCollapsed ? "" : "expanded"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleWorkspaceCollapse(entry.id, !isCollapsed);
                          }}
                          data-tauri-drag-region="false"
                          aria-label={
                            isCollapsed ? "Show agents" : "Hide agents"
                          }
                          aria-expanded={!isCollapsed}
                        >
                          <span className="workspace-toggle-icon">›</span>
                        </button>
                      </div>
                      <button
                        className="ghost workspace-add"
                        onClick={(event) => {
                          event.stopPropagation();
                          const rect = (
                            event.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          const menuWidth = 200;
                          const left = Math.min(
                            Math.max(rect.left, 12),
                            window.innerWidth - menuWidth - 12,
                          );
                          const top = rect.bottom + 8;
                          setAddMenuAnchor((prev) =>
                            prev?.workspaceId === entry.id
                              ? null
                              : {
                                  workspaceId: entry.id,
                                  top,
                                  left,
                                  width: menuWidth,
                                },
                          );
                        }}
                        data-tauri-drag-region="false"
                        aria-label="Add agent options"
                        aria-expanded={addMenuAnchor?.workspaceId === entry.id}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {!entry.connected && (
                    <span
                      className="connect"
                      onClick={(event) => {
                        event.stopPropagation();
                        onConnectWorkspace(entry);
                      }}
                    >
                      connect
                    </span>
                  )}
                </div>
                {addMenuAnchor?.workspaceId === entry.id &&
                  createPortal(
                    <div
                      className="workspace-add-menu popover-surface"
                      ref={addMenuRef}
                      style={{
                        top: addMenuAnchor.top,
                        left: addMenuAnchor.left,
                        width: addMenuAnchor.width,
                      }}
                    >
                      <button
                        className="workspace-add-option"
                        onClick={(event) => {
                          event.stopPropagation();
                          setAddMenuAnchor(null);
                          onAddAgent(entry);
                        }}
                      >
                        New agent
                      </button>
                      <button
                        className="workspace-add-option"
                        onClick={(event) => {
                          event.stopPropagation();
                          setAddMenuAnchor(null);
                          onAddWorktreeAgent(entry);
                        }}
                      >
                        New worktree agent
                      </button>
                    </div>,
                    document.body,
                  )}
                {!isCollapsed && worktrees.length > 0 && (
                  <div className="worktree-section">
                    <div className="worktree-header">
                      <Layers className="worktree-header-icon" aria-hidden />
                      Worktrees
                    </div>
                    <div className="worktree-list">
                      {worktrees.map((worktree) => {
                        const worktreeThreads =
                          threadsByWorkspace[worktree.id] ?? [];
                        const worktreeCollapsed =
                          worktree.settings.sidebarCollapsed;
                        const showWorktreeThreads =
                          !worktreeCollapsed && worktreeThreads.length > 0;
                        const isLoadingWorktreeThreads =
                          threadListLoadingByWorkspace[worktree.id] ?? false;
                        const showWorktreeLoader =
                          !worktreeCollapsed &&
                          isLoadingWorktreeThreads &&
                          worktreeThreads.length === 0;
                        const worktreeNextCursor =
                          threadListCursorByWorkspace[worktree.id] ?? null;
                        const isWorktreePaging =
                          threadListPagingByWorkspace[worktree.id] ?? false;
                        const worktreeBranch = worktree.worktree?.branch ?? "";

                        return (
                          <div key={worktree.id} className="worktree-card">
                            <div
                              className={`worktree-row ${
                                worktree.id === activeWorkspaceId ? "active" : ""
                              }`}
                              role="button"
                              tabIndex={0}
                              onClick={() => onSelectWorkspace(worktree.id)}
                              onContextMenu={(event) =>
                                showWorktreeMenu(event, worktree.id)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  onSelectWorkspace(worktree.id);
                                }
                              }}
                            >
                              <div className="worktree-label">
                                {worktreeBranch || worktree.name}
                              </div>
                              <div className="worktree-actions">
                                <button
                                  className={`worktree-toggle ${
                                    worktreeCollapsed ? "" : "expanded"
                                  }`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onToggleWorkspaceCollapse(
                                      worktree.id,
                                      !worktreeCollapsed,
                                    );
                                  }}
                                  data-tauri-drag-region="false"
                                  aria-label={
                                    worktreeCollapsed ? "Show agents" : "Hide agents"
                                  }
                                  aria-expanded={!worktreeCollapsed}
                                >
                                  <span className="worktree-toggle-icon">›</span>
                                </button>
                                {!worktree.connected && (
                                  <span
                                    className="connect"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onConnectWorkspace(worktree);
                                    }}
                                  >
                                    connect
                                  </span>
                                )}
                              </div>
                            </div>
                            {showWorktreeThreads && (
                              <div className="thread-list thread-list-nested">
                                {(expandedWorkspaces.has(worktree.id)
                                  ? worktreeThreads
                                  : worktreeThreads.slice(0, 3)
                                ).map((thread) => {
                                  const relativeTime = getThreadTime(thread);
                                  return (
                                    <div
                                      key={thread.id}
                                      className={`thread-row ${
                                        worktree.id === activeWorkspaceId &&
                                        thread.id === activeThreadId
                                          ? "active"
                                          : ""
                                      }`}
                                      onClick={() =>
                                        onSelectThread(worktree.id, thread.id)
                                      }
                                      onContextMenu={(event) =>
                                        showThreadMenu(event, worktree.id, thread.id)
                                      }
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(event) => {
                                        if (
                                          event.key === "Enter" ||
                                          event.key === " "
                                        ) {
                                          event.preventDefault();
                                          onSelectThread(worktree.id, thread.id);
                                        }
                                      }}
                                    >
                                      <span
                                        className={`thread-status ${
                                          threadStatusById[thread.id]?.isReviewing
                                            ? "reviewing"
                                            : threadStatusById[thread.id]?.isProcessing
                                              ? "processing"
                                              : threadStatusById[thread.id]?.hasUnread
                                                ? "unread"
                                                : "ready"
                                        }`}
                                        aria-hidden
                                      />
                                      <span className="thread-name">
                                        {thread.name}
                                      </span>
                                      <div className="thread-meta">
                                        {relativeTime && (
                                          <span className="thread-time">
                                            {relativeTime}
                                          </span>
                                        )}
                                        <div className="thread-menu">
                                          <button
                                            className="thread-menu-trigger"
                                            aria-label="Thread menu"
                                            onMouseDown={(event) =>
                                              event.stopPropagation()
                                            }
                                            onClick={(event) =>
                                              showThreadMenu(
                                                event,
                                                worktree.id,
                                                thread.id,
                                              )
                                            }
                                          >
                                            ...
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                                {worktreeThreads.length > 3 && (
                                  <button
                                    className="thread-more"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setExpandedWorkspaces((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(worktree.id)) {
                                          next.delete(worktree.id);
                                        } else {
                                          next.add(worktree.id);
                                        }
                                        return next;
                                      });
                                    }}
                                  >
                                    {expandedWorkspaces.has(worktree.id)
                                      ? "Show less"
                                      : "More..."}
                                  </button>
                                )}
                                {expandedWorkspaces.has(worktree.id) &&
                                  worktreeNextCursor && (
                                    <button
                                      className="thread-more"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onLoadOlderThreads(worktree.id);
                                      }}
                                      disabled={isWorktreePaging}
                                    >
                                      {isWorktreePaging
                                        ? "Loading..."
                                        : "Load older..."}
                                    </button>
                                  )}
                              </div>
                            )}
                            {showWorktreeLoader && (
                              <div
                                className="thread-loading thread-loading-nested"
                                aria-label="Loading agents"
                              >
                                <span className="thread-skeleton thread-skeleton-wide" />
                                <span className="thread-skeleton" />
                                <span className="thread-skeleton thread-skeleton-short" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {showThreads && (
                  <div className="thread-list">
                    {(expandedWorkspaces.has(entry.id)
                      ? threads
                      : threads.slice(0, 3)
                    ).map((thread) => {
                      const relativeTime = getThreadTime(thread);
                      return (
                        <div
                          key={thread.id}
                          className={`thread-row ${
                            entry.id === activeWorkspaceId &&
                            thread.id === activeThreadId
                              ? "active"
                              : ""
                          }`}
                          onClick={() => onSelectThread(entry.id, thread.id)}
                          onContextMenu={(event) =>
                            showThreadMenu(event, entry.id, thread.id)
                          }
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelectThread(entry.id, thread.id);
                            }
                          }}
                        >
                          <span
                            className={`thread-status ${
                              threadStatusById[thread.id]?.isReviewing
                                ? "reviewing"
                                : threadStatusById[thread.id]?.isProcessing
                                  ? "processing"
                                  : threadStatusById[thread.id]?.hasUnread
                                    ? "unread"
                                    : "ready"
                            }`}
                            aria-hidden
                          />
                          <span className="thread-name">{thread.name}</span>
                          <div className="thread-meta">
                            {relativeTime && (
                              <span className="thread-time">
                                {relativeTime}
                              </span>
                            )}
                            <div className="thread-menu">
                              <button
                                className="thread-menu-trigger"
                                aria-label="Thread menu"
                                onMouseDown={(event) =>
                                  event.stopPropagation()
                                }
                                onClick={(event) =>
                                  showThreadMenu(event, entry.id, thread.id)
                                }
                              >
                                ...
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {threads.length > 3 && (
                      <button
                        className="thread-more"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedWorkspaces((prev) => {
                            const next = new Set(prev);
                            if (next.has(entry.id)) {
                              next.delete(entry.id);
                            } else {
                              next.add(entry.id);
                            }
                            return next;
                          });
                        }}
                      >
                        {expandedWorkspaces.has(entry.id)
                          ? "Show less"
                          : "More..."}
                      </button>
                    )}
                    {expandedWorkspaces.has(entry.id) && nextCursor && (
                      <button
                        className="thread-more"
                        onClick={(event) => {
                          event.stopPropagation();
                          onLoadOlderThreads(entry.id);
                        }}
                        disabled={isPaging}
                      >
                        {isPaging ? "Loading..." : "Load older..."}
                      </button>
                    )}
                  </div>
                )}
                {showThreadLoader && (
                  <div className="thread-loading" aria-label="Loading agents">
                    <span className="thread-skeleton thread-skeleton-wide" />
                    <span className="thread-skeleton" />
                    <span className="thread-skeleton thread-skeleton-short" />
                  </div>
                )}
              </div>
            );
          })}
          {!rootWorkspaces.length && (
            <div className="empty">Add a workspace to start.</div>
          )}
        </div>
      </div>
      <div className="sidebar-footer">
        <div className="usage-bars">
          <div className="usage-block">
            <div className="usage-label">
              <span className="usage-title">
                <span>{sessionLabel}</span>
                {sessionResetLabel && (
                  <span className="usage-reset">· {sessionResetLabel}</span>
                )}
              </span>
              <span className="usage-value">
                {sessionPercent === null ? "--" : `${sessionPercent}%`}
              </span>
            </div>
            <div className="usage-bar">
              <span
                className="usage-bar-fill"
                style={{ width: `${sessionPercent ?? 0}%` }}
              />
            </div>
          </div>
          {accountRateLimits?.secondary && (
            <div className="usage-block">
              <div className="usage-label">
                <span className="usage-title">
                  <span>{weeklyLabel}</span>
                  {weeklyResetLabel && (
                    <span className="usage-reset">· {weeklyResetLabel}</span>
                  )}
                </span>
                <span className="usage-value">
                  {weeklyPercent === null ? "--" : `${weeklyPercent}%`}
                </span>
              </div>
              <div className="usage-bar">
                <span
                  className="usage-bar-fill"
                  style={{ width: `${weeklyPercent ?? 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
        {creditsLabel && <div className="usage-meta">{creditsLabel}</div>}
      </div>
      <div className="sidebar-corner-actions">
        <button
          className="ghost sidebar-corner-button"
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
        >
          <Settings size={14} aria-hidden />
        </button>
        {showDebugButton && (
          <button
            className="ghost sidebar-corner-button"
            type="button"
            onClick={onOpenDebug}
            aria-label="Open debug log"
            title="Debug log"
          >
            <ScrollText size={14} aria-hidden />
          </button>
        )}
      </div>
    </aside>
  );
}
