import { createPortal } from "react-dom";
import type { MouseEvent, MutableRefObject } from "react";
import { useI18n } from "@/i18n";
import Plus from "lucide-react/dist/esm/icons/plus";

import type { ThreadSummary, WorkspaceInfo } from "../../../types";
import type { ThreadStatusById } from "../../../utils/threadStatus";
import {
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { PinnedThreadList } from "./PinnedThreadList";
import type { SidebarOverlayMenuAnchor, ThreadBucket } from "./sidebarTypes";

type SidebarThreadsOnlySectionProps = {
  threadBuckets: ThreadBucket[];
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusById;
  pendingUserInputKeys?: Set<string>;
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
  getWorkspaceLabel: (workspaceId: string) => string | null;
  addMenuOpen: boolean;
  addMenuAnchor: SidebarOverlayMenuAnchor | null;
  addMenuRef: MutableRefObject<HTMLDivElement | null>;
  projectOptionsForNewThread: WorkspaceInfo[];
  onToggleAddMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  onCreateThreadInProject: (workspace: WorkspaceInfo) => void;
};

export function SidebarThreadsOnlySection({
  threadBuckets,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  pendingUserInputKeys,
  getThreadTime,
  getThreadArgsBadge,
  isThreadPinned,
  onSelectThread,
  onShowThreadMenu,
  getWorkspaceLabel,
  addMenuOpen,
  addMenuAnchor,
  addMenuRef,
  projectOptionsForNewThread,
  onToggleAddMenu,
  onCreateThreadInProject,
}: SidebarThreadsOnlySectionProps) {
  const { tx } = useI18n();

  return (
    <div className="workspace-group">
      <div className="sidebar-section-header workspace-group-header-all-threads">
        <div className="sidebar-section-title">{tx("Recent conversations")}</div>
        <button
          className="ghost all-threads-add"
          onClick={onToggleAddMenu}
          data-tauri-drag-region="false"
          aria-label={tx("New thread in project")}
          title={tx("New thread in project")}
          aria-expanded={addMenuOpen}
          disabled={projectOptionsForNewThread.length === 0}
        >
          <Plus aria-hidden />
        </button>
      </div>
      {threadBuckets.map((bucket) => (
        <div key={bucket.id} className="thread-bucket">
          <div className="thread-bucket-header">
            <div className="thread-bucket-label">{tx(bucket.label)}</div>
          </div>
          <PinnedThreadList
            rows={bucket.rows}
            activeWorkspaceId={activeWorkspaceId}
            activeThreadId={activeThreadId}
            threadStatusById={threadStatusById}
            pendingUserInputKeys={pendingUserInputKeys}
            getThreadTime={getThreadTime}
            getThreadArgsBadge={getThreadArgsBadge}
            isThreadPinned={isThreadPinned}
            onSelectThread={onSelectThread}
            onShowThreadMenu={onShowThreadMenu}
            getWorkspaceLabel={getWorkspaceLabel}
          />
        </div>
      ))}
      {addMenuAnchor &&
        createPortal(
          <PopoverSurface
            className="workspace-add-menu all-threads-add-menu"
            ref={addMenuRef}
            style={{
              top: addMenuAnchor.top,
              left: addMenuAnchor.left,
              width: addMenuAnchor.width,
            }}
          >
            {projectOptionsForNewThread.map((workspace) => (
              <PopoverMenuItem
                key={workspace.id}
                className="workspace-add-option"
                onClick={(event) => {
                  event.stopPropagation();
                  onCreateThreadInProject(workspace);
                }}
                icon={<Plus aria-hidden />}
              >
                {workspace.name}
              </PopoverMenuItem>
            ))}
          </PopoverSurface>,
          document.body,
        )}
    </div>
  );
}
