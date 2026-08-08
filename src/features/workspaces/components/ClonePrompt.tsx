import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "../../design-system/components/modal/ModalShell";

type ClonePromptProps = {
  workspaceName: string;
  copyName: string;
  copiesFolder: string;
  suggestedCopiesFolder?: string | null;
  error?: string | null;
  onCopyNameChange: (value: string) => void;
  onChooseCopiesFolder: () => void;
  onUseSuggestedCopiesFolder: () => void;
  onClearCopiesFolder: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  isBusy?: boolean;
};

export function ClonePrompt({
  workspaceName,
  copyName,
  copiesFolder,
  suggestedCopiesFolder = null,
  error = null,
  onCopyNameChange,
  onChooseCopiesFolder,
  onUseSuggestedCopiesFolder,
  onClearCopiesFolder,
  onCancel,
  onConfirm,
  isBusy = false,
}: ClonePromptProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const canCreate = copyName.trim().length > 0 && copiesFolder.trim().length > 0;
  const showSuggested =
    Boolean(suggestedCopiesFolder) && copiesFolder.trim().length === 0;

  return (
    <ModalShell
      className="clone-modal"
      ariaLabel={t("workspaces:ariaNewCloneAgent")}
      onBackdropClick={() => {
        if (!isBusy) {
          onCancel();
        }
      }}
    >
      <div className="ds-modal-title clone-modal-title">{t("workspaces:cloneModalTitle")}</div>
      <div className="ds-modal-subtitle clone-modal-subtitle">
        {t("workspaces:cloneModalSubtitle", { workspaceName })}
      </div>
      <label className="ds-modal-label clone-modal-label" htmlFor="clone-copy-name">
        {t("workspaces:copyName")}
      </label>
      <input
        id="clone-copy-name"
        ref={inputRef}
        className="ds-modal-input clone-modal-input"
        value={copyName}
        onChange={(event) => onCopyNameChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (!isBusy) {
              onCancel();
            }
          }
          if (event.key === "Enter" && canCreate && !isBusy) {
            event.preventDefault();
            onConfirm();
          }
        }}
      />
      <label className="ds-modal-label clone-modal-label" htmlFor="clone-copies-folder">
        {t("workspaces:copiesFolder")}
      </label>
      <div className="clone-modal-folder-row">
        <textarea
          id="clone-copies-folder"
          className="ds-modal-input clone-modal-input clone-modal-input--path"
          value={copiesFolder}
          placeholder={t("workspaces:notSet")}
          readOnly
          rows={1}
          wrap="off"
          onFocus={(event) => {
            const value = event.currentTarget.value;
            event.currentTarget.setSelectionRange(value.length, value.length);
            requestAnimationFrame(() => {
              event.currentTarget.scrollLeft = event.currentTarget.scrollWidth;
            });
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              if (!isBusy) {
                onCancel();
              }
            }
            if (event.key === "Enter" && canCreate && !isBusy) {
              event.preventDefault();
              onConfirm();
            }
          }}
        ></textarea>
        <button
          type="button"
          className="ghost clone-modal-button"
          onClick={onChooseCopiesFolder}
          disabled={isBusy}
        >
          {t("workspaces:choose")}
        </button>
        <button
          type="button"
          className="ghost clone-modal-button"
          onClick={onClearCopiesFolder}
          disabled={isBusy || copiesFolder.trim().length === 0}
        >
{t("workspaces:clear")}
        </button>
      </div>
      {showSuggested && (
        <div className="clone-modal-suggested">
          <div className="clone-modal-suggested-label">{t("workspaces:suggested")}</div>
          <div className="clone-modal-suggested-row">
            <textarea
              className="ds-modal-input clone-modal-suggested-path clone-modal-input--path"
              value={suggestedCopiesFolder ?? ""}
              readOnly
              rows={1}
              wrap="off"
              aria-label={t("workspaces:ariaSuggestedCopiesFolder")}
              title={suggestedCopiesFolder ?? ""}
              onFocus={(event) => {
                const value = event.currentTarget.value;
                event.currentTarget.setSelectionRange(value.length, value.length);
                requestAnimationFrame(() => {
                  event.currentTarget.scrollLeft = event.currentTarget.scrollWidth;
                });
              }}
            ></textarea>
            <button
              type="button"
              className="ghost clone-modal-button"
              onClick={async () => {
                if (!suggestedCopiesFolder) {
                  return;
                }
                try {
                  await navigator.clipboard.writeText(suggestedCopiesFolder);
                } catch {
                  // Ignore clipboard failures (e.g. permission denied).
                }
              }}
              disabled={isBusy || !suggestedCopiesFolder}
            >
              {t("workspaces:copy")}
            </button>
            <button
              type="button"
              className="ghost clone-modal-button"
              onClick={onUseSuggestedCopiesFolder}
              disabled={isBusy}
            >
              {t("workspaces:useSuggested")}
            </button>
          </div>
        </div>
      )}
      {error && <div className="ds-modal-error clone-modal-error">{error}</div>}
      <div className="ds-modal-actions clone-modal-actions">
        <button
          className="ghost ds-modal-button clone-modal-button"
          onClick={onCancel}
          type="button"
          disabled={isBusy}
        >
          {t("workspaces:cancel")}
        </button>
        <button
          className="primary ds-modal-button clone-modal-button"
          onClick={onConfirm}
          type="button"
          disabled={isBusy || !canCreate}
        >
          {t("workspaces:create")}
        </button>
      </div>
    </ModalShell>
  );
}
