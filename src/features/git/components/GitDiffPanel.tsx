import type { GitHubIssue, GitHubPullRequest, GitLogEntry } from "../../../types";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeftRight,
  Check,
  FileText,
  GitBranch,
  RotateCcw,
  ScrollText,
  Search,
  Upload,
} from "lucide-react";
import { useMemo, useState, useCallback } from "react";
import { formatRelativeTime } from "../../../utils/time";
import { PanelTabs, type PanelTabId } from "../../layout/components/PanelTabs";

type GitDiffPanelProps = {
  mode: "diff" | "log" | "issues" | "prs";
  onModeChange: (mode: "diff" | "log" | "issues" | "prs") => void;
  filePanelMode: PanelTabId;
  onFilePanelModeChange: (mode: PanelTabId) => void;
  worktreeApplyLabel?: string;
  worktreeApplyTitle?: string | null;
  worktreeApplyLoading?: boolean;
  worktreeApplyError?: string | null;
  worktreeApplySuccess?: boolean;
  onApplyWorktreeChanges?: () => void | Promise<void>;
  onRevertAllChanges?: () => void | Promise<void>;
  branchName: string;
  totalAdditions: number;
  totalDeletions: number;
  fileStatus: string;
  error?: string | null;
  logError?: string | null;
  logLoading?: boolean;
  logTotal?: number;
  logAhead?: number;
  logBehind?: number;
  logAheadEntries?: GitLogEntry[];
  logBehindEntries?: GitLogEntry[];
  logUpstream?: string | null;
  issues?: GitHubIssue[];
  issuesTotal?: number;
  issuesLoading?: boolean;
  issuesError?: string | null;
  pullRequests?: GitHubPullRequest[];
  pullRequestsTotal?: number;
  pullRequestsLoading?: boolean;
  pullRequestsError?: string | null;
  selectedPullRequest?: number | null;
  onSelectPullRequest?: (pullRequest: GitHubPullRequest) => void;
  gitRemoteUrl?: string | null;
  gitRoot?: string | null;
  gitRootCandidates?: string[];
  gitRootScanDepth?: number;
  gitRootScanLoading?: boolean;
  gitRootScanError?: string | null;
  gitRootScanHasScanned?: boolean;
  onGitRootScanDepthChange?: (depth: number) => void;
  onScanGitRoots?: () => void;
  onSelectGitRoot?: (path: string) => void;
  onClearGitRoot?: () => void;
  onPickGitRoot?: () => void | Promise<void>;
  selectedPath?: string | null;
  onSelectFile?: (path: string) => void;
  stagedFiles: {
    path: string;
    status: string;
    additions: number;
    deletions: number;
  }[];
  unstagedFiles: {
    path: string;
    status: string;
    additions: number;
    deletions: number;
  }[];
  onStageFile?: (path: string) => Promise<void> | void;
  onUnstageFile?: (path: string) => Promise<void> | void;
  onRevertFile?: (path: string) => Promise<void> | void;
  logEntries: GitLogEntry[];
  selectedCommitSha?: string | null;
  onSelectCommit?: (entry: GitLogEntry) => void;
  commitMessage?: string;
  commitMessageLoading?: boolean;
  commitMessageError?: string | null;
  onCommitMessageChange?: (value: string) => void;
  onGenerateCommitMessage?: () => void | Promise<void>;
  // Git operations
  onCommit?: () => void | Promise<void>;
  onCommitAndPush?: () => void | Promise<void>;
  onCommitAndSync?: () => void | Promise<void>;
  onPush?: () => void | Promise<void>;
  onSync?: () => void | Promise<void>;
  commitLoading?: boolean;
  pushLoading?: boolean;
  syncLoading?: boolean;
  commitError?: string | null;
  pushError?: string | null;
  syncError?: string | null;
  // For showing push button when there are commits to push
  commitsAhead?: number;
};

function splitPath(path: string) {
  const parts = path.split("/");
  if (parts.length === 1) {
    return { name: path, dir: "" };
  }
  return { name: parts[parts.length - 1], dir: parts.slice(0, -1).join("/") };
}

function splitNameAndExtension(name: string) {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) {
    return { base: name, extension: "" };
  }
  return {
    base: name.slice(0, lastDot),
    extension: name.slice(lastDot + 1).toLowerCase(),
  };
}

