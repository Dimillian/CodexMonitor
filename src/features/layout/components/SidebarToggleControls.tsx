import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

type SidebarToggleControlsProps = {
  isCompact: boolean;
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  onCollapseSidebar: () => void;
  onExpandSidebar: () => void;
  onCollapseRightPanel: () => void;
  onExpandRightPanel: () => void;
};

export function SidebarCollapseButton({
  isCompact,
  sidebarCollapsed,
  onCollapseSidebar,
}: SidebarToggleControlsProps) {
  if (isCompact || sidebarCollapsed) {
    return null;
  }
  return (
    <button
      type="button"
      className="ghost main-header-action"
      onClick={onCollapseSidebar}
      data-tauri-drag-region="false"
      aria-label="Hide threads sidebar"
      title="Hide threads sidebar"
    >
      <PanelLeftClose size={14} aria-hidden />
    </button>
  );
}

export function RightPanelCollapseButton({
  isCompact,
  rightPanelCollapsed,
  onCollapseRightPanel,
}: SidebarToggleControlsProps) {
  if (isCompact || rightPanelCollapsed) {
    return null;
  }
  return (
    <button
      type="button"
      className="ghost main-header-action"
      onClick={onCollapseRightPanel}
      data-tauri-drag-region="false"
      aria-label="Hide git sidebar"
      title="Hide git sidebar"
    >
      <PanelRightClose size={14} aria-hidden />
    </button>
  );
}

export function TitlebarExpandControls({
  isCompact,
  sidebarCollapsed,
  rightPanelCollapsed,
  onExpandSidebar,
  onExpandRightPanel,
}: SidebarToggleControlsProps) {
  if (isCompact || (!sidebarCollapsed && !rightPanelCollapsed)) {
    return null;
  }
  return (
    <div className="titlebar-controls">
      {sidebarCollapsed && (
        <div className="titlebar-toggle titlebar-toggle-left">
          <button
            type="button"
            className="ghost main-header-action"
            onClick={onExpandSidebar}
            data-tauri-drag-region="false"
            aria-label="Show threads sidebar"
            title="Show threads sidebar"
          >
            <PanelLeftOpen size={14} aria-hidden />
          </button>
        </div>
      )}
      {rightPanelCollapsed && (
        <div className="titlebar-toggle titlebar-toggle-right">
          <button
            type="button"
            className="ghost main-header-action"
            onClick={onExpandRightPanel}
            data-tauri-drag-region="false"
            aria-label="Show git sidebar"
            title="Show git sidebar"
          >
            <PanelRightOpen size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
