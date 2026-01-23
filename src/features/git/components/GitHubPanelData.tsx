import { useEffect } from "react";
import type {
  GitHubIssue,
  GitHubPullRequest,
  GitHubPullRequestComment,
  GitHubPullRequestDiff,
  WorkspaceInfo,
} from "../../../types";
import { useGitHubIssues } from "../hooks/useGitHubIssues";
import { useGitHubPullRequests } from "../hooks/useGitHubPullRequests";
import { useGitHubPullRequestDiffs } from "../hooks/useGitHubPullRequestDiffs";
import { useGitHubPullRequestComments } from "../hooks/useGitHubPullRequestComments";

type IssuesState = {
  issues: GitHubIssue[];
  total: number;
  isLoading: boolean;
  error: string | null;
};

type PullRequestsState = {
  pullRequests: GitHubPullRequest[];
  total: number;
  isLoading: boolean;
  error: string | null;
};

type PullRequestDiffsState = {
  diffs: GitHubPullRequestDiff[];
  isLoading: boolean;
  error: string | null;
};

type PullRequestCommentsState = {
  comments: GitHubPullRequestComment[];
  isLoading: boolean;
  error: string | null;
};

type GitHubPanelDataProps = {
  activeWorkspace: WorkspaceInfo | null;
  gitPanelMode: "diff" | "log" | "issues" | "prs";
  shouldLoadDiffs: boolean;
  diffSource: "local" | "pr" | "commit";
  selectedPullRequestNumber: number | null;
  onIssuesChange: (state: IssuesState) => void;
  onPullRequestsChange: (state: PullRequestsState) => void;
  onPullRequestDiffsChange: (state: PullRequestDiffsState) => void;
  onPullRequestCommentsChange: (state: PullRequestCommentsState) => void;
};

export function GitHubPanelData({
  activeWorkspace,
  gitPanelMode,
  shouldLoadDiffs,
  diffSource,
  selectedPullRequestNumber,
  onIssuesChange,
  onPullRequestsChange,
  onPullRequestDiffsChange,
  onPullRequestCommentsChange,
}: GitHubPanelDataProps) {
  const issuesEnabled = gitPanelMode === "issues";
  const pullRequestsEnabled = gitPanelMode === "prs" && Boolean(activeWorkspace);
  const pullRequestDiffsEnabled =
    shouldLoadDiffs && diffSource === "pr" && Boolean(activeWorkspace);
  const pullRequestCommentsEnabled = pullRequestDiffsEnabled;

  const {
    issues,
    total: issuesTotal,
    isLoading: issuesLoading,
    error: issuesError,
  } = useGitHubIssues(activeWorkspace, issuesEnabled);

  const {
    pullRequests,
    total: pullRequestsTotal,
    isLoading: pullRequestsLoading,
    error: pullRequestsError,
  } = useGitHubPullRequests(activeWorkspace, pullRequestsEnabled);

  const {
    diffs: pullRequestDiffs,
    isLoading: pullRequestDiffsLoading,
    error: pullRequestDiffsError,
  } = useGitHubPullRequestDiffs(
    activeWorkspace,
    selectedPullRequestNumber ?? null,
    pullRequestDiffsEnabled,
  );

  const {
    comments: pullRequestComments,
    isLoading: pullRequestCommentsLoading,
    error: pullRequestCommentsError,
  } = useGitHubPullRequestComments(
    activeWorkspace,
    selectedPullRequestNumber ?? null,
    pullRequestCommentsEnabled,
  );

  useEffect(() => {
    onIssuesChange({
      issues,
      total: issuesTotal,
      isLoading: issuesLoading,
      error: issuesError,
    });
  }, [issues, issuesError, issuesLoading, issuesTotal, onIssuesChange]);

  useEffect(() => {
    onPullRequestsChange({
      pullRequests,
      total: pullRequestsTotal,
      isLoading: pullRequestsLoading,
      error: pullRequestsError,
    });
  }, [
    onPullRequestsChange,
    pullRequests,
    pullRequestsError,
    pullRequestsLoading,
    pullRequestsTotal,
  ]);

  useEffect(() => {
    onPullRequestDiffsChange({
      diffs: pullRequestDiffs,
      isLoading: pullRequestDiffsLoading,
      error: pullRequestDiffsError,
    });
  }, [
    onPullRequestDiffsChange,
    pullRequestDiffs,
    pullRequestDiffsError,
    pullRequestDiffsLoading,
  ]);

  useEffect(() => {
    onPullRequestCommentsChange({
      comments: pullRequestComments,
      isLoading: pullRequestCommentsLoading,
      error: pullRequestCommentsError,
    });
  }, [
    onPullRequestCommentsChange,
    pullRequestComments,
    pullRequestCommentsError,
    pullRequestCommentsLoading,
  ]);

  return null;
}
