import type { RateLimitSnapshot, ThreadSummary, WorkspaceInfo } from "../types";
import { useState } from "react";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

type SidebarProps = {
  workspaces: WorkspaceInfo[];
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadStatusById: Record<
    string,
    { isProcessing: boolean; hasUnread: boolean; isReviewing: boolean }
  >;
  threadListLoadingByWorkspace: Record<string, boolean>;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  accountRateLimits: RateLimitSnapshot | null;
  onAddWorkspace: () => void;
  onSelectHome: () => void;
  onSelectWorkspace: (id: string) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onAddAgent: (workspace: WorkspaceInfo) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onDeleteThread: (workspaceId: string, threadId: string) => void;
};

export function Sidebar({
  workspaces,
  threadsByWorkspace,
  threadStatusById,
  threadListLoadingByWorkspace,
  activeWorkspaceId,
  activeThreadId,
  accountRateLimits,
  onAddWorkspace,
  onSelectHome,
  onSelectWorkspace,
  onConnectWorkspace,
  onAddAgent,
  onToggleWorkspaceCollapse,
  onSelectThread,
  onDeleteThread,
}: SidebarProps) {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState(
    new Set<string>(),
  );

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

  const usagePercent = accountRateLimits?.primary?.usedPercent;
  const globalUsagePercent = accountRateLimits?.secondary?.usedPercent;
  const credits = accountRateLimits?.credits ?? null;
  const creditsLabel = credits?.hasCredits
    ? credits.unlimited
      ? "Credits: unlimited"
      : credits.balance
        ? `Credits: ${credits.balance}`
        : "Credits"
    : null;

  const primaryWindowLabel = (() => {
    const minutes = accountRateLimits?.primary?.windowDurationMins ?? null;
    if (!minutes || minutes <= 0) {
      return "Session";
    }
    if (minutes % 60 === 0) {
      return `${minutes / 60}H session`;
    }
    return `${minutes}m session`;
  })();

  const secondaryWindowLabel = (() => {
    const minutes = accountRateLimits?.secondary?.windowDurationMins ?? null;
    if (!minutes || minutes <= 0) {
      return "Global session";
    }
    return "Global session";
  })();

  const primaryUsageLabel =
    typeof usagePercent === "number"
      ? `${primaryWindowLabel}: ${Math.min(Math.max(Math.round(usagePercent), 0), 100)}%`
      : `${primaryWindowLabel}: --`;
  const secondaryUsageLabel =
    typeof globalUsagePercent === "number"
      ? `${secondaryWindowLabel}: ${Math.min(Math.max(Math.round(globalUsagePercent), 0), 100)}%`
      : `${secondaryWindowLabel}: --`;

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
      <div className="sidebar-body">
        <div className="workspace-list">
          {workspaces.map((entry) => {
            const threads = threadsByWorkspace[entry.id] ?? [];
            const isCollapsed = entry.settings.sidebarCollapsed;
            const showThreads = !isCollapsed && threads.length > 0;
            const isLoadingThreads =
              threadListLoadingByWorkspace[entry.id] ?? false;
            const showThreadLoader =
              !isCollapsed && isLoadingThreads && threads.length === 0;

            return (
              <div key={entry.id} className="workspace-card">
                <div
                  className={`workspace-row ${
                    entry.id === activeWorkspaceId ? "active" : ""
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectWorkspace(entry.id)}
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
                          onAddAgent(entry);
                        }}
                        data-tauri-drag-region="false"
                        aria-label="Add agent"
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
                {showThreads && (
                  <div className="thread-list">
                    {(expandedWorkspaces.has(entry.id)
                      ? threads
                      : threads.slice(0, 3)
                    ).map((thread) => (
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
                        <div className="thread-menu">
                          <button
                            className="thread-menu-trigger"
                            aria-label="Thread menu"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) =>
                              showThreadMenu(event, entry.id, thread.id)
                            }
                          >
                            ...
                          </button>
                        </div>
                      </div>
                    ))}
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
                          : `${threads.length - 3} more...`}
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
          {!workspaces.length && (
            <div className="empty">Add a workspace to start.</div>
          )}
        </div>
      </div>
      <div className="sidebar-footer">
        <div className="usage-stack">
          <span className="usage-row">{primaryUsageLabel}</span>
          {accountRateLimits?.secondary && (
            <span className="usage-row">{secondaryUsageLabel}</span>
          )}
        </div>
        {creditsLabel && <div className="usage-meta">{creditsLabel}</div>}
      </div>
    </aside>
  );
}
