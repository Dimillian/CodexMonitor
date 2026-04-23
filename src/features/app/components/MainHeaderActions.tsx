import { memo } from "react";
import AlignLeft from "lucide-react/dist/esm/icons/align-left";
import Columns2 from "lucide-react/dist/esm/icons/columns-2";
import { useI18n } from "@/i18n";
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
  const { tx } = useI18n();
  const splitLabel = tx("Dual-panel diff");
  const unifiedLabel = tx("Single-column diff");

  return (
    <>
      {centerMode === "diff" && (
        <div className="diff-view-toggle" role="group" aria-label={tx("Diff view")}>
          <button
            type="button"
            className={`diff-view-toggle-button${
              gitDiffViewStyle === "split" ? " is-active" : ""
            } ds-tooltip-trigger`}
            onClick={() => onSelectDiffViewStyle("split")}
            aria-pressed={gitDiffViewStyle === "split"}
            title={splitLabel}
            data-tooltip={splitLabel}
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
            title={unifiedLabel}
            data-tooltip={unifiedLabel}
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
