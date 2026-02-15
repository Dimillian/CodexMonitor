import type { GitHubIssue, GitHubPullRequest, GitLogEntry } from "../../../types";
import type { MouseEvent as ReactMouseEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import ArrowLeftRight from "lucide-react/dist/esm/icons/arrow-left-right";
import Download from "lucide-react/dist/esm/icons/download";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import RotateCw from "lucide-react/dist/esm/icons/rotate-cw";
import Upload from "lucide-react/dist/esm/icons/upload";
import { formatRelativeTime } from "../../../utils/time";
import {
  CommitButton,
  DiffSection,
  type DiffFile,
  GitLogEntryRow,
} from "./GitDiffPanelShared";
import { DEPTH_OPTIONS, normalizeRootPath } from "./GitDiffPanel.utils";

type GitMode = "diff" | "log" | "issues" | "prs";

export type DiffReviewScope = "uncommitted" | "staged" | "unstaged";

type GitPanelModeStatusProps = {
  mode: GitMode;
  diffStatusLabel: string;
  logCountLabel: string;
  logSyncLabel: string;
  logUpstreamLabel: string;
  issuesLoading: boolean;
  issuesTotal: number;
  pullRequestsLoading: boolean;
  pullRequestsTotal: number;
};

export function GitPanelModeStatus({
  mode,
  diffStatusLabel,
  logCountLabel,
  logSyncLabel,
  logUpstreamLabel,
  issuesLoading,
  issuesTotal,
  pullRequestsLoading,
  pullRequestsTotal,
}: GitPanelModeStatusProps) {
  if (mode === "diff") {
    return <div className="diff-status">{diffStatusLabel}</div>;
  }

  if (mode === "log") {
    return (
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
    );
  }

  if (mode === "issues") {
    return (
      <>
        <div className="diff-status diff-status-issues">
          <span>GitHub issues</span>
          {issuesLoading && <span className="git-panel-spinner" aria-hidden />}
        </div>
        <div className="git-log-sync">
          <span>{issuesTotal} open</span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="diff-status diff-status-issues">
        <span>GitHub pull requests</span>
        {pullRequestsLoading && <span className="git-panel-spinner" aria-hidden />}
      </div>
      <div className="git-log-sync">
        <span>{pullRequestsTotal} open</span>
      </div>
    </>
  );
}

type GitBranchRowProps = {
  mode: GitMode;
  branchName: string;
  onFetch?: () => void | Promise<void>;
  fetchLoading: boolean;
};

export function GitBranchRow({ mode, branchName, onFetch, fetchLoading }: GitBranchRowProps) {
  if (mode !== "diff" && mode !== "log") {
    return null;
  }

  return (
    <div className="diff-branch-row">
      <div className="diff-branch">{branchName || "未知"}</div>
      <button
        type="button"
        className="diff-branch-refresh"
        onClick={() => void onFetch?.()}
        disabled={!onFetch || fetchLoading}
        title={fetchLoading ? "正在获取远端..." : "获取远端"}
        aria-label={fetchLoading ? "正在获取远端" : "获取远端"}
      >
        {fetchLoading ? (
          <span className="git-panel-spinner" aria-hidden />
        ) : (
          <RotateCw size={12} aria-hidden />
        )}
      </button>
    </div>
  );
}

type GitRootCurrentPathProps = {
  mode: GitMode;
  hasGitRoot: boolean;
  gitRoot: string | null;
  onScanGitRoots?: () => void;
  gitRootScanLoading: boolean;
};

export function GitRootCurrentPath({
  mode,
  hasGitRoot,
  gitRoot,
  onScanGitRoots,
  gitRootScanLoading,
}: GitRootCurrentPathProps) {
  if (mode === "issues" || !hasGitRoot) {
    return null;
  }

  return (
    <div className="git-root-current">
      <span className="git-root-label">路径：</span>
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
          更改
        </button>
      )}
    </div>
  );
}

