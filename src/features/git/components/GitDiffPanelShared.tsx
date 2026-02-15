import type { GitLogEntry } from "../../../types";
import { memo, useCallback, useState, type MouseEvent as ReactMouseEvent } from "react";
import Check from "lucide-react/dist/esm/icons/check";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open";
import FolderClosed from "lucide-react/dist/esm/icons/folder-closed";
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

// ── Tree data structures ──

type DiffTreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  file?: DiffFile;
  children: DiffTreeNode[];
  stats: { additions: number; deletions: number };
};

/** Build a nested tree from a flat list of diff files. Single-child
 *  folder chains are collapsed into one node (e.g. "src/features/app"). */
function buildDiffTree(files: DiffFile[]): DiffTreeNode[] {
  const root: DiffTreeNode = {
    name: "",
    path: "",
    type: "folder",
    children: [],
    stats: { additions: 0, deletions: 0 },
  };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;
    let pathSoFar = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
      if (i === parts.length - 1) {
        // leaf file
        current.children.push({
          name: part,
          path: file.path,
          type: "file",
          file,
          children: [],
          stats: { additions: file.additions, deletions: file.deletions },
        });
      } else {
        let child = current.children.find(
          (c) => c.type === "folder" && c.name === part,
        );
        if (!child) {
          child = {
            name: part,
            path: pathSoFar,
            type: "folder",
            children: [],
            stats: { additions: 0, deletions: 0 },
          };
          current.children.push(child);
        }
        current = child;
      }
    }
  }

  // Aggregate stats bottom-up
  function aggregate(node: DiffTreeNode): void {
    if (node.type === "file") return;
    let add = 0;
    let del = 0;
    for (const child of node.children) {
      aggregate(child);
      add += child.stats.additions;
      del += child.stats.deletions;
    }
    node.stats = { additions: add, deletions: del };
    // Sort: folders first, then files, alphabetically within each
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }
  aggregate(root);

  // Collapse single-child folder chains
  function collapse(node: DiffTreeNode): DiffTreeNode {
    if (node.type === "file") return node;
    node.children = node.children.map(collapse);
    if (
      node.children.length === 1 &&
      node.children[0].type === "folder" &&
      node.name !== ""
    ) {
      const child = node.children[0];
      return {
        ...child,
        name: `${node.name}/${child.name}`,
      };
    }
    return node;
  }

  root.children = root.children.map(collapse);
  return root.children;
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
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
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
      onContextMenu={onContextMenu}
    >
      <button type="button" className="diff-row-main" onClick={onClick}>
        <span className={`diff-icon ${statusClass}`} aria-hidden>
          {statusSymbol}
        </span>
        <span className="diff-file">
          <span className="diff-path">
            <span className="diff-name">
              <span className="diff-name-base">{base}</span>
              {extension && <span className="diff-name-ext">.{extension}</span>}
            </span>
          </span>
          {dir && <span className="diff-dir">{dir}</span>}
        </span>
      </button>
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

// ── Recursive tree row ──

type DiffTreeRowProps = {
  node: DiffTreeNode;
  depth: number;
  section: "staged" | "unstaged";
  selectedFiles: Set<string>;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile?: (path: string) => void;
  onFileClick: (
    event: ReactMouseEvent<HTMLElement>,
    path: string,
    section: "staged" | "unstaged",
  ) => void;
  onShowFileMenu: (
    event: ReactMouseEvent<HTMLElement>,
    path: string,
    section: "staged" | "unstaged",
  ) => void;
  onStageFile?: (path: string) => Promise<void> | void;
  onUnstageFile?: (path: string) => Promise<void> | void;
  onDiscardFile?: (path: string) => Promise<void> | void;
};

