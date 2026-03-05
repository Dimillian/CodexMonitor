import { memo } from "react";
import { AlignLeft, Columns2 } from "lucide-react";
import type { SidebarToggleProps } from "../../layout/components/SidebarToggleControls";
import {
  RightPanelCollapseButton,
  RightPanelExpandButton,
} from "../../layout/components/SidebarToggleControls";

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
            } ds-tooltip-trigger`}
            onClick={() => onSelectDiffViewStyle("split")}
            aria-pressed={gitDiffViewStyle === "split"}
            title="Dual-panel diff"
            data-tooltip="Dual-panel diff"
            data-tooltip-placement="bottom"
            data-tauri-drag-region="false"
          >
            <Columns2 size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={`diff-view-toggle-button${
              gitDiffViewStyle === "unified" ? " is-active" : ""
            } ds-tooltip-trigger`}
            onClick={() => onSelectDiffViewStyle("unified")}
            aria-pressed={gitDiffViewStyle === "unified"}
            title="Single-column diff"
            data-tooltip="Single-column diff"
            data-tooltip-placement="bottom"
            data-tauri-drag-region="false"
          >
            <AlignLeft size={14} aria-hidden />
          </button>
        </div>
      )}
      {!isCompact ? (
        rightPanelCollapsed ? (
          <RightPanelExpandButton {...sidebarToggleProps} />
        ) : (
          <RightPanelCollapseButton {...sidebarToggleProps} />
        )
      ) : null}
    </>
  );
});
