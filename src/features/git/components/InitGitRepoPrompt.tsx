import { useEffect, useMemo, useRef } from "react";
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

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const validationError = useMemo(() => {
    const trimmed = branch.trim();
    if (!trimmed) {
      return "Branch name is required.";
    }
    return validateBranchName(branch);
  }, [branch]);

  const remoteValidationError = useMemo(() => {
    if (!createRemote) {
      return null;
    }
    const trimmed = repoName.trim();
    if (!trimmed) {
      return "Repository name is required.";
    }
    if (/\s/.test(trimmed)) {
      return "Repository name cannot contain spaces.";
    }
    return null;
  }, [createRemote, repoName]);

  const combinedValidationError = validationError || remoteValidationError;
  const canSubmit = !isBusy && !combinedValidationError;

  return (
    <ModalShell
      className="git-init-modal"
      ariaLabel="Initialize Git"
      onBackdropClick={() => {
        if (!isBusy) {
          onCancel();
        }
      }}
    >
      <div className="ds-modal-title git-init-modal-title">Initialize Git</div>
      <div className="ds-modal-subtitle git-init-modal-subtitle">
        Create a new repository under "{workspaceName}" and make an initial commit.
      </div>

      <label className="ds-modal-label git-init-modal-label" htmlFor="git-init-branch">
        Initial branch
      </label>
      <input
        id="git-init-branch"
        ref={inputRef}
        className="ds-modal-input git-init-modal-input"
        value={branch}
        placeholder="main"
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
          Create GitHub repository and set up <code>origin</code>
        </span>
      </label>

      {createRemote && (
        <div className="git-init-modal-remote">
          <label className="ds-modal-label git-init-modal-label" htmlFor="git-init-repo-name">
            GitHub repo
          </label>
          <input
            id="git-init-repo-name"
            className="ds-modal-input git-init-modal-input"
            value={repoName}
            placeholder="owner/repo or repo"
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
            <span className="git-init-modal-checkbox-text">Private repo</span>
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
          Cancel
        </button>
        <button
          type="button"
          className="primary ds-modal-button git-init-modal-button"
          onClick={onConfirm}
          disabled={!canSubmit}
        >
          {isBusy ? "Initializing..." : "Initialize"}
        </button>
      </div>
    </ModalShell>
  );
}
