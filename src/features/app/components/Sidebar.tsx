import type { RateLimitSnapshot, ThreadSummary, WorkspaceInfo } from "../../../types";
import { FolderKanban, Layers, ScrollText, Settings } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { formatRelativeTime, formatRelativeTimeShort } from "../../../utils/time";

const COLLAPSED_GROUPS_STORAGE_KEY = "codexmonitor.collapsedGroups";

type WorkspaceGroupSection = {
  id: string | null;
  name: string;
  workspaces: WorkspaceInfo[];
};

type SidebarProps = {
  workspaces: WorkspaceInfo[];
  groupedWorkspaces: WorkspaceGroupSection[];
  hasWorkspaceGroups: boolean;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadParentById: Record<string, string>;
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
  groupedWorkspaces,
  hasWorkspaceGroups,
  threadsByWorkspace,
  threadParentById,
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (typeof window === "undefined") {
      return new Set();
    }
    const raw = window.localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((value) => typeof value === "string"));
      }
    } catch {
      // Ignore invalid stored data.
    }
    return new Set();
  });
  const [addMenuAnchor, setAddMenuAnchor] = useState<{
    workspaceId: string;
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const sidebarBodyRef = useRef<HTMLDivElement | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: false, bottom: false });

  const getThreadRows = useCallback(
    (threads: ThreadSummary[], isExpanded: boolean) => {
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
      const rows: Array<{ thread: ThreadSummary; depth: number }> = [];
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

  const persistCollapsedGroups = useCallback((next: Set<string>) => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      COLLAPSED_GROUPS_STORAGE_KEY,
      JSON.stringify(Array.from(next)),
    );
  }, []);

  const toggleGroupCollapse = useCallback(
    (groupId: string) => {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(groupId)) {
          next.delete(groupId);
        } else {
          next.add(groupId);
        }
        persistCollapsedGroups(next);
        return next;
      });
    },
    [persistCollapsedGroups],
  );

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
  }, [updateScrollFade, groupedWorkspaces, threadsByWorkspace, expandedWorkspaces]);

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
          {groupedWorkspaces.map((group) => {
            const groupId = group.id;
            const isGroupCollapsed = Boolean(
              groupId && collapsedGroups.has(groupId),
            );
            const showGroupHeader = Boolean(groupId) || hasWorkspaceGroups;

            return (
              <div
                key={group.id ?? "ungrouped"}
                className="workspace-group"
              >
                {showGroupHeader && (
                  <div className="workspace-group-header">
                    <div className="workspace-group-label">{group.name}</div>
                    {groupId && (
                      <button
                        className={`group-toggle ${
                          isGroupCollapsed ? "" : "expanded"
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleGroupCollapse(groupId);
                        }}
                        aria-label={
                          isGroupCollapsed ? "Expand group" : "Collapse group"
                        }
                        aria-expanded={!isGroupCollapsed}
                        type="button"
                      >
                        <span className="group-toggle-icon">›</span>
                      </button>
                    )}
                  </div>
                )}
                <div
                  className={`workspace-group-list ${
                    isGroupCollapsed ? "collapsed" : ""
                  }`}
                >
                  {group.workspaces.map((entry) => {
                  const threads = threadsByWorkspace[entry.id] ?? [];
                  const isCollapsed = entry.settings.sidebarCollapsed;
                  const isExpanded = expandedWorkspaces.has(entry.id);
                  const {
                    rows: threadRows,
                    totalRoots: totalThreadRoots,
                  } = getThreadRows(threads, isExpanded);
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
                                      {(() => {
                                        const isWorktreeExpanded =
                                          expandedWorkspaces.has(worktree.id);
                                        const {
                                          rows: worktreeThreadRows,
                                          totalRoots: totalWorktreeRoots,
                                        } = getThreadRows(
                                          worktreeThreads,
                                          isWorktreeExpanded,
                                        );
                                        return (
                                          <>
                                            {worktreeThreadRows.map(
                                              ({ thread, depth }) => {
                                                const relativeTime =
                                                  getThreadTime(thread);
                                                const indentStyle =
                                                  depth > 0
                                                    ? ({
                                                        "--thread-indent": `${depth * 14}px`,
                                                      } as CSSProperties)
                                                    : undefined;
                                                return (
                                                  <div
                                                    key={thread.id}
                                                    className={`thread-row ${
                                                      worktree.id ===
                                                        activeWorkspaceId &&
                                                      thread.id === activeThreadId
                                                        ? "active"
                                                        : ""
                                                    }`}
                                                    style={indentStyle}
                                                    onClick={() =>
                                                      onSelectThread(
                                                        worktree.id,
                                                        thread.id,
                                                      )
                                                    }
                                                    onContextMenu={(event) =>
                                                      showThreadMenu(
                                                        event,
                                                        worktree.id,
                                                        thread.id,
                                                      )
                                                    }
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={(event) => {
                                                      if (
                                                        event.key === "Enter" ||
                                                        event.key === " "
                                                      ) {
                                                        event.preventDefault();
                                                        onSelectThread(
                                                          worktree.id,
                                                          thread.id,
                                                        );
                                                      }
                                                    }}
                                                  >
                                                    <span
                                                      className={`thread-status ${
                                                        threadStatusById[thread.id]
                                                          ?.isReviewing
                                                          ? "reviewing"
                                                          : threadStatusById[
                                                                thread.id
                                                              ]?.isProcessing
                                                            ? "processing"
                                                            : threadStatusById[
                                                                  thread.id
                                                                ]?.hasUnread
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
                                                        <div
                                                          className="thread-menu-trigger"
                                                          aria-hidden="true"
                                                        />
                                                      </div>
                                                    </div>
                                                  </div>
                                                );
                                              },
                                            )}
                                            {totalWorktreeRoots > 3 && (
                                              <button
                                                className="thread-more"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  setExpandedWorkspaces(
                                                    (prev) => {
                                                      const next = new Set(prev);
                                                      if (next.has(worktree.id)) {
                                                        next.delete(worktree.id);
                                                      } else {
                                                        next.add(worktree.id);
                                                      }
                                                      return next;
                                                    },
                                                  );
                                                }}
                                              >
                                                {isWorktreeExpanded
                                                  ? "Show less"
                                                  : "More..."}
                                              </button>
                                            )}
                                            {isWorktreeExpanded &&
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
                                          </>
                                        );
                                      })()}
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
                          {threadRows.map(({ thread, depth }) => {
                            const relativeTime = getThreadTime(thread);
                            const indentStyle =
                              depth > 0
                                ? ({
                                    "--thread-indent": `${depth * 14}px`,
                                  } as CSSProperties)
                                : undefined;
                            return (
                              <div
                                key={thread.id}
                                className={`thread-row ${
                                  entry.id === activeWorkspaceId &&
                                  thread.id === activeThreadId
                                    ? "active"
                                    : ""
                                  }`}
                                style={indentStyle}
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
                                    <div
                                      className="thread-menu-trigger"
                                      aria-hidden="true"
                                    />
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
                              {isExpanded
                                ? "Show less"
                                : "More..."}
                            </button>
                          )}
                          {isExpanded && nextCursor && (
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
                </div>
              </div>
            );
          })}
          {!groupedWorkspaces.length && (
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
