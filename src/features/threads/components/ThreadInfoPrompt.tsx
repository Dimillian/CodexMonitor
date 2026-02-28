import { useEffect, useMemo, useState } from "react";
import Check from "lucide-react/dist/esm/icons/check";
import Copy from "lucide-react/dist/esm/icons/copy";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import {
  MagicSparkleIcon,
  MagicSparkleLoaderIcon,
} from "../../shared/components/MagicSparkleIcon";

export type ThreadInfoPromptThread = {
  threadId: string;
  name: string;
  projectDir: string;
  branchName: string;
  createdAt?: number | null;
  updatedAt?: number | null;
  modelId?: string | null;
  effort?: string | null;
  tokenUsage?: {
    total: { totalTokens: number };
    last: { totalTokens: number };
    modelContextWindow: number | null;
  } | null;
};

type ThreadInfoPromptProps = {
  thread: ThreadInfoPromptThread;
  onClose: () => void;
  onSaveName: (name: string) => Promise<void> | void;
  onGenerateName: () => Promise<string | null>;
};

function formatTimestamp(value?: number | null) {
  if (!value || Number.isNaN(value) || value <= 0) {
    return "Unknown";
  }
  return new Date(value).toLocaleString();
}

function formatCompactTokens(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "Unknown";
  }
  if (value >= 1_000_000) {
    return `${Math.round(value / 100_000) / 10}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 100) / 10}k`;
  }
  return String(Math.round(value));
}

