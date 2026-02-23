import ArrowDownUp from "lucide-react/dist/esm/icons/arrow-down-up";
import BetweenHorizontalStart from "lucide-react/dist/esm/icons/between-horizontal-start";
import Calendar from "lucide-react/dist/esm/icons/calendar";
import FolderPlus from "lucide-react/dist/esm/icons/folder-plus";
import FolderTree from "lucide-react/dist/esm/icons/folder-tree";
import ListFilter from "lucide-react/dist/esm/icons/list-filter";
import ListTree from "lucide-react/dist/esm/icons/list-tree";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Search from "lucide-react/dist/esm/icons/search";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadListOrganizeMode, ThreadListSortKey } from "../../../types";
import {
  MenuTrigger,
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "../hooks/useMenuController";

type SidebarHeaderProps = {
  onSelectHome: () => void;
  onAddWorkspace: () => void;
  onToggleSearch: () => void;
  isSearchOpen: boolean;
  threadListSortKey: ThreadListSortKey;
  onSetThreadListSortKey: (sortKey: ThreadListSortKey) => void;
  threadListOrganizeMode: ThreadListOrganizeMode;
  onSetThreadListOrganizeMode: (organizeMode: ThreadListOrganizeMode) => void;
  onRefreshAllThreads: () => void;
  refreshDisabled?: boolean;
  refreshInProgress?: boolean;
};

export function SidebarHeader({
  onSelectHome,
  onAddWorkspace,
  onToggleSearch,
  isSearchOpen,
  threadListSortKey,
  onSetThreadListSortKey,
  threadListOrganizeMode,
  onSetThreadListOrganizeMode,
  onRefreshAllThreads,
  refreshDisabled = false,
  refreshInProgress = false,
}: SidebarHeaderProps) {
  const sortMenu = useMenuController();
  const { isOpen: sortMenuOpen, containerRef: sortMenuRef } = sortMenu;
  const sortMenuPopoverRef = useRef<HTMLDivElement | null>(null);
  const [sortMenuShift, setSortMenuShift] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const recalculateSortMenuPosition = useCallback(() => {
    const popover = sortMenuPopoverRef.current;
    if (!popover || typeof window === "undefined") {
      return;
    }
    const popoverRect = popover.getBoundingClientRect();
    const sidebarRect = sortMenuRef.current
      ?.closest(".sidebar")
      ?.getBoundingClientRect();
    const minLeft = sidebarRect ? sidebarRect.left + 8 : 8;
    const maxRight = sidebarRect
      ? Math.min(window.innerWidth - 8, sidebarRect.right - 8)
      : window.innerWidth - 8;
    const minTop = 8;
    const maxBottom = window.innerHeight - 8;

    let shiftX = 0;
    if (popoverRect.left < minLeft) {
      shiftX += minLeft - popoverRect.left;
    }
    if (popoverRect.right + shiftX > maxRight) {
      shiftX -= popoverRect.right + shiftX - maxRight;
    }

    let shiftY = 0;
    if (popoverRect.bottom > maxBottom) {
      shiftY -= popoverRect.bottom - maxBottom;
    }
    if (popoverRect.top + shiftY < minTop) {
      shiftY += minTop - (popoverRect.top + shiftY);
    }

    setSortMenuShift((current) =>
      current.x === shiftX && current.y === shiftY
        ? current
        : { x: shiftX, y: shiftY },
    );
  }, [sortMenuRef]);

  useEffect(() => {
    if (!sortMenuOpen) {
      setSortMenuShift({ x: 0, y: 0 });
      return;
    }
    recalculateSortMenuPosition();
    const onWindowChange = () => recalculateSortMenuPosition();
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);
    return () => {
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
    };
  }, [recalculateSortMenuPosition, sortMenuOpen]);

  const handleSelectSort = (sortKey: ThreadListSortKey) => {
    sortMenu.close();
    if (sortKey === threadListSortKey) {
      return;
    }
    onSetThreadListSortKey(sortKey);
  };

  const handleSelectOrganize = (organizeMode: ThreadListOrganizeMode) => {
    sortMenu.close();
    if (organizeMode === threadListOrganizeMode) {
      return;
    }
    onSetThreadListOrganizeMode(organizeMode);
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
        <div className="sidebar-sort-menu" ref={sortMenuRef}>
          <MenuTrigger
            isOpen={sortMenuOpen}
            activeClassName="is-active"
            className="ghost sidebar-sort-toggle"
            onClick={sortMenu.toggle}
            data-tauri-drag-region="false"
            aria-label="Organize and sort threads"
            title="Organize and sort threads"
          >
            <ListFilter aria-hidden />
          </MenuTrigger>
          {sortMenuOpen && (
            <PopoverSurface
              className="sidebar-sort-dropdown"
              role="menu"
              ref={sortMenuPopoverRef}
              style={
                sortMenuShift.x !== 0 || sortMenuShift.y !== 0
                  ? { transform: `translate(${sortMenuShift.x}px, ${sortMenuShift.y}px)` }
                  : undefined
              }
            >
              <div className="sidebar-sort-section-label">Organize</div>
              <PopoverMenuItem
                className="sidebar-sort-option"
                role="menuitemradio"
                aria-checked={threadListOrganizeMode === "by_project"}
                onClick={() => handleSelectOrganize("by_project")}
                data-tauri-drag-region="false"
                icon={<FolderTree aria-hidden />}
                active={threadListOrganizeMode === "by_project"}
              >
                By project
              </PopoverMenuItem>
              <PopoverMenuItem
                className="sidebar-sort-option"
                role="menuitemradio"
                aria-checked={threadListOrganizeMode === "by_project_activity"}
                onClick={() => handleSelectOrganize("by_project_activity")}
                data-tauri-drag-region="false"
                icon={<BetweenHorizontalStart aria-hidden />}
                active={threadListOrganizeMode === "by_project_activity"}
              >
                By project activity
              </PopoverMenuItem>
              <PopoverMenuItem
                className="sidebar-sort-option"
                role="menuitemradio"
                aria-checked={threadListOrganizeMode === "threads_only"}
                onClick={() => handleSelectOrganize("threads_only")}
                data-tauri-drag-region="false"
                icon={<ListTree aria-hidden />}
                active={threadListOrganizeMode === "threads_only"}
              >
                Thread list
              </PopoverMenuItem>
              <div className="sidebar-sort-divider" aria-hidden />
              <div className="sidebar-sort-section-label">Sort by</div>
              <PopoverMenuItem
                className="sidebar-sort-option"
                role="menuitemradio"
                aria-checked={threadListSortKey === "updated_at"}
                onClick={() => handleSelectSort("updated_at")}
                data-tauri-drag-region="false"
                icon={<ArrowDownUp aria-hidden />}
                active={threadListSortKey === "updated_at"}
              >
                Updated
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
                Created
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
