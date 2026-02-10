import type { GitLogEntry } from "../../../types";
import type { MouseEvent as ReactMouseEvent } from "react";
import Check from "lucide-react/dist/esm/icons/check";
import Minus from "lucide-react/dist/esm/icons/minus";
import Plus from "lucide-react/dist/esm/icons/plus";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import Upload from "lucide-react/dist/esm/icons/upload";
import X from "lucide-react/dist/esm/icons/x";
import { formatRelativeTime } from "../../../utils/time";
import {
  getStatusClass,
  getStatusSymbol,
  splitNameAndExtension,
  splitPath,
} from "./GitDiffPanel.utils";

export type DiffFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
};

export type SidebarErrorAction = {
  label: string;
  onAction: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
};

type CommitButtonProps = {
  commitMessage: string;
  hasStagedFiles: boolean;
  hasUnstagedFiles: boolean;
  commitLoading: boolean;
  onCommit?: () => void | Promise<void>;
};

export function CommitButton({
  commitMessage,
  hasStagedFiles,
  hasUnstagedFiles,
  commitLoading,
  onCommit,
}: CommitButtonProps) {
  const hasMessage = commitMessage.trim().length > 0;
  const hasChanges = hasStagedFiles || hasUnstagedFiles;
  const canCommit = hasMessage && hasChanges && !commitLoading;

  const handleCommit = () => {
    if (canCommit) {
      void onCommit?.();
    }
  };

  return (
    <div className="commit-button-container">
      <button
        type="button"
        className="commit-button"
        onClick={handleCommit}
        disabled={!canCommit}
        title={
          !hasMessage
            ? "Enter a commit message"
            : !hasChanges
              ? "No changes to commit"
              : hasStagedFiles
                ? "Commit staged changes"
                : "Commit all unstaged changes"
        }
      >
        {commitLoading ? (
          <span className="commit-button-spinner" aria-hidden />
        ) : (
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
        <span>{commitLoading ? "Committing..." : "Commit"}</span>
      </button>
    </div>
  );
}

type SidebarErrorProps = {
  variant?: "diff" | "commit";
  message: string;
  action?: SidebarErrorAction | null;
  onDismiss: () => void;
};

export function SidebarError({
  variant = "diff",
  message,
  action,
  onDismiss,
}: SidebarErrorProps) {
  return (
    <div className={`sidebar-error sidebar-error-${variant}`}>
      <div className="sidebar-error-body">
        <div className={variant === "commit" ? "commit-message-error" : "diff-error"}>
          {message}
        </div>
        {action && (
          <button
            type="button"
            className="ghost sidebar-error-action"
            onClick={() => void action.onAction()}
            disabled={action.disabled || action.loading}
          >
            {action.loading && <span className="commit-button-spinner" aria-hidden />}
            <span>{action.label}</span>
          </button>
        )}
      </div>
      <button
        type="button"
        className="ghost icon-button sidebar-error-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss error"
        title="Dismiss error"
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  );
}

type DiffFileRowProps = {
  file: DiffFile;
  isSelected: boolean;
  isActive: boolean;
  section: "staged" | "unstaged";
  onClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onKeySelect: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onStageFile?: (path: string) => Promise<void> | void;
  onUnstageFile?: (path: string) => Promise<void> | void;
  onDiscardFile?: (path: string) => Promise<void> | void;
};

function DiffFileRow({
  file,
  isSelected,
  isActive,
  section,
  onClick,
  onKeySelect,
  onContextMenu,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
}: DiffFileRowProps) {
  const { name, dir } = splitPath(file.path);
  const { base, extension } = splitNameAndExtension(name);
  const statusSymbol = getStatusSymbol(file.status);
  const statusClass = getStatusClass(file.status);
  const showStage = section === "unstaged" && Boolean(onStageFile);
  const showUnstage = section === "staged" && Boolean(onUnstageFile);
  const showDiscard = section === "unstaged" && Boolean(onDiscardFile);

  return (
    <div
      className={`diff-row ${isActive ? "active" : ""} ${isSelected ? "selected" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onKeySelect();
        }
      }}
      onContextMenu={onContextMenu}
    >
      <span className={`diff-icon ${statusClass}`} aria-hidden>
        {statusSymbol}
      </span>
      <div className="diff-file">
        <div className="diff-path">
          <span className="diff-name">
            <span className="diff-name-base">{base}</span>
            {extension && <span className="diff-name-ext">.{extension}</span>}
          </span>
        </div>
        {dir && <div className="diff-dir">{dir}</div>}
      </div>
      <div className="diff-row-meta">
        <span className="diff-counts-inline" aria-label={`+${file.additions} -${file.deletions}`}>
          <span className="diff-add">+{file.additions}</span>
          <span className="diff-sep">/</span>
          <span className="diff-del">-{file.deletions}</span>
        </span>
        <div className="diff-row-actions" role="group" aria-label="File actions">
          {showStage && (
            <button
              type="button"
              className="diff-row-action diff-row-action--stage"
              onClick={(event) => {
                event.stopPropagation();
                void onStageFile?.(file.path);
              }}
              data-tooltip="Stage Changes"
              aria-label="Stage file"
            >
              <Plus size={12} aria-hidden />
            </button>
          )}
          {showUnstage && (
            <button
              type="button"
              className="diff-row-action diff-row-action--unstage"
              onClick={(event) => {
                event.stopPropagation();
                void onUnstageFile?.(file.path);
              }}
              data-tooltip="Unstage Changes"
              aria-label="Unstage file"
            >
              <Minus size={12} aria-hidden />
            </button>
          )}
          {showDiscard && (
            <button
              type="button"
              className="diff-row-action diff-row-action--discard"
              onClick={(event) => {
                event.stopPropagation();
                void onDiscardFile?.(file.path);
              }}
              data-tooltip="Discard Changes"
              aria-label="Discard changes"
            >
              <RotateCcw size={12} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type DiffSectionProps = {
  title: string;
  files: DiffFile[];
  section: "staged" | "unstaged";
  selectedFiles: Set<string>;
  selectedPath: string | null;
  onSelectFile?: (path: string) => void;
  onStageAllChanges?: () => Promise<void> | void;
  onStageFile?: (path: string) => Promise<void> | void;
  onUnstageFile?: (path: string) => Promise<void> | void;
  onDiscardFile?: (path: string) => Promise<void> | void;
  onDiscardFiles?: (paths: string[]) => Promise<void> | void;
  onFileClick: (
    event: ReactMouseEvent<HTMLDivElement>,
    path: string,
    section: "staged" | "unstaged",
  ) => void;
  onShowFileMenu: (
    event: ReactMouseEvent<HTMLDivElement>,
    path: string,
    section: "staged" | "unstaged",
  ) => void;
};

export function DiffSection({
  title,
  files,
  section,
  selectedFiles,
  selectedPath,
  onSelectFile,
  onStageAllChanges,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onDiscardFiles,
  onFileClick,
  onShowFileMenu,
}: DiffSectionProps) {
  const filePaths = files.map((file) => file.path);
  const canStageAll =
    section === "unstaged" &&
    (Boolean(onStageAllChanges) || Boolean(onStageFile)) &&
    filePaths.length > 0;
  const canUnstageAll = section === "staged" && Boolean(onUnstageFile) && filePaths.length > 0;
  const canDiscardAll = section === "unstaged" && Boolean(onDiscardFiles) && filePaths.length > 0;
  const showSectionActions = canStageAll || canUnstageAll || canDiscardAll;

  return (
    <div className="diff-section">
      <div className="diff-section-title diff-section-title--row">
        <span>
          {title} ({files.length})
        </span>
        {showSectionActions && (
          <div className="diff-section-actions" role="group" aria-label={`${title} actions`}>
            {canStageAll && (
              <button
                type="button"
                className="diff-row-action diff-row-action--stage"
                onClick={() => {
                  if (onStageAllChanges) {
                    void onStageAllChanges();
                    return;
                  }
                  void (async () => {
                    for (const path of filePaths) {
                      await onStageFile?.(path);
                    }
                  })();
                }}
                data-tooltip="Stage All Changes"
                aria-label="Stage all changes"
              >
                <Plus size={12} aria-hidden />
              </button>
            )}
            {canUnstageAll && (
              <button
                type="button"
                className="diff-row-action diff-row-action--unstage"
                onClick={() => {
                  void (async () => {
                    for (const path of filePaths) {
                      await onUnstageFile?.(path);
                    }
                  })();
                }}
                data-tooltip="Unstage All Changes"
                aria-label="Unstage all changes"
              >
                <Minus size={12} aria-hidden />
              </button>
            )}
            {canDiscardAll && (
              <button
                type="button"
                className="diff-row-action diff-row-action--discard"
                onClick={() => {
                  void onDiscardFiles?.(filePaths);
                }}
                data-tooltip="Discard All Changes"
                aria-label="Discard all changes"
              >
                <RotateCcw size={12} aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="diff-section-list">
        {files.map((file) => {
          const isSelected = selectedFiles.size > 1 && selectedFiles.has(file.path);
          const isActive = selectedPath === file.path;
          return (
            <DiffFileRow
              key={`${section}-${file.path}`}
              file={file}
              isSelected={isSelected}
              isActive={isActive}
              section={section}
              onClick={(event) => onFileClick(event, file.path, section)}
              onKeySelect={() => onSelectFile?.(file.path)}
              onContextMenu={(event) => onShowFileMenu(event, file.path, section)}
              onStageFile={onStageFile}
              onUnstageFile={onUnstageFile}
              onDiscardFile={onDiscardFile}
            />
          );
        })}
      </div>
    </div>
  );
}

type GitLogEntryRowProps = {
  entry: GitLogEntry;
  isSelected: boolean;
  compact?: boolean;
  onSelect?: (entry: GitLogEntry) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

export function GitLogEntryRow({
  entry,
  isSelected,
  compact = false,
  onSelect,
  onContextMenu,
}: GitLogEntryRowProps) {
  return (
    <div
      className={`git-log-entry ${compact ? "git-log-entry-compact" : ""} ${isSelected ? "active" : ""}`}
      onClick={() => onSelect?.(entry)}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.(entry);
        }
      }}
    >
      <div className="git-log-summary">{entry.summary || "No message"}</div>
      <div className="git-log-meta">
        <span className="git-log-sha">{entry.sha.slice(0, 7)}</span>
        <span className="git-log-sep">·</span>
        <span className="git-log-author">{entry.author || "Unknown"}</span>
        <span className="git-log-sep">·</span>
        <span className="git-log-date">{formatRelativeTime(entry.timestamp * 1000)}</span>
      </div>
    </div>
  );
}

export function WorktreeApplyIcon({ success }: { success: boolean }) {
  if (success) {
    return <Check size={12} aria-hidden />;
  }
  return <Upload size={12} aria-hidden />;
}
