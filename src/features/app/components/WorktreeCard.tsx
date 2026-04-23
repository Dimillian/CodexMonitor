import type { MouseEvent } from "react";
import { useI18n } from "@/i18n";

import type { WorkspaceInfo } from "../../../types";

type WorktreeCardProps = {
  worktree: WorkspaceInfo;
  isActive: boolean;
  isDeleting?: boolean;
  onSelectWorkspace: (id: string) => void;
  onShowWorktreeMenu: (event: MouseEvent, worktree: WorkspaceInfo) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  children?: React.ReactNode;
};

export function WorktreeCard({
  worktree,
  isActive,
  isDeleting = false,
  onSelectWorkspace,
  onShowWorktreeMenu,
  onToggleWorkspaceCollapse,
  onConnectWorkspace,
  children,
}: WorktreeCardProps) {
  const { tx } = useI18n();
  const worktreeCollapsed = worktree.settings.sidebarCollapsed;
  const worktreeBranch = worktree.worktree?.branch ?? "";
  const worktreeLabel = worktree.name?.trim() || worktreeBranch;
  const worktreeMeta =
    worktreeBranch && worktreeBranch !== worktreeLabel ? worktreeBranch : null;
  const contentCollapsedClass = worktreeCollapsed ? " collapsed" : "";

  return (
    <div className={`worktree-card${isDeleting ? " deleting" : ""}`}>
      <div
        className={`worktree-row ${isActive ? "active" : ""}${isDeleting ? " deleting" : ""}`}
        role="button"
        tabIndex={isDeleting ? -1 : 0}
        aria-disabled={isDeleting}
        onClick={() => {
          if (!isDeleting) {
            onSelectWorkspace(worktree.id);
          }
        }}
        onContextMenu={(event) => {
          if (!isDeleting) {
            onShowWorktreeMenu(event, worktree);
          }
        }}
        onKeyDown={(event) => {
          if (isDeleting) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectWorkspace(worktree.id);
          }
        }}
      >
        <div className="worktree-copy">
          <div className="worktree-label">{worktreeLabel}</div>
          {worktreeMeta && <div className="worktree-meta">{worktreeMeta}</div>}
        </div>
        <div className="worktree-actions">
          {isDeleting ? (
            <div className="worktree-deleting" role="status" aria-live="polite">
              <span className="worktree-deleting-spinner" aria-hidden />
              <span className="worktree-deleting-label">{tx("Deleting")}</span>
            </div>
          ) : (
            <>
              <button
                className={`worktree-toggle ${worktreeCollapsed ? "" : "expanded"}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleWorkspaceCollapse(worktree.id, !worktreeCollapsed);
                }}
                data-tauri-drag-region="false"
                aria-label={worktreeCollapsed ? tx("Show agents") : tx("Hide agents")}
                aria-expanded={!worktreeCollapsed}
              >
                <span className="worktree-toggle-icon">›</span>
              </button>
              {!worktree.connected && (
                <span
                  className="connect"
                  title={tx("Connect workspace context to the shared Codex server")}
                  onClick={(event) => {
                    event.stopPropagation();
                    onConnectWorkspace(worktree);
                  }}
                >
                  {tx("connect")}
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <div
        className={`worktree-card-content${contentCollapsedClass}`}
        aria-hidden={worktreeCollapsed}
        inert={worktreeCollapsed ? true : undefined}
      >
        <div className="worktree-card-content-inner">{children}</div>
      </div>
    </div>
  );
}
