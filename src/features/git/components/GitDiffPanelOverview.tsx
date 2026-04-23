import type { GitPanelMode } from "../types";
import { useI18n } from "@/i18n";
import ArrowLeftRight from "lucide-react/dist/esm/icons/arrow-left-right";
import RotateCw from "lucide-react/dist/esm/icons/rotate-cw";

type GitMode = GitPanelMode;

type GitPanelModeStatusProps = {
  mode: GitMode;
  diffStatusLabel: string;
  perFileDiffStatusLabel: string;
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
  perFileDiffStatusLabel,
  logCountLabel,
  logSyncLabel,
  logUpstreamLabel,
  issuesLoading,
  issuesTotal,
  pullRequestsLoading,
  pullRequestsTotal,
}: GitPanelModeStatusProps) {
  const { tx } = useI18n();

  if (mode === "diff") {
    return <div className="diff-status">{diffStatusLabel}</div>;
  }

  if (mode === "perFile") {
    return <div className="diff-status">{perFileDiffStatusLabel}</div>;
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
          <span>{tx("GitHub issues")}</span>
          {issuesLoading && <span className="git-panel-spinner" aria-hidden />}
        </div>
        <div className="git-log-sync">
          <span>{tx("{count} open", { count: issuesTotal })}</span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="diff-status diff-status-issues">
        <span>{tx("GitHub pull requests")}</span>
        {pullRequestsLoading && <span className="git-panel-spinner" aria-hidden />}
      </div>
      <div className="git-log-sync">
        <span>{tx("{count} open", { count: pullRequestsTotal })}</span>
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
  const { tx } = useI18n();

  if (mode !== "diff" && mode !== "perFile" && mode !== "log") {
    return null;
  }

  return (
    <div className="diff-branch-row">
      <div className="diff-branch-meta">
        <span className="diff-branch-label">{tx("Branch")}</span>
        <div className="diff-branch">{branchName || tx("unknown")}</div>
      </div>
      <button
        type="button"
        className="diff-branch-refresh"
        onClick={() => void onFetch?.()}
        disabled={!onFetch || fetchLoading}
        title={fetchLoading ? tx("Fetching remote...") : tx("Fetch remote")}
        aria-label={fetchLoading ? tx("Fetching remote") : tx("Fetch remote")}
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
  const { tx } = useI18n();

  if (mode === "issues" || !hasGitRoot) {
    return null;
  }

  return (
    <div className="git-root-current">
      <div className="git-root-current-main">
        <span className="git-root-label">{tx("Repository root")}</span>
        <span className="git-root-path" title={gitRoot ?? ""}>
          {gitRoot}
        </span>
      </div>
      {onScanGitRoots && (
        <button
          type="button"
          className="ghost git-root-button git-root-button--icon"
          onClick={onScanGitRoots}
          disabled={gitRootScanLoading}
        >
          <ArrowLeftRight className="git-root-button-icon" aria-hidden />
          {tx("Change")}
        </button>
      )}
    </div>
  );
}
