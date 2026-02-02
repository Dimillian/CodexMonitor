import { useEffect, useRef } from "react";
import Play from "lucide-react/dist/esm/icons/play";
import type { LaunchScriptIconId } from "../../../types";
import { LaunchScriptIconPicker } from "./LaunchScriptIconPicker";
import { DEFAULT_LAUNCH_SCRIPT_ICON } from "../utils/launchScriptIcons";

type LaunchScriptButtonProps = {
  launchScript: string | null;
  editorOpen: boolean;
  draftScript: string;
  isSaving: boolean;
  error: string | null;
  onRun: () => void;
  onOpenEditor: () => void;
  onCloseEditor: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  showNew?: boolean;
  newEditorOpen?: boolean;
  newDraftScript?: string;
  newDraftIcon?: LaunchScriptIconId;
  newDraftLabel?: string;
  newError?: string | null;
  onOpenNew?: () => void;
  onCloseNew?: () => void;
  onNewDraftChange?: (value: string) => void;
  onNewDraftIconChange?: (value: LaunchScriptIconId) => void;
  onNewDraftLabelChange?: (value: string) => void;
  onCreateNew?: () => void;
};

export function LaunchScriptButton({
  launchScript,
  editorOpen,
  draftScript,
  isSaving,
  error,
  onRun,
  onOpenEditor,
  onCloseEditor,
  onDraftChange,
  onSave,
  showNew = false,
  newEditorOpen = false,
  newDraftScript = "",
  newDraftIcon = DEFAULT_LAUNCH_SCRIPT_ICON,
  newDraftLabel = "",
  newError = null,
  onOpenNew,
  onCloseNew,
  onNewDraftChange,
  onNewDraftIconChange,
  onNewDraftLabelChange,
  onCreateNew,
}: LaunchScriptButtonProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const hasLaunchScript = Boolean(launchScript?.trim());

  useEffect(() => {
    if (!editorOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) {
        return;
      }
      onCloseEditor();
      onCloseNew?.();
    };
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, [editorOpen, onCloseEditor, onCloseNew]);

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
          aria-label={hasLaunchScript ? "Run launch script" : "Set launch script"}
          title={hasLaunchScript ? "Run launch script" : "Set launch script"}
        >
          <Play size={14} aria-hidden />
        </button>
      </div>
      {editorOpen && (
        <div className="launch-script-popover popover-surface" role="dialog">
          <div className="launch-script-title">Launch script</div>
          <textarea
            className="launch-script-textarea"
            placeholder="e.g. npm run dev"
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
              onClick={() => {
                onCloseEditor();
                onCloseNew?.();
              }}
              data-tauri-drag-region="false"
            >
              Cancel
            </button>
            {showNew && onOpenNew && (
              <button
                type="button"
                className="ghost"
                onClick={onOpenNew}
                data-tauri-drag-region="false"
              >
                New
              </button>
            )}
            <button
              type="button"
              className="primary"
              onClick={onSave}
              disabled={isSaving}
              data-tauri-drag-region="false"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
          {showNew && newEditorOpen && onNewDraftChange && onNewDraftIconChange && onCreateNew && (
            <div className="launch-script-new">
              <div className="launch-script-title">New launch script</div>
              <LaunchScriptIconPicker
                value={newDraftIcon}
                onChange={onNewDraftIconChange}
              />
              <input
                className="launch-script-input"
                type="text"
                placeholder="Optional label"
                value={newDraftLabel}
                onChange={(event) => onNewDraftLabelChange?.(event.target.value)}
                data-tauri-drag-region="false"
              />
              <textarea
                className="launch-script-textarea"
                placeholder="e.g. npm run dev"
                value={newDraftScript}
                onChange={(event) => onNewDraftChange(event.target.value)}
                rows={5}
                data-tauri-drag-region="false"
              />
              {newError && <div className="launch-script-error">{newError}</div>}
              <div className="launch-script-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={onCloseNew}
                  data-tauri-drag-region="false"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={onCreateNew}
                  disabled={isSaving}
                  data-tauri-drag-region="false"
                >
                  {isSaving ? "Saving..." : "Create"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