function truncateMiddle(value: string, maxLength = 34) {
  if (value.length <= maxLength) {
    return value;
  }
  const head = Math.max(4, Math.floor((maxLength - 1) / 2));
  const tail = Math.max(4, maxLength - head - 1);
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function ThreadInfoPrompt({
  thread,
  onClose,
  onSaveName,
  onGenerateName,
}: ThreadInfoPromptProps) {
  const [nameDraft, setNameDraft] = useState(thread.name);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [threadIdCopied, setThreadIdCopied] = useState(false);
  const [projectDirCopied, setProjectDirCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNameDraft(thread.name);
    setError(null);
    setIsGenerating(false);
    setIsSaving(false);
    setThreadIdCopied(false);
    setProjectDirCopied(false);
    setRenameModalOpen(false);
  }, [thread.threadId, thread.name]);

  const isNameDirty = useMemo(
    () => nameDraft.trim().length > 0 && nameDraft.trim() !== thread.name.trim(),
    [nameDraft, thread.name],
  );
  const contextUsedTokens = useMemo(() => {
    const fromLast = thread.tokenUsage?.last.totalTokens ?? 0;
    const fromTotal = thread.tokenUsage?.total.totalTokens ?? 0;
    return fromLast > 0 ? fromLast : fromTotal;
  }, [thread.tokenUsage]);
  const contextWindowTokens = thread.tokenUsage?.modelContextWindow ?? null;
  const contextRemainingPercent = useMemo(() => {
    if (!contextWindowTokens || contextWindowTokens <= 0 || contextUsedTokens <= 0) {
      return null;
    }
    const usedPercent = Math.min(
      Math.max((contextUsedTokens / contextWindowTokens) * 100, 0),
      100,
    );
    return Math.max(0, 100 - usedPercent);
  }, [contextUsedTokens, contextWindowTokens]);
  const threadIdDisplay = useMemo(
    () => truncateMiddle(thread.threadId, 32),
    [thread.threadId],
  );
  const projectDirValue = thread.projectDir.trim();

  const handleGenerate = async () => {
    if (isGenerating || isSaving) {
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const generated = await onGenerateName();
      if (!generated) {
        setError("Could not generate a title from this thread yet.");
        return;
      }
      setNameDraft(generated);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : String(generationError),
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || !isNameDirty || isSaving || isGenerating) {
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await onSaveName(trimmed);
      setRenameModalOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      return true;
    } catch {
      setError("Could not copy to clipboard.");
      return false;
    }
  };

  return (
    <>
      <ModalShell
        className="worktree-modal thread-info-modal"
        onBackdropClick={onClose}
        ariaLabel="Thread info"
      >
        <div className="ds-modal-title worktree-modal-title">Thread info</div>
        <div className="thread-info-lines">
          <div className="thread-info-row">
            <span className="thread-info-label">Title</span>
            <div className="thread-info-value-with-action">
              <span className="thread-info-value">{thread.name}</span>
              <button
                type="button"
                className="thread-info-copy-id thread-info-edit-title-button"
                onClick={() => {
                  setNameDraft(thread.name);
                  setError(null);
                  setRenameModalOpen(true);
                }}
                aria-label="Edit thread title"
                title="Edit thread title"
              >
                <Pencil
                  size={14}
                  aria-hidden
                  className="thread-info-action-icon"
                />
              </button>
            </div>
          </div>
          <div className="thread-info-row">
            <span className="thread-info-label">Thread ID</span>
            <div className="thread-info-value-with-action">
              <code className="thread-info-value thread-info-value-singleline" title={thread.threadId}>
                {threadIdDisplay}
              </code>
              <button
                type="button"
                className={`thread-info-copy-id${threadIdCopied ? " is-copied" : ""}`}
                onClick={async () => {
                  if (!(await copyToClipboard(thread.threadId))) {
                    return;
                  }
                  setThreadIdCopied(true);
                  window.setTimeout(() => {
                    setThreadIdCopied(false);
                  }, 1200);
                }}
                aria-label="Copy thread ID"
                title="Copy thread ID"
              >
                {threadIdCopied ? (
                  <Check
                    size={14}
                    aria-hidden
                    className="thread-info-action-icon"
                  />
                ) : (
                  <Copy
                    size={14}
                    aria-hidden
                    className="thread-info-action-icon"
                  />
                )}
              </button>
            </div>
          </div>
          <div className="thread-info-row">
            <span className="thread-info-label">Project</span>
            <div className="thread-info-value-with-action">
              <code
                className="thread-info-value thread-info-value-singleline"
                title={projectDirValue || "Unknown"}
              >
                {projectDirValue || "Unknown"}
              </code>
              <button
                type="button"
                className={`thread-info-copy-id${projectDirCopied ? " is-copied" : ""}`}
                onClick={async () => {
                  if (!projectDirValue) {
                    return;
                  }
                  if (!(await copyToClipboard(projectDirValue))) {
                    return;
                  }
                  setProjectDirCopied(true);
                  window.setTimeout(() => {
                    setProjectDirCopied(false);
                  }, 1200);
                }}
                aria-label="Copy project directory"
                title="Copy project directory"
                disabled={!projectDirValue}
              >
                {projectDirCopied ? (
                  <Check size={14} aria-hidden className="thread-info-action-icon" />
                ) : (
                  <Copy size={14} aria-hidden className="thread-info-action-icon" />
                )}
              </button>
            </div>
          </div>
          <div className="thread-info-row">
            <span className="thread-info-label">Branch</span>
            <code className="thread-info-value">{thread.branchName}</code>
          </div>
          <div className="thread-info-row">
            <span className="thread-info-label">Created</span>
            <span className="thread-info-value">{formatTimestamp(thread.createdAt)}</span>
          </div>
          <div className="thread-info-row">
            <span className="thread-info-label">Updated</span>
            <span className="thread-info-value">{formatTimestamp(thread.updatedAt)}</span>
          </div>
          {thread.modelId ? (
            <div className="thread-info-row">
              <span className="thread-info-label">Model</span>
              <code className="thread-info-value">{thread.modelId}</code>
            </div>
          ) : null}
          {thread.effort ? (
            <div className="thread-info-row">
              <span className="thread-info-label">Effort</span>
              <span className="thread-info-value">{thread.effort}</span>
            </div>
          ) : null}
          <div className="thread-info-row">
            <span className="thread-info-label">Context tokens</span>
            <span className="thread-info-value">
              {formatCompactTokens(contextUsedTokens)}
              {" / "}
              {contextWindowTokens && contextWindowTokens > 0
                ? formatCompactTokens(contextWindowTokens)
                : "Unknown"}
            </span>
          </div>
          <div className="thread-info-row">
            <span className="thread-info-label">Context left</span>
            <span className="thread-info-value">
              {contextRemainingPercent === null
                ? "Unknown"
                : `${contextRemainingPercent.toFixed(1)}%`}
            </span>
          </div>
        </div>
        {error ? <div className="thread-info-error">{error}</div> : null}
        <div className="ds-modal-actions worktree-modal-actions">
          <button
            className="ghost ds-modal-button worktree-modal-button"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </ModalShell>
      {renameModalOpen ? (
        <ModalShell
          className="worktree-modal thread-info-modal"
          onBackdropClick={() => {
            if (isSaving || isGenerating) {
              return;
            }
            setRenameModalOpen(false);
          }}
          ariaLabel="Rename thread title"
        >
          <div className="ds-modal-title worktree-modal-title">Rename thread</div>
          <label className="ds-modal-label worktree-modal-label" htmlFor="thread-title-input">
            Title
          </label>
          <div className="thread-info-title-input-wrapper">
            <textarea
              id="thread-title-input"
              className="thread-info-title-textarea"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  if (!isSaving && !isGenerating) {
                    setRenameModalOpen(false);
                  }
                }
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleSave();
                }
              }}
              disabled={isSaving}
              rows={3}
            />
            <button
              type="button"
              className="thread-info-magic-button"
              onClick={() => void handleGenerate()}
              disabled={isGenerating || isSaving}
              title="Generate thread title"
              aria-label="Generate thread title"
            >
              {isGenerating ? (
                <MagicSparkleLoaderIcon className="thread-info-magic-loader thread-info-magic-icon" />
              ) : (
                <MagicSparkleIcon className="thread-info-magic-icon" />
              )}
            </button>
          </div>
          {error ? <div className="thread-info-error">{error}</div> : null}
          <div className="ds-modal-actions worktree-modal-actions">
            <button
              className="ghost ds-modal-button worktree-modal-button"
              onClick={() => {
                setRenameModalOpen(false);
              }}
              type="button"
              disabled={isSaving || isGenerating}
            >
              Cancel
            </button>
            <button
              className="primary ds-modal-button worktree-modal-button"
              onClick={() => void handleSave()}
              type="button"
              disabled={!isNameDirty || isSaving || isGenerating}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
