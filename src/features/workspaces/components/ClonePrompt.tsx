import { useEffect, useRef } from "react";
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
      ariaLabel="新建克隆对话"
      onBackdropClick={() => {
        if (!isBusy) {
          onCancel();
        }
      }}
    >
      <div className="ds-modal-title clone-modal-title">新建克隆对话</div>
      <div className="ds-modal-subtitle clone-modal-subtitle">
        创建 "{workspaceName}" 的工作副本。
      </div>
      <label className="ds-modal-label clone-modal-label" htmlFor="clone-copy-name">
        副本名称
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
        副本文件夹
      </label>
      <div className="clone-modal-folder-row">
        <textarea
          id="clone-copies-folder"
          className="ds-modal-input clone-modal-input clone-modal-input--path"
          value={copiesFolder}
          placeholder="未设置"
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
          选择…
        </button>
        <button
          type="button"
          className="ghost clone-modal-button"
          onClick={onClearCopiesFolder}
          disabled={isBusy || copiesFolder.trim().length === 0}
        >
          清除
        </button>
      </div>
      {showSuggested && (
        <div className="clone-modal-suggested">
          <div className="clone-modal-suggested-label">建议</div>
          <div className="clone-modal-suggested-row">
            <textarea
              className="ds-modal-input clone-modal-suggested-path clone-modal-input--path"
              value={suggestedCopiesFolder ?? ""}
              readOnly
              rows={1}
              wrap="off"
              aria-label="建议的副本文件夹"
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
              复制
            </button>
            <button
              type="button"
              className="ghost clone-modal-button"
              onClick={onUseSuggestedCopiesFolder}
              disabled={isBusy}
            >
              使用建议
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
          取消
        </button>
        <button
          className="primary ds-modal-button clone-modal-button"
          onClick={onConfirm}
          type="button"
          disabled={isBusy || !canCreate}
        >
          创建
        </button>
      </div>
    </ModalShell>
  );
}
