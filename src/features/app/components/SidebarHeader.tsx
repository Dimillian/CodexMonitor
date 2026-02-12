import Calendar from "lucide-react/dist/esm/icons/calendar";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import FolderPlus from "lucide-react/dist/esm/icons/folder-plus";
import ListFilter from "lucide-react/dist/esm/icons/list-filter";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Search from "lucide-react/dist/esm/icons/search";
import { useRef, useState } from "react";
import type { ThreadListSortKey } from "../../../types";
import {
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useDismissibleMenu } from "../hooks/useDismissibleMenu";

type SidebarHeaderProps = {
  onSelectHome: () => void;
  onAddWorkspace: () => void;
  onToggleForge: () => void;
  isForgeOpen: boolean;
  onToggleSearch: () => void;
  isSearchOpen: boolean;
  threadListSortKey: ThreadListSortKey;
  onSetThreadListSortKey: (sortKey: ThreadListSortKey) => void;
  onRefreshAllThreads: () => void;
  refreshDisabled?: boolean;
  refreshInProgress?: boolean;
};

export function SidebarHeader({
  onSelectHome,
  onAddWorkspace,
  onToggleForge,
  isForgeOpen,
  onToggleSearch,
  isSearchOpen,
  threadListSortKey,
  onSetThreadListSortKey,
  onRefreshAllThreads,
  refreshDisabled = false,
  refreshInProgress = false,
}: SidebarHeaderProps) {
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  useDismissibleMenu({
    isOpen: sortMenuOpen,
    containerRef: sortMenuRef,
    onClose: () => setSortMenuOpen(false),
  });

  const handleSelectSort = (sortKey: ThreadListSortKey) => {
    setSortMenuOpen(false);
    if (sortKey === threadListSortKey) {
      return;
    }
    onSetThreadListSortKey(sortKey);
  };

  return (
    <div className="sidebar-header">
      <div className="sidebar-header-title">
        <div className="sidebar-title-group">
          <button
            className="sidebar-title-add"
            onClick={onAddWorkspace}
            data-tauri-drag-region="false"
            aria-label="Add workspaces"
            type="button"
          >
            <FolderPlus aria-hidden />
          </button>
          <button
            className="subtitle subtitle-button sidebar-title-button"
            onClick={onSelectHome}
            data-tauri-drag-region="false"
            aria-label="Open home"
          >
            Projects
          </button>
        </div>
      </div>
      <div className="sidebar-header-actions">
        <button
          className={`ghost sidebar-forge-toggle${isForgeOpen ? " is-active" : ""}`}
          onClick={onToggleForge}
          data-tauri-drag-region="false"
          aria-label="Toggle Forge"
          aria-pressed={isForgeOpen}
          type="button"
          title="Toggle Forge"
        >
          {/* Icon from public/anvil.svg */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 10l2-1h16l2 1-2 1H4l-2-1z" />
            <path d="M7 11v4l-1.5 4h11L15 15v-4" />
            <path d="M4.5 19h15" />
          </svg>
        </button>
        <div className="sidebar-sort-menu" ref={sortMenuRef}>
          <button
            className={`ghost sidebar-sort-toggle${sortMenuOpen ? " is-active" : ""}`}
            onClick={() => setSortMenuOpen((open) => !open)}
            data-tauri-drag-region="false"
            aria-label="Sort threads"
            aria-haspopup="menu"
            aria-expanded={sortMenuOpen}
            type="button"
            title="Sort threads"
          >
            <ListFilter aria-hidden />
          </button>
          {sortMenuOpen && (
            <PopoverSurface className="sidebar-sort-dropdown" role="menu">
              <PopoverMenuItem
                className="sidebar-sort-option"
                role="menuitemradio"
                aria-checked={threadListSortKey === "updated_at"}
                onClick={() => handleSelectSort("updated_at")}
                data-tauri-drag-region="false"
                icon={<Clock3 aria-hidden />}
                active={threadListSortKey === "updated_at"}
              >
                Last updated
              </PopoverMenuItem>
              <PopoverMenuItem
                className="sidebar-sort-option"
                role="menuitemradio"
                aria-checked={threadListSortKey === "created_at"}
                onClick={() => handleSelectSort("created_at")}
                data-tauri-drag-region="false"
                icon={<Calendar aria-hidden />}
                active={threadListSortKey === "created_at"}
              >
                Most recent
              </PopoverMenuItem>
            </PopoverSurface>
          )}
        </div>
        <button
          className="ghost sidebar-refresh-toggle"
          onClick={onRefreshAllThreads}
          data-tauri-drag-region="false"
          aria-label="Refresh all workspace threads"
          type="button"
          title="Refresh all workspace threads"
          disabled={refreshDisabled}
          aria-busy={refreshInProgress}
        >
          <RefreshCw
            className={refreshInProgress ? "sidebar-refresh-icon spinning" : "sidebar-refresh-icon"}
            aria-hidden
          />
        </button>
        <button
          className={`ghost sidebar-search-toggle${isSearchOpen ? " is-active" : ""}`}
          onClick={onToggleSearch}
          data-tauri-drag-region="false"
          aria-label="Toggle search"
          aria-pressed={isSearchOpen}
          type="button"
        >
          <Search aria-hidden />
        </button>
      </div>
    </div>
  );
}
