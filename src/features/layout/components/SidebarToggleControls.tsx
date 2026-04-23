import PanelLeftClose from "lucide-react/dist/esm/icons/panel-left-close";
import PanelLeftOpen from "lucide-react/dist/esm/icons/panel-left-open";
import PanelRightClose from "lucide-react/dist/esm/icons/panel-right-close";
import PanelRightOpen from "lucide-react/dist/esm/icons/panel-right-open";
import { useI18n } from "@/i18n";

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
  const { tx } = useI18n();
  if (isCompact || sidebarCollapsed) {
    return null;
  }
  return (
    <button
      type="button"
      className="ghost main-header-action ds-tooltip-trigger"
      onClick={onCollapseSidebar}
      data-tauri-drag-region="false"
      aria-label={tx("Hide threads sidebar")}
      title={tx("Hide threads sidebar")}
      data-tooltip={tx("Hide threads sidebar")}
      data-tooltip-placement="bottom"
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
  const { tx } = useI18n();
  if (isCompact || rightPanelCollapsed) {
    return null;
  }
  return (
    <button
      type="button"
      className="ghost main-header-action ds-tooltip-trigger"
      onClick={onCollapseRightPanel}
      data-tauri-drag-region="false"
      aria-label={tx("Hide git sidebar")}
      title={tx("Hide git sidebar")}
      data-tooltip={tx("Hide git sidebar")}
      data-tooltip-placement="bottom"
    >
      <PanelRightClose size={14} aria-hidden />
    </button>
  );
}

export function RightPanelExpandButton({
  isCompact,
  rightPanelCollapsed,
  onExpandRightPanel,
}: SidebarToggleProps) {
  const { tx } = useI18n();
  if (isCompact || !rightPanelCollapsed) {
    return null;
  }
  return (
    <button
      type="button"
      className="ghost main-header-action ds-tooltip-trigger"
      onClick={onExpandRightPanel}
      data-tauri-drag-region="false"
      aria-label={tx("Show git sidebar")}
      title={tx("Show git sidebar")}
      data-tooltip={tx("Show git sidebar")}
      data-tooltip-placement="bottom"
    >
      <PanelRightOpen size={14} aria-hidden />
    </button>
  );
}

export function TitlebarExpandControls({
  isCompact,
  sidebarCollapsed,
  onExpandSidebar,
}: SidebarToggleProps) {
  const { tx } = useI18n();
  if (isCompact || !sidebarCollapsed) {
    return null;
  }
  return (
    <div className="titlebar-controls">
      {sidebarCollapsed && (
        <div className="titlebar-toggle titlebar-toggle-left">
          <button
            type="button"
            className="ghost main-header-action ds-tooltip-trigger"
            onClick={onExpandSidebar}
            data-tauri-drag-region="false"
            aria-label={tx("Show threads sidebar")}
            title={tx("Show threads sidebar")}
            data-tooltip={tx("Show threads sidebar")}
            data-tooltip-placement="bottom"
          >
            <PanelLeftOpen size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
