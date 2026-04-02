import type { GitHubIssue, GitHubPullRequest, GitLogEntry } from "../../../types";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import { formatRelativeTime } from "../../../utils/time";
import type { PerFileDiffGroup } from "../utils/perFileThreadDiffs";
import { GitLogEntryRow } from "./GitDiffPanelShared";
import { splitPath } from "./GitDiffPanel.utils";

type GitPerFileModeContentProps = {
  groups: PerFileDiffGroup[];
  selectedPath: string | null;
  onSelectFile?: (path: string) => void;
};

export function GitPerFileModeContent({
  groups,
  selectedPath,
  onSelectFile,
}: GitPerFileModeContentProps) {
  const { t } = useTranslation();
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsedPaths((previous) => {
      if (previous.size === 0) {
        return previous;
      }

      const activePaths = new Set(groups.map((group) => group.path));
      let changed = false;
      const next = new Set<string>();

      for (const path of previous) {
        if (activePaths.has(path)) {
          next.add(path);
        } else {
          changed = true;
        }
      }

      if (!changed && next.size === previous.size) {
        return previous;
      }

      return next;
    });
  }, [groups]);

  const toggleGroup = useCallback((path: string) => {
    setCollapsedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  if (groups.length === 0) {
    return <div className="diff-empty">{t("gitPanel.noAgentEditsYet")}</div>;
  }

  return (
    <div className="per-file-tree">
      {groups.map((group) => {
        const isExpanded = !collapsedPaths.has(group.path);
        const { name: fileName } = splitPath(group.path);
        return (
          <div key={group.path} className="per-file-group">
            <button
              type="button"
              className="per-file-group-row"
              onClick={() => toggleGroup(group.path)}
            >
              <span className="per-file-group-chevron" aria-hidden>
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              <span className="per-file-group-path" title={group.path}>
                {fileName || group.path}
              </span>
              <span className="per-file-group-count">
                {group.edits.length === 1
                  ? t("gitPanel.oneEdit")
                  : t("gitPanel.editCount", { count: group.edits.length })}
              </span>
            </button>
            {isExpanded && (
              <div className="per-file-edit-list">
                {group.edits.map((edit) => {
                  const isActive = selectedPath === edit.id;
                  return (
                    <button
                      key={edit.id}
                      type="button"
                      className={`per-file-edit-row ${isActive ? "active" : ""}`}
                      onClick={() => onSelectFile?.(edit.id)}
                    >
                      <span className="per-file-edit-status" data-status={edit.status}>
                        {edit.status}
                      </span>
                      <span className="per-file-edit-label">{edit.label}</span>
                      <span className="per-file-edit-stats">
                        {edit.additions > 0 && (
                          <span className="per-file-edit-stat per-file-edit-stat-add">+{edit.additions}</span>
                        )}
                        {edit.deletions > 0 && (
                          <span className="per-file-edit-stat per-file-edit-stat-del">-{edit.deletions}</span>
                        )}
                        {edit.additions === 0 && edit.deletions === 0 && (
                          <span className="per-file-edit-stat">0</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
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
  onShowLogMenu: (event: ReactMouseEvent<HTMLDivElement>, entry: GitLogEntry) => void;
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
  const { t } = useTranslation();

  return (
    <div className="git-log-list">
      {!logError && logLoading && <div className="diff-viewer-loading">{t("gitPanel.loadingCommits")}</div>}
      {!logError && !logLoading && !logEntries.length && !showAheadSection && !showBehindSection && (
        <div className="diff-empty">{t("gitPanel.noCommitsYet")}</div>
      )}
      {showAheadSection && (
        <div className="git-log-section">
          <div className="git-log-section-title">{t("gitPanel.toPush")}</div>
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
          <div className="git-log-section-title">{t("gitPanel.toPull")}</div>
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
          <div className="git-log-section-title">{t("gitPanel.recentCommits")}</div>
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
  const { t } = useTranslation();

  return (
    <div className="git-issues-list">
      {!issuesError && !issuesLoading && !issues.length && (
        <div className="diff-empty">{t("gitPanel.noOpenIssues")}</div>
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
              <span className="git-issue-number">#{issue.number}</span>
              <span className="git-issue-title">{issue.title}</span>
              <span className="git-issue-date">{relativeTime}</span>
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
    event: ReactMouseEvent<HTMLDivElement>,
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
  const { t } = useTranslation();

  return (
    <div className="git-pr-list">
      {!pullRequestsError && !pullRequestsLoading && !pullRequests.length && (
        <div className="diff-empty">{t("gitPanel.noOpenPullRequests")}</div>
      )}
      {pullRequests.map((pullRequest) => {
        const relativeTime = formatRelativeTime(new Date(pullRequest.updatedAt).getTime());
        const author = pullRequest.author?.login ?? "unknown";
        const isSelected = selectedPullRequest === pullRequest.number;

        return (
          <div
            key={pullRequest.number}
            className={`git-pr-entry ${isSelected ? "active" : ""}`}
            onClick={() => onSelectPullRequest?.(pullRequest)}
            onContextMenu={(event) => onShowPullRequestMenu(event, pullRequest)}
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
                <span className="git-pr-title-text">{pullRequest.title}</span>
              </span>
              <span className="git-pr-time">{relativeTime}</span>
            </div>
            <div className="git-pr-meta">
              <span className="git-pr-author-inline">@{author}</span>
              {pullRequest.isDraft && <span className="git-pr-pill git-pr-draft">{t("gitPanel.draft")}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
