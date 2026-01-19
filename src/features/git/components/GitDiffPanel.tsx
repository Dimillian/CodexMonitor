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
}: GitDiffPanelProps) {
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
    mode: "staged" | "unstaged",
  ) {
    event.preventDefault();
    event.stopPropagation();
    const items: MenuItem[] = [];
    if (mode === "staged" && onUnstageFile) {
      items.push(
        await MenuItem.new({
          text: "Unstage file",
          action: async () => {
            await onUnstageFile(path);
          },
        }),
      );
    }
    if (mode === "unstaged" && onStageFile) {
      items.push(
        await MenuItem.new({
          text: "Stage file",
          action: async () => {
            await onStageFile(path);
          },
        }),
      );
    }
    if (onRevertFile) {
      items.push(
        await MenuItem.new({
          text: "Revert changes",
          action: async () => {
            await onRevertFile(path);
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
        <div className="git-panel-select" role="group" aria-label="Git panel">
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
        <div className="diff-list">
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
          {!error && !stagedFiles.length && !unstagedFiles.length && (
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
                      return (
                        <div
                          key={`staged-${file.path}`}
                          className={`diff-row ${selectedPath === file.path ? "active" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectFile?.(file.path)}
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
                      return (
                        <div
                          key={`unstaged-${file.path}`}
                          className={`diff-row ${selectedPath === file.path ? "active" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectFile?.(file.path)}
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
                {logAheadEntries.map((entry) => (
                  <div
                    key={entry.sha}
                    className="git-log-entry git-log-entry-compact"
                    onContextMenu={(event) => showLogMenu(event, entry)}
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
                ))}
              </div>
            </div>
          )}
          {showBehindSection && (
            <div className="git-log-section">
              <div className="git-log-section-title">To pull</div>
              <div className="git-log-section-list">
                {logBehindEntries.map((entry) => (
                  <div
                    key={entry.sha}
                    className="git-log-entry git-log-entry-compact"
                    onContextMenu={(event) => showLogMenu(event, entry)}
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
                ))}
              </div>
            </div>
          )}
          {(logEntries.length > 0 || logLoading) && (
            <div className="git-log-section">
              <div className="git-log-section-title">Recent commits</div>
              <div className="git-log-section-list">
                {logEntries.map((entry) => (
                  <div
                    key={entry.sha}
                    className="git-log-entry"
                    onContextMenu={(event) => showLogMenu(event, entry)}
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
                ))}
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
