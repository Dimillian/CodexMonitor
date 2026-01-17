import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubPullRequest, WorkspaceInfo } from "../../../types";
import { getGitHubPullRequests } from "../../../services/tauri";

type GitHubPullRequestsState = {
  pullRequests: GitHubPullRequest[];
  total: number;
  isLoading: boolean;
  error: string | null;
};

const emptyState: GitHubPullRequestsState = {
  pullRequests: [],
  total: 0,
  isLoading: false,
  error: null,
};

export function useGitHubPullRequests(
  activeWorkspace: WorkspaceInfo | null,
  enabled: boolean,
) {
  const [state, setState] = useState<GitHubPullRequestsState>(emptyState);
  const requestIdRef = useRef(0);
  const workspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);

  const refresh = useCallback(async () => {
    if (!activeWorkspace) {
      setState(emptyState);
      return;
    }
    const workspaceId = activeWorkspace.id;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await getGitHubPullRequests(workspaceId);
      if (
        requestIdRef.current !== requestId ||
        workspaceIdRef.current !== workspaceId
      ) {
        return;
      }
      setState({
        pullRequests: response.pullRequests,
        total: response.total,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error("Failed to load GitHub pull requests", error);
      if (
        requestIdRef.current !== requestId ||
        workspaceIdRef.current !== workspaceId
      ) {
        return;
      }
      setState({
        pullRequests: [],
        total: 0,
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [activeWorkspace]);

  useEffect(() => {
    const workspaceId = activeWorkspace?.id ?? null;
    if (workspaceIdRef.current !== workspaceId) {
      workspaceIdRef.current = workspaceId;
      requestIdRef.current += 1;
      setState(emptyState);
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  return {
    pullRequests: state.pullRequests,
    total: state.total,
    isLoading: state.isLoading,
    error: state.error,
    refresh,
  };
}
