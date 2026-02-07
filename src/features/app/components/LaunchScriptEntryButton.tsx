import { useRef } from "react";
import type { LaunchScriptEntry, LaunchScriptIconId } from "../../../types";
import { PopoverSurface } from "../../design-system/components/popover/PopoverPrimitives";
import { useDismissibleMenu } from "../hooks/useDismissibleMenu";
import { LaunchScriptIconPicker } from "./LaunchScriptIconPicker";
import { getLaunchScriptIcon, getLaunchScriptIconLabel } from "../utils/launchScriptIcons";

type LaunchScriptEntryButtonProps = {
  entry: LaunchScriptEntry;
  editorOpen: boolean;
  draftScript: string;
  draftIcon: LaunchScriptIconId;
  draftLabel: string;
  isSaving: boolean;
  error: string | null;
  onRun: () => void;
  onOpenEditor: () => void;
  onCloseEditor: () => void;
  onDraftChange: (value: string) => void;
  onDraftIconChange: (value: LaunchScriptIconId) => void;
  onDraftLabelChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
};

export function LaunchScriptEntryButton({
  entry,
  editorOpen,
  draftScript,
  draftIcon,
  draftLabel,
  isSaving,
  error,
  onRun,
  onOpenEditor,
  onCloseEditor,
  onDraftChange,
  onDraftIconChange,
  onDraftLabelChange,
  onSave,
  onDelete,
}: LaunchScriptEntryButtonProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const Icon = getLaunchScriptIcon(entry.icon);
  const iconLabel = getLaunchScriptIconLabel(entry.icon);

  useDismissibleMenu({
    isOpen: editorOpen,
    containerRef: popoverRef,
    onClose: onCloseEditor,
  });

  return (
    <div className="launch-script-menu" ref={popoverRef}>
      <div className="launch-script-buttons">
        <button
          type="button"
          className="ghost main-header-action launch-script-run"
          onClick={onRun}
          onContextMenu={(event) => {
            event.preventDefault();
            onOpenEditor();
          }}
          data-tauri-drag-region="false"
          aria-label={entry.label?.trim() || iconLabel}
          title={entry.label?.trim() || iconLabel}
        >
          <Icon size={14} aria-hidden />
        </button>
      </div>
      {editorOpen && (
        <PopoverSurface className="launch-script-popover" role="dialog">
          <div className="launch-script-title">
            {entry.label?.trim() || "启动脚本"}
          </div>
          <LaunchScriptIconPicker value={draftIcon} onChange={onDraftIconChange} />
          <input
            className="launch-script-input"
            type="text"
            placeholder="可选标签"
            value={draftLabel}
            onChange={(event) => onDraftLabelChange(event.target.value)}
            data-tauri-drag-region="false"
          />
          <textarea
            className="launch-script-textarea"
            placeholder="例如：npm run dev"
            value={draftScript}
            onChange={(event) => onDraftChange(event.target.value)}
            rows={6}
            data-tauri-drag-region="false"
          />
          {error && <div className="launch-script-error">{error}</div>}
          <div className="launch-script-actions">
            <button
              type="button"
              className="ghost"
              onClick={onCloseEditor}
              data-tauri-drag-region="false"
            >
              取消
            </button>
            <button
              type="button"
              className="ghost launch-script-delete"
              onClick={onDelete}
              data-tauri-drag-region="false"
            >
              删除
            </button>
            <button
              type="button"
              className="primary"
              onClick={onSave}
              disabled={isSaving}
              data-tauri-drag-region="false"
            >
              {isSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </PopoverSurface>
      )}
    </div>
  );
}
