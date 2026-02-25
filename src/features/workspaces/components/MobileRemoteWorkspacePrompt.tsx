import { useEffect, useRef } from "react";
import { ModalShell } from "../../design-system/components/modal/ModalShell";

type MobileRemoteWorkspacePromptProps = {
  value: string;
  error: string | null;
  recentPaths: string[];
  onChange: (value: string) => void;
  onRecentPathSelect: (path: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MobileRemoteWorkspacePrompt({
  value,
  error,
  recentPaths,
  onChange,
  onRecentPathSelect,
  onCancel,
  onConfirm,
}: MobileRemoteWorkspacePromptProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <ModalShell
      ariaLabel="Add remote workspace paths"
      className="mobile-remote-workspace-modal"
      cardClassName="mobile-remote-workspace-modal-card"
      onBackdropClick={onCancel}
    >
      <div className="mobile-remote-workspace-modal-content">
        <div className="ds-modal-title">Add project directories</div>
        <div className="ds-modal-subtitle">
          Enter directories on the connected server.
        </div>
        <label className="ds-modal-label" htmlFor="mobile-remote-workspace-paths">
          Paths
        </label>
        <textarea
          id="mobile-remote-workspace-paths"
          ref={textareaRef}
          className="ds-modal-textarea"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={"/home/vlad/dev/project-one\n/home/vlad/dev/project-two"}
          rows={4}
          wrap="off"
        />
        <div className="mobile-remote-workspace-modal-hint">
          One path per line. Comma and semicolon separators also work. You can use `~/...`.
        </div>
        {recentPaths.length > 0 && (
          <div className="mobile-remote-workspace-modal-recent">
            <div className="mobile-remote-workspace-modal-recent-title">Recently added</div>
            <div className="mobile-remote-workspace-modal-recent-list">
              {recentPaths.map((path) => (
                <button
                  key={path}
                  type="button"
                  className="mobile-remote-workspace-modal-recent-item"
                  onClick={() => onRecentPathSelect(path)}
                >
                  {path}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <div className="ds-modal-error">{error}</div>}
        <div className="ds-modal-actions">
          <button className="ghost ds-modal-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="primary ds-modal-button" onClick={onConfirm} type="button">
            Add
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
