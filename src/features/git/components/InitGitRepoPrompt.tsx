import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import { validateBranchName } from "../utils/branchValidation";

type InitGitRepoPromptProps = {
  workspaceName: string;
  branch: string;
  createRemote: boolean;
  repoName: string;
  isPrivate: boolean;
  error?: string | null;
  isBusy?: boolean;
  onBranchChange: (value: string) => void;
  onCreateRemoteChange: (value: boolean) => void;
  onRepoNameChange: (value: string) => void;
  onPrivateChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function InitGitRepoPrompt({
  workspaceName,
  branch,
  createRemote,
  repoName,
  isPrivate,
  error = null,
  isBusy = false,
  onBranchChange,
  onCreateRemoteChange,
  onRepoNameChange,
  onPrivateChange,
  onCancel,
  onConfirm,
}: InitGitRepoPromptProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { t } = useTranslation("git");

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const validationError = useMemo(() => {
    const trimmed = branch.trim();
    if (!trimmed) {
      return t("branchNameRequired");
    }
    return validateBranchName(branch);
  }, [branch, t]);

  const remoteValidationError = useMemo(() => {
    if (!createRemote) {
      return null;
    }
    const trimmed = repoName.trim();
    if (!trimmed) {
      return t("repoNameRequired");
    }
    if (/\s/.test(trimmed)) {
      return t("repoNameNoSpaces");
    }
    return null;
  }, [createRemote, repoName, t]);

  const combinedValidationError = validationError || remoteValidationError;
  const canSubmit = !isBusy && !combinedValidationError;

  return (
    <ModalShell
      className="git-init-modal"
      ariaLabel={t("initializeGit")}
      onBackdropClick={() => {
        if (!isBusy) {
          onCancel();
        }
      }}
    >
      <div className="ds-modal-title git-init-modal-title">{t("initializeGit")}</div>
      <div className="ds-modal-subtitle git-init-modal-subtitle">
        {t("initGitDescription", { workspaceName })}
      </div>

      <label className="ds-modal-label git-init-modal-label" htmlFor="git-init-branch">
        {t("initialBranch")}
      </label>
      <input
        id="git-init-branch"
        ref={inputRef}
        className="ds-modal-input git-init-modal-input"
        value={branch}
        placeholder={t("mainPlaceholder")}
        disabled={isBusy}
        onChange={(event) => onBranchChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (!isBusy) {
              onCancel();
            }
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            if (canSubmit) {
              onConfirm();
            }
          }
        }}
      />

      <label className="git-init-modal-checkbox-row">
        <input
          type="checkbox"
          className="git-init-modal-checkbox"
          checked={createRemote}
          disabled={isBusy}
          onChange={(event) => onCreateRemoteChange(event.target.checked)}
        />
        <span className="git-init-modal-checkbox-text">
          {t("createGitHubRepo")}<code>origin</code>
        </span>
      </label>

      {createRemote && (
        <div className="git-init-modal-remote">
          <label className="ds-modal-label git-init-modal-label" htmlFor="git-init-repo-name">
            {t("githubRepo")}
          </label>
          <input
            id="git-init-repo-name"
            className="ds-modal-input git-init-modal-input"
            value={repoName}
            placeholder={t("ownerRepoPlaceholder")}
            disabled={isBusy}
            onChange={(event) => onRepoNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                if (!isBusy) {
                  onCancel();
                }
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (canSubmit) {
                  onConfirm();
                }
              }
            }}
          />

          <label className="git-init-modal-checkbox-row git-init-modal-checkbox-row--nested">
            <input
              type="checkbox"
              className="git-init-modal-checkbox"
              checked={isPrivate}
              disabled={isBusy}
              onChange={(event) => onPrivateChange(event.target.checked)}
            />
            <span className="git-init-modal-checkbox-text">{t("privateRepo")}</span>
          </label>
        </div>
      )}

      {(error || combinedValidationError) && (
        <div className="ds-modal-error git-init-modal-error">
          {error || combinedValidationError}
        </div>
      )}

      <div className="ds-modal-actions git-init-modal-actions">
        <button
          type="button"
          className="ghost ds-modal-button git-init-modal-button"
          onClick={onCancel}
          disabled={isBusy}
        >
{t("cancel")}
        </button>
        <button
          type="button"
          className="primary ds-modal-button git-init-modal-button"
          onClick={onConfirm}
          disabled={!canSubmit}
        >
          {isBusy ? t("initializing") : t("initialize")}
        </button>
      </div>
    </ModalShell>
  );
}
