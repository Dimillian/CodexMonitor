import { memo } from "react";
import AlignLeft from "lucide-react/dist/esm/icons/align-left";
import Columns2 from "lucide-react/dist/esm/icons/columns-2";
import type { SidebarToggleProps } from "../../layout/components/SidebarToggleControls";
import { RightPanelCollapseButton } from "../../layout/components/SidebarToggleControls";

type MainHeaderActionsProps = {
  centerMode: "chat" | "diff";
  gitDiffViewStyle: "split" | "unified";
  onSelectDiffViewStyle: (style: "split" | "unified") => void;
  isCompact: boolean;
  rightPanelCollapsed: boolean;
  sidebarToggleProps: SidebarToggleProps;
};

export const MainHeaderActions = memo(function MainHeaderActions({
  centerMode,
  gitDiffViewStyle,
  onSelectDiffViewStyle,
  isCompact,
  rightPanelCollapsed,
  sidebarToggleProps,
}: MainHeaderActionsProps) {
  return (
    <>
      {centerMode === "diff" && (
        <div className="diff-view-toggle" role="group" aria-label="Diff view">
          <button
            type="button"
            className={`diff-view-toggle-button${
              gitDiffViewStyle === "split" ? " is-active" : ""
            }`}
            onClick={() => onSelectDiffViewStyle("split")}
            aria-pressed={gitDiffViewStyle === "split"}
            title="Dual-panel diff"
            data-tauri-drag-region="false"
          >
            <Columns2 size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={`diff-view-toggle-button${
              gitDiffViewStyle === "unified" ? " is-active" : ""
            }`}
            onClick={() => onSelectDiffViewStyle("unified")}
            aria-pressed={gitDiffViewStyle === "unified"}
            title="Single-column diff"
            data-tauri-drag-region="false"
          >
            <AlignLeft size={14} aria-hidden />
          </button>
        </div>
      )}
      {!isCompact && !rightPanelCollapsed ? (
        <RightPanelCollapseButton {...sidebarToggleProps} />
      ) : null}
    </>
  );
});
