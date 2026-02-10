import PanelLeftClose from "lucide-react/dist/esm/icons/panel-left-close";
import PanelLeftOpen from "lucide-react/dist/esm/icons/panel-left-open";
import PanelRightClose from "lucide-react/dist/esm/icons/panel-right-close";
import PanelRightOpen from "lucide-react/dist/esm/icons/panel-right-open";

export type SidebarToggleProps = {
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
}: SidebarToggleProps) {
  if (isCompact || sidebarCollapsed) {
    return null;
  }
  return (
    <button
      type="button"
      className="ghost main-header-action"
      onClick={onCollapseSidebar}
      data-tauri-drag-region="false"
      aria-label="隐藏对话侧栏"
      title="隐藏对话侧栏"
    >
      <PanelLeftClose size={14} aria-hidden />
    </button>
  );
}

export function RightPanelCollapseButton({
  isCompact,
  rightPanelCollapsed,
  onCollapseRightPanel,
}: SidebarToggleProps) {
  if (isCompact || rightPanelCollapsed) {
    return null;
  }
  return (
    <button
      type="button"
      className="ghost main-header-action"
      onClick={onCollapseRightPanel}
      data-tauri-drag-region="false"
      aria-label="隐藏 Git 侧栏"
      title="隐藏 Git 侧栏"
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
}: SidebarToggleProps) {
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
            aria-label="显示对话侧栏"
            title="显示对话侧栏"
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
            aria-label="显示 Git 侧栏"
            title="显示 Git 侧栏"
          >
            <PanelRightOpen size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
