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

type DirectoryGroup = {
  directory: string;
  files: DiffFile[];
};

function groupFilesByDirectory(files: DiffFile[]): DirectoryGroup[] {
  const groups = new Map<string, DiffFile[]>();
  for (const file of files) {
    const lastSlash = file.path.lastIndexOf("/");
    const dir = lastSlash >= 0 ? file.path.slice(0, lastSlash) : "";
    if (!groups.has(dir)) {
      groups.set(dir, []);
    }
    groups.get(dir)!.push(file);
  }
  // Sort directories; root files first, then alphabetical
  const entries = Array.from(groups.entries()).sort((a, b) => {
    if (a[0] === "") return -1;
    if (b[0] === "") return 1;
    return a[0].localeCompare(b[0]);
  });
  return entries.map(([directory, dirFiles]) => ({ directory, files: dirFiles }));
}

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
            ? "请输入提交信息"
            : !hasChanges
              ? "没有可提交的改动"
              : hasStagedFiles
                ? "提交已暂存的改动"
                : "提交所有未暂存的改动"
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
        <span>{commitLoading ? "提交中..." : "提交"}</span>
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
        aria-label="关闭错误提示"
        title="关闭错误提示"
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
        <div className="diff-row-actions" role="group" aria-label="文件操作">
          {showStage && (
            <button
              type="button"
              className="diff-row-action diff-row-action--stage"
              onClick={(event) => {
                event.stopPropagation();
                void onStageFile?.(file.path);
              }}
              data-tooltip="暂存改动"
              aria-label="暂存文件"
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
              data-tooltip="取消暂存改动"
              aria-label="取消暂存文件"
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
              data-tooltip="丢弃改动"
              aria-label="丢弃改动"
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
          <div className="diff-section-actions" role="group" aria-label={`${title} 操作`}>
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
                data-tooltip="暂存全部改动"
                aria-label="暂存全部改动"
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
                data-tooltip="取消暂存全部改动"
                aria-label="取消暂存全部改动"
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
                data-tooltip="丢弃全部改动"
                aria-label="丢弃全部改动"
              >
                <RotateCcw size={12} aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="diff-section-list">
        {groupFilesByDirectory(files).map((group) => (
          <div key={group.directory} className="diff-directory-group">
            {group.directory !== "" && (
              <div className="diff-directory-label" title={group.directory}>
                {group.directory}/
              </div>
            )}
            {group.files.map((file) => {
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
        ))}
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
      <div className="git-log-summary">{entry.summary || "无提交信息"}</div>
      <div className="git-log-meta">
        <span className="git-log-sha">{entry.sha.slice(0, 7)}</span>
        <span className="git-log-sep">·</span>
        <span className="git-log-author">{entry.author || "未知作者"}</span>
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