function normalizeRootPath(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function getStatusSymbol(status: string) {
  switch (status) {
    case "A":
      return "+";
    case "M":
      return "M";
    case "D":
      return "-";
    case "R":
      return "R";
    case "T":
      return "T";
    default:
      return "?";
  }
}

function getStatusClass(status: string) {
  switch (status) {
    case "A":
      return "diff-icon-added";
    case "M":
      return "diff-icon-modified";
    case "D":
      return "diff-icon-deleted";
    case "R":
      return "diff-icon-renamed";
    case "T":
      return "diff-icon-typechange";
    default:
      return "diff-icon-unknown";
  }
}

function isMissingRepo(error: string | null | undefined) {
  if (!error) {
    return false;
  }
  const normalized = error.toLowerCase();
  return (
    normalized.includes("could not find repository") ||
    normalized.includes("not a git repository") ||
    (normalized.includes("repository") && normalized.includes("notfound")) ||
    normalized.includes("repository not found") ||
    normalized.includes("git root not found")
  );
}

type CommitButtonProps = {
  commitMessage: string;
  hasStagedFiles: boolean;
  hasUnstagedFiles: boolean;
  commitLoading: boolean;
  onCommit?: () => void | Promise<void>;
};

function CommitButton({
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

export function GitDiffPanel({
  mode,
  onModeChange,
  filePanelMode,
  onFilePanelModeChange,
  worktreeApplyLabel = "apply",
  worktreeApplyTitle = null,
  worktreeApplyLoading = false,
  worktreeApplyError = null,
  worktreeApplySuccess = false,
  onApplyWorktreeChanges,
  onRevertAllChanges,
  branchName,
  totalAdditions,
  totalDeletions,
  fileStatus,
  error,
  logError,
  logLoading = false,
  logTotal = 0,
  gitRemoteUrl = null,
  onSelectFile,
  logEntries,
  logAhead = 0,
  logBehind = 0,
  logAheadEntries = [],
  logBehindEntries = [],
  logUpstream = null,
  selectedCommitSha = null,
  onSelectCommit,
  issues = [],
  issuesTotal = 0,
  issuesLoading = false,
  issuesError = null,
  pullRequests = [],
  pullRequestsTotal = 0,
  pullRequestsLoading = false,
  pullRequestsError = null,
  selectedPullRequest = null,
  onSelectPullRequest,
  gitRoot = null,
  gitRootCandidates = [],
  gitRootScanDepth = 2,
  gitRootScanLoading = false,
  gitRootScanError = null,
  gitRootScanHasScanned = false,
  selectedPath = null,
  stagedFiles = [],
  unstagedFiles = [],
  onStageFile,
  onUnstageFile,
  onRevertFile,
  onGitRootScanDepthChange,
  onScanGitRoots,
  onSelectGitRoot,
  onClearGitRoot,
  onPickGitRoot,
  commitMessage = "",
  commitMessageLoading = false,
  commitMessageError = null,
  onCommitMessageChange,
  onGenerateCommitMessage,
  onCommit,
  onCommitAndPush: _onCommitAndPush,
  onCommitAndSync: _onCommitAndSync,
  onPush,
  onSync: _onSync,
  commitLoading = false,
  pushLoading = false,
  syncLoading: _syncLoading = false,
  commitError = null,
  pushError = null,
  syncError = null,
  commitsAhead = 0,
}: GitDiffPanelProps) {
  // Multi-select state for file list
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastClickedFile, setLastClickedFile] = useState<string | null>(null);

  // Combine staged and unstaged files for range selection
  const allFiles = useMemo(
    () => [
      ...stagedFiles.map(f => ({ ...f, section: "staged" as const })),
      ...unstagedFiles.map(f => ({ ...f, section: "unstaged" as const })),
    ],
    [stagedFiles, unstagedFiles],
  );

  const handleFileClick = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
    path: string,
    _section: "staged" | "unstaged",
  ) => {
    const isMetaKey = event.metaKey || event.ctrlKey;
    const isShiftKey = event.shiftKey;

    if (isMetaKey) {
      // Cmd/Ctrl+click: toggle selection
      setSelectedFiles(prev => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
      setLastClickedFile(path);
    } else if (isShiftKey && lastClickedFile) {
      // Shift+click: select range
      const currentIndex = allFiles.findIndex(f => f.path === path);
      const lastIndex = allFiles.findIndex(f => f.path === lastClickedFile);
      if (currentIndex !== -1 && lastIndex !== -1) {
        const start = Math.min(currentIndex, lastIndex);
        const end = Math.max(currentIndex, lastIndex);
        const range = allFiles.slice(start, end + 1).map(f => f.path);
        setSelectedFiles(prev => {
          const next = new Set(prev);
          for (const p of range) {
            next.add(p);
          }
          return next;
        });
      }
    } else {
      // Regular click: select single file and view it
      setSelectedFiles(new Set([path]));
      setLastClickedFile(path);
      onSelectFile?.(path);
    }
  }, [lastClickedFile, allFiles, onSelectFile]);

  // Clear selection when files change
  const filesKey = [...stagedFiles, ...unstagedFiles].map(f => f.path).join(",");
  const [prevFilesKey, setPrevFilesKey] = useState(filesKey);
  if (filesKey !== prevFilesKey) {
    setPrevFilesKey(filesKey);
    setSelectedFiles(new Set());
    setLastClickedFile(null);
  }

  const handleDiffListClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".diff-row")) {
        return;
      }
      setSelectedFiles(new Set());
      setLastClickedFile(null);
    },
    [],
  );

  const ModeIcon = (() => {
    switch (mode) {
      case "log":
        return ScrollText;
      case "issues":
        return Search;
      case "prs":
        return GitBranch;
      default:
        return FileText;
    }
  })();
  const githubBaseUrl = (() => {
    if (!gitRemoteUrl) {
      return null;
    }
    const trimmed = gitRemoteUrl.trim();
    if (!trimmed) {
      return null;
    }
    let path = "";
    if (trimmed.startsWith("git@github.com:")) {
      path = trimmed.slice("git@github.com:".length);
    } else if (trimmed.startsWith("ssh://git@github.com/")) {
      path = trimmed.slice("ssh://git@github.com/".length);
    } else if (trimmed.includes("github.com/")) {
      path = trimmed.split("github.com/")[1] ?? "";
    }
    path = path.replace(/\.git$/, "").replace(/\/$/, "");
    if (!path) {
      return null;
    }
    return `https://github.com/${path}`;
  })();

  async function showLogMenu(event: ReactMouseEvent<HTMLDivElement>, entry: GitLogEntry) {
    event.preventDefault();
    event.stopPropagation();
    const copyItem = await MenuItem.new({
      text: "Copy SHA",
      action: async () => {
        await navigator.clipboard.writeText(entry.sha);
      },
    });
    const items = [copyItem];
    if (githubBaseUrl) {
      const openItem = await MenuItem.new({
        text: "Open on GitHub",
        action: async () => {
          await openUrl(`${githubBaseUrl}/commit/${entry.sha}`);
        },
      });
      items.push(openItem);
    }
    const menu = await Menu.new({ items });
    const window = getCurrentWindow();
    const position = new LogicalPosition(event.clientX, event.clientY);
    await menu.popup(position, window);
  }

  async function showPullRequestMenu(
    event: ReactMouseEvent<HTMLDivElement>,
    pullRequest: GitHubPullRequest,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const openItem = await MenuItem.new({
      text: "Open on GitHub",
      action: async () => {
        await openUrl(pullRequest.url);
      },
    });
    const menu = await Menu.new({ items: [openItem] });
    const window = getCurrentWindow();
    const position = new LogicalPosition(event.clientX, event.clientY);
    await menu.popup(position, window);
  }

  async function showFileMenu(
    event: ReactMouseEvent<HTMLDivElement>,
    path: string,
    _mode: "staged" | "unstaged",
  ) {
    event.preventDefault();
    event.stopPropagation();

    // Determine which files to operate on
    // If clicked file is in selection, use all selected files; otherwise just this file
    const isInSelection = selectedFiles.has(path);
    const targetPaths = isInSelection && selectedFiles.size > 1
      ? Array.from(selectedFiles)
      : [path];

    // If clicking on unselected file, select it
    if (!isInSelection) {
      setSelectedFiles(new Set([path]));
      setLastClickedFile(path);
    }

    const fileCount = targetPaths.length;
    const plural = fileCount > 1 ? "s" : "";
    const countSuffix = fileCount > 1 ? ` (${fileCount})` : "";

    // Separate files by their section for stage/unstage operations
    const stagedPaths = targetPaths.filter(p => stagedFiles.some(f => f.path === p));
    const unstagedPaths = targetPaths.filter(p => unstagedFiles.some(f => f.path === p));

    const items: MenuItem[] = [];

    // Unstage action for staged files
    if (stagedPaths.length > 0 && onUnstageFile) {
      items.push(
        await MenuItem.new({
          text: `Unstage file${stagedPaths.length > 1 ? `s (${stagedPaths.length})` : ""}`,
          action: async () => {
            for (const p of stagedPaths) {
              await onUnstageFile(p);
            }
          },
        }),
      );
    }

    // Stage action for unstaged files
    if (unstagedPaths.length > 0 && onStageFile) {
      items.push(
        await MenuItem.new({
          text: `Stage file${unstagedPaths.length > 1 ? `s (${unstagedPaths.length})` : ""}`,
          action: async () => {
            for (const p of unstagedPaths) {
              await onStageFile(p);
            }
          },
        }),
      );
    }

    // Revert action for all selected files
    if (onRevertFile) {
      items.push(
        await MenuItem.new({
          text: `Revert change${plural}${countSuffix}`,
          action: async () => {
            for (const p of targetPaths) {
              await onRevertFile(p);
            }
          },
        }),
      );
    }

    if (!items.length) {
      return;
    }
    const menu = await Menu.new({ items });
    const window = getCurrentWindow();
    const position = new LogicalPosition(event.clientX, event.clientY);
    await menu.popup(position, window);
  }
  const logCountLabel = logTotal
    ? `${logTotal} commit${logTotal === 1 ? "" : "s"}`
    : logEntries.length
      ? `${logEntries.length} commit${logEntries.length === 1 ? "" : "s"}`
    : "No commits";
  const logSyncLabel = logUpstream
    ? `↑${logAhead} ↓${logBehind}`
    : "No upstream configured";
  const logUpstreamLabel = logUpstream ? `Upstream ${logUpstream}` : "";
  const showAheadSection = logUpstream && logAhead > 0;
  const showBehindSection = logUpstream && logBehind > 0;
  const hasDiffTotals = totalAdditions > 0 || totalDeletions > 0;
  const diffTotalsLabel = `+${totalAdditions} / -${totalDeletions}`;
  const diffStatusLabel = hasDiffTotals
    ? [logUpstream ? logSyncLabel : null, diffTotalsLabel]
        .filter(Boolean)
        .join(" · ")
    : logUpstream
      ? `${logSyncLabel} · ${fileStatus}`
      : fileStatus;
  const hasGitRoot = Boolean(gitRoot && gitRoot.trim());
  const showGitRootPanel =
    isMissingRepo(error) ||
    gitRootScanLoading ||
    gitRootScanHasScanned ||
    Boolean(gitRootScanError) ||
    gitRootCandidates.length > 0;
  const normalizedGitRoot = normalizeRootPath(gitRoot);
  const hasWorktreeChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;
  const showApplyWorktree =
    mode === "diff" && Boolean(onApplyWorktreeChanges) && hasWorktreeChanges;
  const hasAnyChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;
  const showRevertAll = mode === "diff" && Boolean(onRevertAllChanges) && hasAnyChanges;
  const showRevertAllInStaged = showRevertAll && stagedFiles.length > 0;
  const showRevertAllInUnstaged = showRevertAll && unstagedFiles.length > 0;
  const canGenerateCommitMessage = hasAnyChanges;
  const showGenerateCommitMessage =
    mode === "diff" && Boolean(onGenerateCommitMessage) && hasAnyChanges;
  const worktreeApplyButtonLabel = worktreeApplySuccess
    ? "applied"
    : worktreeApplyLoading
    ? "applying..."
      : worktreeApplyLabel;
  const worktreeApplyIcon = worktreeApplySuccess ? (
    <Check size={12} aria-hidden />
  ) : (
    <Upload size={12} aria-hidden />
  );
  const depthOptions = [1, 2, 3, 4, 5, 6];
  return (
    <aside className="diff-panel">
      <div className="git-panel-header">
        <PanelTabs active={filePanelMode} onSelect={onFilePanelModeChange} />
        <div className="git-panel-actions" role="group" aria-label="Git panel">
          <div className="git-panel-select">
            <span className="git-panel-select-icon" aria-hidden>
              <ModeIcon />
            </span>
            <select
              className="git-panel-select-input"
              value={mode}
              onChange={(event) =>
                onModeChange(event.target.value as GitDiffPanelProps["mode"])
              }
              aria-label="Git panel view"
            >
              <option value="diff">Diff</option>
              <option value="log">Log</option>
              <option value="issues">Issues</option>
              <option value="prs">PRs</option>
            </select>
          </div>
        </div>
      </div>
      {mode === "diff" ? (
        <>
          <div className="diff-status">{diffStatusLabel}</div>
          {worktreeApplyError && <div className="diff-error">{worktreeApplyError}</div>}
        </>
      ) : mode === "log" ? (
        <>
          <div className="diff-status">{logCountLabel}</div>
          <div className="git-log-sync">
            <span>{logSyncLabel}</span>
            {logUpstreamLabel && (
              <>
                <span className="git-log-sep">·</span>
                <span>{logUpstreamLabel}</span>
              </>
            )}
          </div>
        </>
      ) : mode === "issues" ? (
        <>
          <div className="diff-status diff-status-issues">
            <span>GitHub issues</span>
            {issuesLoading && <span className="git-panel-spinner" aria-hidden />}
          </div>
          <div className="git-log-sync">
            <span>{issuesTotal} open</span>
          </div>
        </>
      ) : (
        <>
          <div className="diff-status diff-status-issues">
            <span>GitHub pull requests</span>
            {pullRequestsLoading && (
              <span className="git-panel-spinner" aria-hidden />
            )}
          </div>
          <div className="git-log-sync">
            <span>{pullRequestsTotal} open</span>
          </div>
        </>
      )}
      {mode === "diff" || mode === "log" ? (
        <div className="diff-branch">{branchName || "unknown"}</div>
      ) : null}
      {mode !== "issues" && hasGitRoot && (
        <div className="git-root-current">
          <span className="git-root-label">Path:</span>
          <span className="git-root-path" title={gitRoot ?? ""}>
            {gitRoot}
          </span>
          {onScanGitRoots && (
            <button
              type="button"
              className="ghost git-root-button git-root-button--icon"
              onClick={onScanGitRoots}
              disabled={gitRootScanLoading}
            >
              <ArrowLeftRight className="git-root-button-icon" aria-hidden />
              Change
            </button>
          )}
        </div>
      )}
      {mode === "diff" ? (
        <div className="diff-list" onClick={handleDiffListClick}>
          {error && <div className="diff-error">{error}</div>}
          {showGitRootPanel && (
            <div className="git-root-panel">
              <div className="git-root-title">Choose a repo for this workspace.</div>
              <div className="git-root-actions">
                <button
                  type="button"
                  className="ghost git-root-button"
                  onClick={onScanGitRoots}
                  disabled={!onScanGitRoots || gitRootScanLoading}
                >
                  Scan workspace
                </button>
                <label className="git-root-depth">
                  <span>Depth</span>
                  <select
                    className="git-root-select"
                    value={gitRootScanDepth}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isNaN(value)) {
                        onGitRootScanDepthChange?.(value);
                      }
                    }}
                    disabled={gitRootScanLoading}
                  >
                    {depthOptions.map((depth) => (
                      <option key={depth} value={depth}>
                        {depth}
                      </option>
                    ))}
                  </select>
                </label>
                {onPickGitRoot && (
                  <button
                    type="button"
                    className="ghost git-root-button"
                    onClick={() => {
                      void onPickGitRoot();
                    }}
                    disabled={gitRootScanLoading}
                  >
                    Pick folder
                  </button>
                )}
                {hasGitRoot && onClearGitRoot && (
                  <button
                    type="button"
                    className="ghost git-root-button"
                    onClick={onClearGitRoot}
                    disabled={gitRootScanLoading}
                  >
                    Use workspace root
                  </button>
                )}
              </div>
              {gitRootScanLoading && (
                <div className="diff-empty">Scanning for repositories...</div>
              )}
              {gitRootScanError && <div className="diff-error">{gitRootScanError}</div>}
              {!gitRootScanLoading &&
                !gitRootScanError &&
                gitRootScanHasScanned &&
                gitRootCandidates.length === 0 && (
                  <div className="diff-empty">No repositories found.</div>
                )}
              {gitRootCandidates.length > 0 && (
                <div className="git-root-list">
                  {gitRootCandidates.map((path) => {
                    const normalizedPath = normalizeRootPath(path);
                    const isActive =
                      normalizedGitRoot && normalizedGitRoot === normalizedPath;
                    return (
                    <button
                      key={path}
                      type="button"
                      className={`git-root-item ${isActive ? "active" : ""}`}
                      onClick={() => onSelectGitRoot?.(path)}
                    >
                      <span className="git-root-path">{path}</span>
                      {isActive && <span className="git-root-tag">Active</span>}
                    </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {showGenerateCommitMessage && (
            <div className="commit-message-section">
              <div className="commit-message-input-wrapper">
                <textarea
                  className="commit-message-input"
                  placeholder="Commit message..."
                  value={commitMessage}
                  onChange={(e) => onCommitMessageChange?.(e.target.value)}
                  disabled={commitMessageLoading}
                  rows={2}
                />
                <button
                  type="button"
                  className="commit-message-generate-button"
                  onClick={() => {
                    if (!canGenerateCommitMessage) {
                      return;
                    }
                    void onGenerateCommitMessage?.();
                  }}
                  disabled={commitMessageLoading || !canGenerateCommitMessage}
                  title={
                    stagedFiles.length > 0
                      ? "Generate commit message from staged changes"
                      : "Generate commit message from unstaged changes"
                  }
                  aria-label="Generate commit message"
                >
                  {commitMessageLoading ? (
                    <svg
                      className="commit-message-loader"
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
                      <path d="M12 2v4" />
                      <path d="m16.2 7.8 2.9-2.9" />
                      <path d="M18 12h4" />
                      <path d="m16.2 16.2 2.9 2.9" />
                      <path d="M12 18v4" />
                      <path d="m4.9 19.1 2.9-2.9" />
                      <path d="M2 12h4" />
                      <path d="m4.9 4.9 2.9 2.9" />
                    </svg>
                  ) : (
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path
                        d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
                        stroke="none"
                      />
                      <path d="M20 2v4" fill="none" />
                      <path d="M22 4h-4" fill="none" />
                      <circle cx="4" cy="20" r="2" fill="none" />
                    </svg>
                  )}
                </button>
              </div>
              {commitMessageError && (
                <div className="commit-message-error">{commitMessageError}</div>
              )}
              {commitError && (
                <div className="commit-message-error">{commitError}</div>
              )}
              {pushError && (
                <div className="commit-message-error">{pushError}</div>
              )}
              {syncError && (
                <div className="commit-message-error">{syncError}</div>
              )}
              <CommitButton
                commitMessage={commitMessage}
                hasStagedFiles={stagedFiles.length > 0}
                hasUnstagedFiles={unstagedFiles.length > 0}
                commitLoading={commitLoading}
                onCommit={onCommit}
              />
            </div>
          )}
          {/* Show Push button when there are commits to push */}
          {commitsAhead > 0 && !stagedFiles.length && (
            <div className="push-section">
              {pushError && (
                <div className="commit-message-error">{pushError}</div>
              )}
              <button
                type="button"
                className="push-button"
                onClick={() => void onPush?.()}
                disabled={pushLoading}
                title={`Push ${commitsAhead} commit${commitsAhead > 1 ? "s" : ""}`}
              >
                {pushLoading ? (
                  <span className="commit-button-spinner" aria-hidden />
                ) : (
                  <Upload size={14} aria-hidden />
                )}
                <span>Push</span>
                <span className="push-count">{commitsAhead}</span>
              </button>
            </div>
          )}
          {!error && !stagedFiles.length && !unstagedFiles.length && commitsAhead === 0 && (
            <div className="diff-empty">No changes detected.</div>
          )}
          {(stagedFiles.length > 0 || unstagedFiles.length > 0) && (
            <>
              {stagedFiles.length > 0 && (
                <div className="diff-section">
                  <div className="diff-section-title diff-section-title--row">
                    <span>Staged ({stagedFiles.length})</span>
                    {showRevertAllInStaged && (
                      <button
                        type="button"
                        className="ghost diff-section-action"
                        onClick={() => {
                          void onRevertAllChanges?.();
                        }}
                        title="Revert all changes"
                      >
                        <RotateCcw size={12} aria-hidden />
                        revert
                      </button>
                    )}
                    {showApplyWorktree && unstagedFiles.length === 0 && (
                      <button
                        type="button"
                        className="ghost diff-section-action"
                        onClick={() => {
                          void onApplyWorktreeChanges?.();
                        }}
                        title={worktreeApplyTitle ?? undefined}
                        disabled={worktreeApplyLoading || worktreeApplySuccess}
                      >
                        {worktreeApplyIcon}
                        {worktreeApplyButtonLabel}
                      </button>
                    )}
                  </div>
                  <div className="diff-section-list">
                    {stagedFiles.map((file) => {
                      const { name, dir } = splitPath(file.path);
                      const { base, extension } = splitNameAndExtension(name);
                      const statusSymbol = getStatusSymbol(file.status);
                      const statusClass = getStatusClass(file.status);
                      const isSelected =
                        selectedFiles.size > 1 && selectedFiles.has(file.path);
                      const isActive = selectedPath === file.path;
                      return (
                        <div
                          key={`staged-${file.path}`}
                          className={`diff-row ${isActive ? "active" : ""} ${isSelected ? "selected" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={(event) => handleFileClick(event, file.path, "staged")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelectFile?.(file.path);
                            }
                          }}
                          onContextMenu={(event) =>
                            showFileMenu(event, file.path, "staged")
                          }
                        >
                          <span className={`diff-icon ${statusClass}`} aria-hidden>
                            {statusSymbol}
                          </span>
                          <div className="diff-file">
                            <div className="diff-path">
                              <span className="diff-name">
                                <span className="diff-name-base">{base}</span>
                                {extension && (
                                  <span className="diff-name-ext">.{extension}</span>
                                )}
                              </span>
                              <span className="diff-counts-inline">
                                <span className="diff-add">+{file.additions}</span>
                                <span className="diff-sep">/</span>
                                <span className="diff-del">-{file.deletions}</span>
                              </span>
                            </div>
                            {dir && <div className="diff-dir">{dir}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {unstagedFiles.length > 0 && (
                <div className="diff-section">
                  <div className="diff-section-title diff-section-title--row">
                    <span>Unstaged ({unstagedFiles.length})</span>
                    {showRevertAllInUnstaged && (
                      <button
                        type="button"
                        className="ghost diff-section-action"
                        onClick={() => {
                          void onRevertAllChanges?.();
                        }}
                        title="Revert all changes"
                      >
                        <RotateCcw size={12} aria-hidden />
                        revert
                      </button>
                    )}
                    {showApplyWorktree && (
                      <button
                        type="button"
                        className="ghost diff-section-action"
                        onClick={() => {
                          void onApplyWorktreeChanges?.();
                        }}
                        title={worktreeApplyTitle ?? undefined}
                        disabled={worktreeApplyLoading || worktreeApplySuccess}
                      >
                        {worktreeApplyIcon}
                        {worktreeApplyButtonLabel}
                      </button>
                    )}
                  </div>
                  <div className="diff-section-list">
                    {unstagedFiles.map((file) => {
                      const { name, dir } = splitPath(file.path);
                      const { base, extension } = splitNameAndExtension(name);
                      const statusSymbol = getStatusSymbol(file.status);
                      const statusClass = getStatusClass(file.status);
                      const isSelected =
                        selectedFiles.size > 1 && selectedFiles.has(file.path);
                      const isActive = selectedPath === file.path;
                      return (
                        <div
                          key={`unstaged-${file.path}`}
                          className={`diff-row ${isActive ? "active" : ""} ${isSelected ? "selected" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={(event) => handleFileClick(event, file.path, "unstaged")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelectFile?.(file.path);
                            }
                          }}
                          onContextMenu={(event) =>
                            showFileMenu(event, file.path, "unstaged")
                          }
                        >
                          <span className={`diff-icon ${statusClass}`} aria-hidden>
                            {statusSymbol}
                          </span>
                          <div className="diff-file">
                            <div className="diff-path">
                              <span className="diff-name">
                                <span className="diff-name-base">{base}</span>
                                {extension && (
                                  <span className="diff-name-ext">.{extension}</span>
                                )}
                              </span>
                              <span className="diff-counts-inline">
                                <span className="diff-add">+{file.additions}</span>
                                <span className="diff-sep">/</span>
                                <span className="diff-del">-{file.deletions}</span>
                              </span>
                            </div>
                            {dir && <div className="diff-dir">{dir}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : mode === "log" ? (
        <div className="git-log-list">
          {logError && <div className="diff-error">{logError}</div>}
          {!logError && logLoading && (
            <div className="diff-viewer-loading">Loading commits...</div>
          )}
          {!logError &&
            !logLoading &&
            !logEntries.length &&
            !showAheadSection &&
            !showBehindSection && (
            <div className="diff-empty">No commits yet.</div>
          )}
          {showAheadSection && (
            <div className="git-log-section">
              <div className="git-log-section-title">To push</div>
              <div className="git-log-section-list">
                {logAheadEntries.map((entry) => {
                  const isSelected = selectedCommitSha === entry.sha;
                  return (
                    <div
                      key={entry.sha}
                      className={`git-log-entry git-log-entry-compact ${isSelected ? "active" : ""}`}
                      onClick={() => onSelectCommit?.(entry)}
                      onContextMenu={(event) => showLogMenu(event, entry)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectCommit?.(entry);
                        }
                      }}
                    >
                      <div className="git-log-summary">
                        {entry.summary || "No message"}
                      </div>
                      <div className="git-log-meta">
                        <span className="git-log-sha">
                          {entry.sha.slice(0, 7)}
                        </span>
                        <span className="git-log-sep">·</span>
                        <span className="git-log-author">
                          {entry.author || "Unknown"}
                        </span>
                        <span className="git-log-sep">·</span>
                        <span className="git-log-date">
                          {formatRelativeTime(entry.timestamp * 1000)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {showBehindSection && (
            <div className="git-log-section">
              <div className="git-log-section-title">To pull</div>
              <div className="git-log-section-list">
                {logBehindEntries.map((entry) => {
                  const isSelected = selectedCommitSha === entry.sha;
                  return (
                    <div
                      key={entry.sha}
                      className={`git-log-entry git-log-entry-compact ${isSelected ? "active" : ""}`}
                      onClick={() => onSelectCommit?.(entry)}
                      onContextMenu={(event) => showLogMenu(event, entry)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectCommit?.(entry);
                        }
                      }}
                    >
                      <div className="git-log-summary">
                        {entry.summary || "No message"}
                      </div>
                      <div className="git-log-meta">
                        <span className="git-log-sha">
                          {entry.sha.slice(0, 7)}
                        </span>
                        <span className="git-log-sep">·</span>
                        <span className="git-log-author">
                          {entry.author || "Unknown"}
                        </span>
                        <span className="git-log-sep">·</span>
                        <span className="git-log-date">
                          {formatRelativeTime(entry.timestamp * 1000)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {(logEntries.length > 0 || logLoading) && (
            <div className="git-log-section">
              <div className="git-log-section-title">Recent commits</div>
              <div className="git-log-section-list">
                {logEntries.map((entry) => {
                  const isSelected = selectedCommitSha === entry.sha;
                  return (
                    <div
                      key={entry.sha}
                      className={`git-log-entry ${isSelected ? "active" : ""}`}
                      onClick={() => onSelectCommit?.(entry)}
                      onContextMenu={(event) => showLogMenu(event, entry)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectCommit?.(entry);
                        }
                      }}
                    >
                      <div className="git-log-summary">
                        {entry.summary || "No message"}
                      </div>
                      <div className="git-log-meta">
                        <span className="git-log-sha">{entry.sha.slice(0, 7)}</span>
                        <span className="git-log-sep">·</span>
                        <span className="git-log-author">
                          {entry.author || "Unknown"}
                        </span>
                        <span className="git-log-sep">·</span>
                        <span className="git-log-date">
                          {formatRelativeTime(entry.timestamp * 1000)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : mode === "issues" ? (
        <div className="git-issues-list">
          {issuesError && <div className="diff-error">{issuesError}</div>}
          {!issuesError && !issuesLoading && !issues.length && (
            <div className="diff-empty">No open issues.</div>
          )}
          {issues.map((issue) => {
            const relativeTime = formatRelativeTime(new Date(issue.updatedAt).getTime());
            return (
              <a
                key={issue.number}
                className="git-issue-entry"
                href={issue.url}
                onClick={(event) => {
                  event.preventDefault();
                  void openUrl(issue.url);
                }}
              >
                <div className="git-issue-summary">
                  <span className="git-issue-title">
                    <span className="git-issue-number">#{issue.number}</span>{" "}
                    {issue.title}{" "}
                    <span className="git-issue-date">· {relativeTime}</span>
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="git-pr-list">
          {pullRequestsError && (
            <div className="diff-error">{pullRequestsError}</div>
          )}
          {!pullRequestsError &&
            !pullRequestsLoading &&
            !pullRequests.length && (
            <div className="diff-empty">No open pull requests.</div>
          )}
          {pullRequests.map((pullRequest) => {
            const relativeTime = formatRelativeTime(
              new Date(pullRequest.updatedAt).getTime(),
            );
            const author = pullRequest.author?.login ?? "unknown";
            const isSelected = selectedPullRequest === pullRequest.number;
            return (
              <div
                key={pullRequest.number}
                className={`git-pr-entry ${isSelected ? "active" : ""}`}
                onClick={() => onSelectPullRequest?.(pullRequest)}
                onContextMenu={(event) => showPullRequestMenu(event, pullRequest)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectPullRequest?.(pullRequest);
                  }
                }}
              >
                <div className="git-pr-header">
                  <span className="git-pr-title">
                    <span className="git-pr-number">#{pullRequest.number}</span>
                    <span className="git-pr-title-text">
                      {pullRequest.title}{" "}
                      <span className="git-pr-author-inline">@{author}</span>
                    </span>
                  </span>
                  <span className="git-pr-time">{relativeTime}</span>
                </div>
                <div className="git-pr-meta">
                  {pullRequest.isDraft && (
                    <span className="git-pr-pill git-pr-draft">Draft</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
