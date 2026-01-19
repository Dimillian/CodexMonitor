import type { MouseEvent } from "react";

import type { WorkspaceInfo } from "../../../types";

type WorktreeCardProps = {
  worktree: WorkspaceInfo;
  isActive: boolean;
  onSelectWorkspace: (id: string) => void;
  onShowWorktreeMenu: (event: MouseEvent, workspaceId: string) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  children?: React.ReactNode;
};

export function WorktreeCard({
  worktree,
  isActive,
  onSelectWorkspace,
  onShowWorktreeMenu,
  onToggleWorkspaceCollapse,
  onConnectWorkspace,
  children,
}: WorktreeCardProps) {
  const worktreeCollapsed = worktree.settings.sidebarCollapsed;
  const worktreeBranch = worktree.worktree?.branch ?? "";

  return (
    <div className="worktree-card">
      <div
        className={`worktree-row ${isActive ? "active" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => onSelectWorkspace(worktree.id)}
        onContextMenu={(event) => onShowWorktreeMenu(event, worktree.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectWorkspace(worktree.id);
          }
        }}
      >
        <div className="worktree-label">{worktreeBranch || worktree.name}</div>
        <div className="worktree-actions">
          <button
            className={`worktree-toggle ${worktreeCollapsed ? "" : "expanded"}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleWorkspaceCollapse(worktree.id, !worktreeCollapsed);
            }}
            data-tauri-drag-region="false"
            aria-label={worktreeCollapsed ? "Show agents" : "Hide agents"}
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
      {children}
    </div>
  );
}
