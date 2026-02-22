import { useEffect, useRef } from "react";
import { ModalShell } from "../../design-system/components/modal/ModalShell";

type WorkspacePathsPromptProps = {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function WorkspacePathsPrompt({
  value,
  error,
  onChange,
  onCancel,
  onConfirm,
}: WorkspacePathsPromptProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const helpId = "workspace-paths-input-help";
  const errorId = "workspace-paths-input-error";
  const describedBy = error ? `${helpId} ${errorId}` : helpId;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <ModalShell
      className="workspace-paths-modal"
      cardClassName="workspace-paths-modal-card"
      ariaLabel="Add workspace paths"
      onBackdropClick={onCancel}
    >
      <div className="ds-modal-title">Add workspaces</div>
      <div id={helpId} className="ds-modal-subtitle">
        Enter one or more absolute project paths on the connected server. Use one path
        per line or comma-separated entries.
      </div>
      <label className="ds-modal-label" htmlFor="workspace-paths-input">
        Server paths
      </label>
      <textarea
        id="workspace-paths-input"
        ref={inputRef}
        className="ds-modal-textarea"
        value={value}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        placeholder={"/home/dev/project-one\n/home/dev/project-two"}
        rows={4}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onConfirm();
          }
        }}
      />
      {error && (
        <div id={errorId} className="ds-modal-error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      <div className="ds-modal-actions">
        <button className="ghost ds-modal-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="primary ds-modal-button" onClick={onConfirm} type="button">
          Add
        </button>
      </div>
    </ModalShell>
  );
}
