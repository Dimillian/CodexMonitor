import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const focusTextareaAtEnd = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.focus();
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  };

  useEffect(() => {
    focusTextareaAtEnd();
  }, []);

  return (
    <ModalShell
      ariaLabel={t("workspaces:ariaAddRemoteWorkspacePaths")}
      className="mobile-remote-workspace-modal"
      cardClassName="mobile-remote-workspace-modal-card"
      onBackdropClick={onCancel}
    >
      <div className="mobile-remote-workspace-modal-content">
        <div className="ds-modal-title">{t("workspaces:addProjectDirectories")}</div>
        <div className="ds-modal-subtitle">
          {t("workspaces:addProjectDirectoriesSubtitle")}
        </div>
        <label className="ds-modal-label" htmlFor="mobile-remote-workspace-paths">
          {t("workspaces:paths")}
        </label>
        <textarea
          id="mobile-remote-workspace-paths"
          ref={textareaRef}
          className="ds-modal-textarea"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("workspaces:pathsPlaceholder")}
          rows={4}
          wrap="off"
        />
        <div className="mobile-remote-workspace-modal-hint">
          {t("workspaces:pathsHint")}
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
                  onClick={() => {
                    onRecentPathSelect(path);
                    requestAnimationFrame(() => {
                      focusTextareaAtEnd();
                    });
                  }}
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
            {t("workspaces:cancel")}
          </button>
          <button className="primary ds-modal-button" onClick={onConfirm} type="button">
            {t("workspaces:add")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