type GitDiffModeContentProps = {
  error: string | null | undefined;
  showGitRootPanel: boolean;
  onScanGitRoots?: () => void;
  gitRootScanLoading: boolean;
  gitRootScanDepth: number;
  onGitRootScanDepthChange?: (depth: number) => void;
  onPickGitRoot?: () => void | Promise<void>;
  hasGitRoot: boolean;
  onClearGitRoot?: () => void;
  gitRootScanError: string | null | undefined;
  gitRootScanHasScanned: boolean;
  gitRootCandidates: string[];
  gitRoot: string | null;
  onSelectGitRoot?: (path: string) => void;
  showGenerateCommitMessage: boolean;
  commitMessage: string;
  onCommitMessageChange?: (value: string) => void;
  commitMessageLoading: boolean;
  canGenerateCommitMessage: boolean;
  onGenerateCommitMessage?: () => void | Promise<void>;
  stagedFiles: DiffFile[];
  unstagedFiles: DiffFile[];
  diffScope: DiffReviewScope;
  onDiffScopeChange: (scope: DiffReviewScope) => void;
  commitLoading: boolean;
  onCommit?: () => void | Promise<void>;
  commitsAhead: number;
  commitsBehind: number;
  onPull?: () => void | Promise<void>;
  pullLoading: boolean;
  onPush?: () => void | Promise<void>;
  pushLoading: boolean;
  onSync?: () => void | Promise<void>;
  syncLoading: boolean;
  onStageAllChanges?: () => void | Promise<void>;
  onStageFile?: (path: string) => Promise<void> | void;
  onUnstageFile?: (path: string) => Promise<void> | void;
  onDiscardFile?: (path: string) => Promise<void> | void;
  onDiscardFiles?: (paths: string[]) => Promise<void> | void;
  selectedFiles: Set<string>;
  selectedPath: string | null;
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
  onDiffListClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

export function GitDiffModeContent({
  error,
  showGitRootPanel,
  onScanGitRoots,
  gitRootScanLoading,
  gitRootScanDepth,
  onGitRootScanDepthChange,
  onPickGitRoot,
  hasGitRoot,
  onClearGitRoot,
  gitRootScanError,
  gitRootScanHasScanned,
  gitRootCandidates,
  gitRoot,
  onSelectGitRoot,
  showGenerateCommitMessage,
  commitMessage,
  onCommitMessageChange,
  commitMessageLoading,
  canGenerateCommitMessage,
  onGenerateCommitMessage,
  stagedFiles,
  unstagedFiles,
  diffScope,
  onDiffScopeChange,
  commitLoading,
  onCommit,
  commitsAhead,
  commitsBehind,
  onPull,
  pullLoading,
  onPush,
  pushLoading,
  onSync,
  syncLoading,
  onStageAllChanges,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onDiscardFiles,
  selectedFiles,
  selectedPath,
  onSelectFile,
  onFileClick,
  onShowFileMenu,
  onDiffListClick,
}: GitDiffModeContentProps) {
  const normalizedGitRoot = normalizeRootPath(gitRoot);
  const showStagedSection = diffScope !== "unstaged";
  const showUnstagedSection = diffScope !== "staged";
  const hasScopeFiles =
    (showStagedSection && stagedFiles.length > 0) ||
    (showUnstagedSection && unstagedFiles.length > 0);
  const hasAnyFiles = stagedFiles.length > 0 || unstagedFiles.length > 0;
  const emptyScopeLabel =
    diffScope === "staged"
      ? "当前范围没有已暂存改动。"
      : diffScope === "unstaged"
        ? "当前范围没有未暂存改动。"
        : "当前审查范围无改动。";

  return (
    <div className="diff-list" onMouseDown={onDiffListClick}>
      {showGitRootPanel && (
        <div className="git-root-panel">
          <div className="git-root-title">为当前工作区选择仓库。</div>
          <div className="git-root-actions">
            <button
              type="button"
              className="ghost git-root-button"
              onClick={onScanGitRoots}
              disabled={!onScanGitRoots || gitRootScanLoading}
            >
              扫描工作区
            </button>
            <label className="git-root-depth">
              <span>深度</span>
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
                {DEPTH_OPTIONS.map((depth) => (
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
                选择文件夹
              </button>
            )}
            {hasGitRoot && onClearGitRoot && (
              <button
                type="button"
                className="ghost git-root-button"
                onClick={onClearGitRoot}
                disabled={gitRootScanLoading}
              >
                使用工作区根目录
              </button>
            )}
          </div>
          {gitRootScanLoading && <div className="diff-empty">正在扫描仓库...</div>}
          {!gitRootScanLoading &&
            !gitRootScanError &&
            gitRootScanHasScanned &&
            gitRootCandidates.length === 0 && <div className="diff-empty">未找到仓库。</div>}
          {gitRootCandidates.length > 0 && (
            <div className="git-root-list">
              {gitRootCandidates.map((path) => {
                const normalizedPath = normalizeRootPath(path);
                const isActive = normalizedGitRoot && normalizedGitRoot === normalizedPath;
                return (
                  <button
                    key={path}
                    type="button"
                    className={`git-root-item ${isActive ? "active" : ""}`}
                    onClick={() => onSelectGitRoot?.(path)}
                  >
                    <span className="git-root-path">{path}</span>
                    {isActive && <span className="git-root-tag">当前</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div className="diff-review-scope" role="group" aria-label="变更文件">
        <span className="diff-review-scope-label">变更文件</span>
        <div className="diff-review-scope-options">
          <button
            type="button"
            className={`diff-review-scope-option${diffScope === "uncommitted" ? " is-active" : ""}`}
            onClick={() => onDiffScopeChange("uncommitted")}
            aria-pressed={diffScope === "uncommitted"}
          >
            Uncommitted
          </button>
          <button
            type="button"
            className={`diff-review-scope-option${diffScope === "staged" ? " is-active" : ""}`}
            onClick={() => onDiffScopeChange("staged")}
            aria-pressed={diffScope === "staged"}
          >
            Staged
          </button>
          <button
            type="button"
            className={`diff-review-scope-option${diffScope === "unstaged" ? " is-active" : ""}`}
            onClick={() => onDiffScopeChange("unstaged")}
            aria-pressed={diffScope === "unstaged"}
          >
            Unstaged
          </button>
        </div>
      </div>
      {showGenerateCommitMessage && (
        <div className="commit-message-section">
          <div className="commit-message-input-wrapper">
            <textarea
              className="commit-message-input"
              placeholder="提交信息..."
              value={commitMessage}
              onChange={(event) => onCommitMessageChange?.(event.target.value)}
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
                  ? "根据已暂存更改生成提交信息"
                  : "根据未暂存更改生成提交信息"
              }
              aria-label="生成提交信息"
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
          <CommitButton
            commitMessage={commitMessage}
            hasStagedFiles={stagedFiles.length > 0}
            hasUnstagedFiles={unstagedFiles.length > 0}
            commitLoading={commitLoading}
            onCommit={onCommit}
          />
        </div>
      )}
      {(commitsAhead > 0 || commitsBehind > 0) && !stagedFiles.length && (
        <div className="push-section">
          <div className="push-sync-buttons">
            {commitsBehind > 0 && (
              <button
                type="button"
                className="push-button-secondary"
                onClick={() => void onPull?.()}
                disabled={!onPull || pullLoading || syncLoading}
                title={`Pull ${commitsBehind} commit${commitsBehind > 1 ? "s" : ""}`}
              >
                {pullLoading ? (
                  <span className="commit-button-spinner" aria-hidden />
                ) : (
                  <Download size={14} aria-hidden />
                )}
                <span>{pullLoading ? "拉取中..." : "拉取"}</span>
                <span className="push-count">{commitsBehind}</span>
              </button>
            )}
            {commitsAhead > 0 && (
              <button
                type="button"
                className="push-button"
                onClick={() => void onPush?.()}
                disabled={!onPush || pushLoading || commitsBehind > 0}
                title={
                  commitsBehind > 0
                    ? "远端领先。请先拉取，或使用同步。"
                    : `推送 ${commitsAhead} 个提交`
                }
              >
                {pushLoading ? (
                  <span className="commit-button-spinner" aria-hidden />
                ) : (
                  <Upload size={14} aria-hidden />
                )}
                <span>推送</span>
                <span className="push-count">{commitsAhead}</span>
              </button>
            )}
          </div>
          {commitsAhead > 0 && commitsBehind > 0 && (
            <button
              type="button"
              className="push-button-secondary"
              onClick={() => void onSync?.()}
              disabled={!onSync || syncLoading || pullLoading}
              title="拉取最新更改并推送本地提交"
            >
              {syncLoading ? (
                <span className="commit-button-spinner" aria-hidden />
              ) : (
                <RotateCcw size={14} aria-hidden />
              )}
              <span>{syncLoading ? "同步中..." : "同步（先拉取再推送）"}</span>
            </button>
          )}
        </div>
      )}
      {!error &&
        !hasScopeFiles &&
        commitsAhead === 0 &&
        commitsBehind === 0 && (
          <div className="diff-empty">{hasAnyFiles ? emptyScopeLabel : "未检测到更改。"}</div>
        )}
      {(stagedFiles.length > 0 || unstagedFiles.length > 0) && (
        <>
          {showStagedSection && stagedFiles.length > 0 && (
            <DiffSection
              title="已暂存"
              files={stagedFiles}
              section="staged"
              selectedFiles={selectedFiles}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              onUnstageFile={onUnstageFile}
              onDiscardFile={onDiscardFile}
              onDiscardFiles={onDiscardFiles}
              onFileClick={onFileClick}
              onShowFileMenu={onShowFileMenu}
            />
          )}
          {showUnstagedSection && unstagedFiles.length > 0 && (
            <DiffSection
              title="未暂存"
              files={unstagedFiles}
              section="unstaged"
              selectedFiles={selectedFiles}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              onStageAllChanges={onStageAllChanges}
              onStageFile={onStageFile}
              onDiscardFile={onDiscardFile}
              onDiscardFiles={onDiscardFiles}
              onFileClick={onFileClick}
              onShowFileMenu={onShowFileMenu}
            />
          )}
        </>
      )}
    </div>
  );
}

type GitLogModeContentProps = {
  logError: string | null | undefined;
  logLoading: boolean;
  logEntries: GitLogEntry[];
  showAheadSection: boolean;
  showBehindSection: boolean;
  logAheadEntries: GitLogEntry[];
  logBehindEntries: GitLogEntry[];
  selectedCommitSha: string | null;
  onSelectCommit?: (entry: GitLogEntry) => void;
  onShowLogMenu: (event: ReactMouseEvent<HTMLElement>, entry: GitLogEntry) => void;
};

export function GitLogModeContent({
  logError,
  logLoading,
  logEntries,
  showAheadSection,
  showBehindSection,
  logAheadEntries,
  logBehindEntries,
  selectedCommitSha,
  onSelectCommit,
  onShowLogMenu,
}: GitLogModeContentProps) {
  return (
    <div className="git-log-list">
      {!logError && logLoading && <div className="diff-viewer-loading">正在加载提交...</div>}
      {!logError &&
        !logLoading &&
        !logEntries.length &&
        !showAheadSection &&
        !showBehindSection && <div className="diff-empty">暂无提交。</div>}
      {showAheadSection && (
        <div className="git-log-section">
          <div className="git-log-section-title">待推送</div>
          <div className="git-log-section-list">
            {logAheadEntries.map((entry) => {
              const isSelected = selectedCommitSha === entry.sha;
              return (
                <GitLogEntryRow
                  key={entry.sha}
                  entry={entry}
                  isSelected={isSelected}
                  compact
                  onSelect={onSelectCommit}
                  onContextMenu={(event) => onShowLogMenu(event, entry)}
                />
              );
            })}
          </div>
        </div>
      )}
      {showBehindSection && (
        <div className="git-log-section">
          <div className="git-log-section-title">待拉取</div>
          <div className="git-log-section-list">
            {logBehindEntries.map((entry) => {
              const isSelected = selectedCommitSha === entry.sha;
              return (
                <GitLogEntryRow
                  key={entry.sha}
                  entry={entry}
                  isSelected={isSelected}
                  compact
                  onSelect={onSelectCommit}
                  onContextMenu={(event) => onShowLogMenu(event, entry)}
                />
              );
            })}
          </div>
        </div>
      )}
      {(logEntries.length > 0 || logLoading) && (
        <div className="git-log-section">
          <div className="git-log-section-title">最近提交</div>
          <div className="git-log-section-list">
            {logEntries.map((entry) => {
              const isSelected = selectedCommitSha === entry.sha;
              return (
                <GitLogEntryRow
                  key={entry.sha}
                  entry={entry}
                  isSelected={isSelected}
                  onSelect={onSelectCommit}
                  onContextMenu={(event) => onShowLogMenu(event, entry)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type GitIssuesModeContentProps = {
  issuesError: string | null | undefined;
  issuesLoading: boolean;
  issues: GitHubIssue[];
};

export function GitIssuesModeContent({
  issuesError,
  issuesLoading,
  issues,
}: GitIssuesModeContentProps) {
  return (
    <div className="git-issues-list">
      {!issuesError && !issuesLoading && !issues.length && (
        <div className="diff-empty">暂无未关闭 Issue。</div>
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
                {issue.title} <span className="git-issue-date">· {relativeTime}</span>
              </span>
            </div>
          </a>
        );
      })}
    </div>
  );
}

type GitPullRequestsModeContentProps = {
  pullRequestsError: string | null | undefined;
  pullRequestsLoading: boolean;
  pullRequests: GitHubPullRequest[];
  selectedPullRequest: number | null;
  onSelectPullRequest?: (pullRequest: GitHubPullRequest) => void;
  onShowPullRequestMenu: (
    event: ReactMouseEvent<HTMLElement>,
    pullRequest: GitHubPullRequest,
  ) => void;
};

export function GitPullRequestsModeContent({
  pullRequestsError,
  pullRequestsLoading,
  pullRequests,
  selectedPullRequest,
  onSelectPullRequest,
  onShowPullRequestMenu,
}: GitPullRequestsModeContentProps) {
  return (
    <div className="git-pr-list">
      {!pullRequestsError && !pullRequestsLoading && !pullRequests.length && (
        <div className="diff-empty">暂无未关闭 PR。</div>
      )}
      {pullRequests.map((pullRequest) => {
        const relativeTime = formatRelativeTime(new Date(pullRequest.updatedAt).getTime());
        const author = pullRequest.author?.login ?? "未知";
        const isSelected = selectedPullRequest === pullRequest.number;

        return (
          <button
            type="button"
            key={pullRequest.number}
            className={`git-pr-entry ${isSelected ? "active" : ""}`}
            onClick={() => onSelectPullRequest?.(pullRequest)}
            onContextMenu={(event) => onShowPullRequestMenu(event, pullRequest)}
          >
            <span className="git-pr-header">
              <span className="git-pr-title">
                <span className="git-pr-number">#{pullRequest.number}</span>
                <span className="git-pr-title-text">
                  {pullRequest.title} <span className="git-pr-author-inline">@{author}</span>
                </span>
              </span>
              <span className="git-pr-time">{relativeTime}</span>
            </span>
            <span className="git-pr-meta">
              {pullRequest.isDraft && <span className="git-pr-pill git-pr-draft">草稿</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
