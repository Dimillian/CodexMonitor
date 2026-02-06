import { useEffect, useRef } from "react";

type AddWorkspacePromptProps = {
  path: string;
  error?: string | null;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isBusy?: boolean;
};

export function AddWorkspacePrompt({
  path,
  error = null,
  onChange,
  onCancel,
  onConfirm,
  isBusy = false,
}: AddWorkspacePromptProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const canAdd = path.trim().length > 0;

  return (
    <div className="worktree-modal" role="dialog" aria-modal="true">
      <div
        className="worktree-modal-backdrop"
        onClick={() => {
          if (!isBusy) {
            onCancel();
          }
        }}
      />
      <div className="worktree-modal-card">
        <div className="worktree-modal-title">Add workspace</div>
        <div className="worktree-modal-subtitle">
          Enter a path on the machine running the backend daemon.
        </div>
        <label className="worktree-modal-label" htmlFor="add-workspace-path">
          Workspace path
        </label>
        <input
          id="add-workspace-path"
          ref={inputRef}
          className="worktree-modal-input"
          value={path}
          placeholder="/home/user/project"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={isBusy}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              if (!isBusy) {
                onCancel();
              }
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (!isBusy && canAdd) {
                onConfirm();
              }
            }
          }}
        />
        {error && <div className="worktree-modal-error">{error}</div>}
        <div className="worktree-modal-actions">
          <button
            className="ghost worktree-modal-button"
            onClick={onCancel}
            type="button"
            disabled={isBusy}
          >
            Cancel
          </button>
          <button
            className="primary worktree-modal-button"
            onClick={onConfirm}
            type="button"
            disabled={isBusy || !canAdd}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

