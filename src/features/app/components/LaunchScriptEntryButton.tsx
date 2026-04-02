import type { LaunchScriptEntry, LaunchScriptIconId } from "../../../types";
import { useTranslation } from "react-i18next";
import { PopoverSurface } from "../../design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "../hooks/useMenuController";
import { LaunchScriptIconPicker } from "./LaunchScriptIconPicker";
import { getLaunchScriptIcon } from "../utils/launchScriptIcons";

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
  const { t } = useTranslation();
  const editorMenu = useMenuController({
    open: editorOpen,
    onDismiss: onCloseEditor,
  });
  const { containerRef: popoverRef } = editorMenu;
  const Icon = getLaunchScriptIcon(entry.icon);
  const buttonLabel = entry.label?.trim() || t("uiText.appHeader.launchScript");

  return (
    <div className="launch-script-menu" ref={popoverRef}>
      <div className="launch-script-buttons">
        <button
          type="button"
          className="ghost main-header-action launch-script-run ds-tooltip-trigger"
          onClick={onRun}
          onContextMenu={(event) => {
            event.preventDefault();
            onOpenEditor();
          }}
          data-tauri-drag-region="false"
          aria-label={buttonLabel}
          title={buttonLabel}
          data-tooltip={buttonLabel}
          data-tooltip-placement="bottom"
        >
          <Icon size={14} aria-hidden />
        </button>
      </div>
      {editorOpen && (
        <PopoverSurface className="launch-script-popover" role="dialog">
          <div className="launch-script-title">
            {entry.label?.trim() || t("uiText.appHeader.launchScript")}
          </div>
          <LaunchScriptIconPicker value={draftIcon} onChange={onDraftIconChange} />
          <input
            className="launch-script-input"
            type="text"
            placeholder={t("uiText.appHeader.optionalLabel")}
            value={draftLabel}
            onChange={(event) => onDraftLabelChange(event.target.value)}
            data-tauri-drag-region="false"
          />
          <textarea
            className="launch-script-textarea"
            placeholder={t("uiText.appHeader.launchScriptPlaceholder")}
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
              {t("prompts.cancel")}
            </button>
            <button
              type="button"
              className="ghost launch-script-delete"
              onClick={onDelete}
              data-tauri-drag-region="false"
            >
              {t("prompts.delete")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={onSave}
              disabled={isSaving}
              data-tauri-drag-region="false"
            >
              {isSaving ? t("uiText.appHeader.saving") : t("prompts.save")}
            </button>
          </div>
        </PopoverSurface>
      )}
    </div>
  );
}