const DiffTreeRow = memo(function DiffTreeRow({
  node,
  depth,
  section,
  selectedFiles,
  selectedPath,
  expandedDirs,
  onToggleDir,
  onSelectFile,
  onFileClick,
  onShowFileMenu,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
}: DiffTreeRowProps) {
  const depthClass = `diff-tree-depth-${Math.min(depth, 20)}`;
  if (node.type === "file" && node.file) {
    const isSelected = selectedFiles.size > 1 && selectedFiles.has(node.file.path);
    const isActive = selectedPath === node.file.path;
    return (
      <div className={`diff-tree-file-row-wrap ${depthClass}`}>
        <DiffFileRow
          file={node.file}
          isSelected={isSelected}
          isActive={isActive}
          section={section}
          onClick={(event) => onFileClick(event, node.file!.path, section)}
          onContextMenu={(event) => onShowFileMenu(event, node.file!.path, section)}
          onStageFile={onStageFile}
          onUnstageFile={onUnstageFile}
          onDiscardFile={onDiscardFile}
        />
      </div>
    );
  }

  const isExpanded = expandedDirs.has(node.path);
  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;
  const FolderIcon = isExpanded ? FolderOpen : FolderClosed;

  return (
    <div className="diff-tree-folder">
      <button
        type="button"
        className={`diff-tree-folder-row ${depthClass}`}
        onClick={() => onToggleDir(node.path)}
        aria-expanded={isExpanded}
      >
        <span className="diff-tree-chevron" aria-hidden>
          <ChevronIcon size={12} />
        </span>
        <span className="diff-tree-folder-icon" aria-hidden>
          <FolderIcon size={13} />
        </span>
        <span className="diff-tree-folder-name" title={node.path}>
          {node.name}
        </span>
        <span className="diff-tree-folder-stats">
          <span className="diff-add">+{node.stats.additions}</span>
          <span className="diff-sep">/</span>
          <span className="diff-del">-{node.stats.deletions}</span>
        </span>
      </button>
      {isExpanded && (
        <div className="diff-tree-folder-children">
          {node.children.map((child) => (
            <DiffTreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              section={section}
              selectedFiles={selectedFiles}
              selectedPath={selectedPath}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
              onFileClick={onFileClick}
              onShowFileMenu={onShowFileMenu}
              onStageFile={onStageFile}
              onUnstageFile={onUnstageFile}
              onDiscardFile={onDiscardFile}
            />
          ))}
        </div>
      )}
    </div>
  );
});

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
    event: ReactMouseEvent<HTMLElement>,
    path: string,
    section: "staged" | "unstaged",
  ) => void;
  onShowFileMenu: (
    event: ReactMouseEvent<HTMLElement>,
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

  // Build tree and manage expand/collapse state (default: all expanded)
  const tree = buildDiffTree(files);

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    const dirs = new Set<string>();
    function collectDirs(nodes: DiffTreeNode[]) {
      for (const node of nodes) {
        if (node.type === "folder") {
          dirs.add(node.path);
          collectDirs(node.children);
        }
      }
    }
    collectDirs(tree);
    return dirs;
  });

  const onToggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

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
        {tree.map((node) => (
          <DiffTreeRow
            key={node.path}
            node={node}
            depth={0}
            section={section}
            selectedFiles={selectedFiles}
            selectedPath={selectedPath}
            expandedDirs={expandedDirs}
            onToggleDir={onToggleDir}
            onSelectFile={onSelectFile}
            onFileClick={onFileClick}
            onShowFileMenu={onShowFileMenu}
            onStageFile={onStageFile}
            onUnstageFile={onUnstageFile}
            onDiscardFile={onDiscardFile}
          />
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
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
};

export function GitLogEntryRow({
  entry,
  isSelected,
  compact = false,
  onSelect,
  onContextMenu,
}: GitLogEntryRowProps) {
  return (
    <button
      type="button"
      className={`git-log-entry ${compact ? "git-log-entry-compact" : ""} ${isSelected ? "active" : ""}`}
      onClick={() => onSelect?.(entry)}
      onContextMenu={onContextMenu}
    >
      <span className="git-log-summary">{entry.summary || "无提交信息"}</span>
      <span className="git-log-meta">
        <span className="git-log-sha">{entry.sha.slice(0, 7)}</span>
        <span className="git-log-sep">·</span>
        <span className="git-log-author">{entry.author || "未知作者"}</span>
        <span className="git-log-sep">·</span>
        <span className="git-log-date">{formatRelativeTime(entry.timestamp * 1000)}</span>
      </span>
    </button>
  );
}

export function WorktreeApplyIcon({ success }: { success: boolean }) {
  if (success) {
    return <Check size={12} aria-hidden />;
  }
  return <Upload size={12} aria-hidden />;
}
