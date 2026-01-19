import { useEffect, useRef } from "react";

type RenameThreadPromptProps = {
  currentName: string;
  name: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RenameThreadPrompt({
  currentName,
  name,
  onChange,
  onCancel,
  onConfirm,
}: RenameThreadPromptProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="worktree-modal" role="dialog" aria-modal="true">
      <div className="worktree-modal-backdrop" onClick={onCancel} />
      <div className="worktree-modal-card">
        <div className="worktree-modal-title">Rename thread</div>
        <div className="worktree-modal-subtitle">
          Current name: "{currentName}"
        </div>
        <label className="worktree-modal-label" htmlFor="thread-rename">
          New name
        </label>
        <input
          id="thread-rename"
          ref={inputRef}
          className="worktree-modal-input"
          value={name}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
            if (event.key === "Enter") {
              event.preventDefault();
              onConfirm();
            }
          }}
        />
        <div className="worktree-modal-actions">
          <button
            className="ghost worktree-modal-button"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="primary worktree-modal-button"
            onClick={onConfirm}
            type="button"
            disabled={name.trim().length === 0}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}
