import { useCallback, useState } from "react";
import type {
  GitHubIssue,
  GitHubPullRequest,
  GitHubPullRequestComment,
  GitHubPullRequestDiff,
} from "../../../types";

type GitHubIssuesState = {
  issues: GitHubIssue[];
  total: number;
  isLoading: boolean;
  error: string | null;
};

type GitHubPullRequestsState = {
  pullRequests: GitHubPullRequest[];
  total: number;
  isLoading: boolean;
  error: string | null;
};

type GitHubPullRequestDiffsState = {
  diffs: GitHubPullRequestDiff[];
  isLoading: boolean;
  error: string | null;
};

type GitHubPullRequestCommentsState = {
  comments: GitHubPullRequestComment[];
  isLoading: boolean;
  error: string | null;
};

export function useGitHubPanelController() {
  const [gitIssuesState, setGitIssuesState] = useState<GitHubIssuesState>({
    issues: [],
    total: 0,
    isLoading: false,
    error: null,
  });
  const [gitPullRequestsState, setGitPullRequestsState] =
    useState<GitHubPullRequestsState>({
      pullRequests: [],
      total: 0,
      isLoading: false,
      error: null,
    });
  const [gitPullRequestDiffsState, setGitPullRequestDiffsState] =
    useState<GitHubPullRequestDiffsState>({
      diffs: [],
      isLoading: false,
      error: null,
    });
  const [gitPullRequestCommentsState, setGitPullRequestCommentsState] =
    useState<GitHubPullRequestCommentsState>({
      comments: [],
      isLoading: false,
      error: null,
    });

  const handleGitIssuesChange = useCallback((next: GitHubIssuesState) => {
    setGitIssuesState((prev) => {
      if (
        prev.issues === next.issues &&
        prev.total === next.total &&
        prev.isLoading === next.isLoading &&
        prev.error === next.error
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const handleGitPullRequestsChange = useCallback(
    (next: GitHubPullRequestsState) => {
      setGitPullRequestsState((prev) => {
        if (
          prev.pullRequests === next.pullRequests &&
          prev.total === next.total &&
          prev.isLoading === next.isLoading &&
          prev.error === next.error
        ) {
          return prev;
        }
        return next;
      });
    },
    [],
  );

  const handleGitPullRequestDiffsChange = useCallback(
    (next: GitHubPullRequestDiffsState) => {
      setGitPullRequestDiffsState((prev) => {
        if (
          prev.diffs === next.diffs &&
          prev.isLoading === next.isLoading &&
          prev.error === next.error
        ) {
          return prev;
        }
        return next;
      });
    },
    [],
  );

  const handleGitPullRequestCommentsChange = useCallback(
    (next: GitHubPullRequestCommentsState) => {
      setGitPullRequestCommentsState((prev) => {
        if (
          prev.comments === next.comments &&
          prev.isLoading === next.isLoading &&
          prev.error === next.error
        ) {
          return prev;
        }
        return next;
      });
    },
    [],
  );

  const resetGitHubPanelState = useCallback(() => {
    setGitIssuesState({
      issues: [],
      total: 0,
      isLoading: false,
      error: null,
    });
    setGitPullRequestsState({
      pullRequests: [],
      total: 0,
      isLoading: false,
      error: null,
    });
    setGitPullRequestDiffsState({
      diffs: [],
      isLoading: false,
      error: null,
    });
    setGitPullRequestCommentsState({
      comments: [],
      isLoading: false,
      error: null,
    });
  }, []);

  return {
    gitIssues: gitIssuesState.issues,
    gitIssuesTotal: gitIssuesState.total,
    gitIssuesLoading: gitIssuesState.isLoading,
    gitIssuesError: gitIssuesState.error,
    gitPullRequests: gitPullRequestsState.pullRequests,
    gitPullRequestsTotal: gitPullRequestsState.total,
    gitPullRequestsLoading: gitPullRequestsState.isLoading,
    gitPullRequestsError: gitPullRequestsState.error,
    gitPullRequestDiffs: gitPullRequestDiffsState.diffs,
    gitPullRequestDiffsLoading: gitPullRequestDiffsState.isLoading,
    gitPullRequestDiffsError: gitPullRequestDiffsState.error,
    gitPullRequestComments: gitPullRequestCommentsState.comments,
    gitPullRequestCommentsLoading: gitPullRequestCommentsState.isLoading,
    gitPullRequestCommentsError: gitPullRequestCommentsState.error,
    handleGitIssuesChange,
    handleGitPullRequestsChange,
    handleGitPullRequestDiffsChange,
    handleGitPullRequestCommentsChange,
    resetGitHubPanelState,
  };
}
