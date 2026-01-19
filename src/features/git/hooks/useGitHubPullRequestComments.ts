import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubPullRequestComment, WorkspaceInfo } from "../../../types";
import { getGitHubPullRequestComments } from "../../../services/tauri";

type PullRequestCommentsState = {
  comments: GitHubPullRequestComment[];
  isLoading: boolean;
  error: string | null;
};

const emptyState: PullRequestCommentsState = {
  comments: [],
  isLoading: false,
  error: null,
};

export function useGitHubPullRequestComments(
  activeWorkspace: WorkspaceInfo | null,
  prNumber: number | null,
  enabled: boolean,
) {
  const [state, setState] = useState<PullRequestCommentsState>(emptyState);
  const requestIdRef = useRef(0);
  const workspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);
  const prNumberRef = useRef<number | null>(prNumber ?? null);

  const refresh = useCallback(async () => {
    if (!activeWorkspace || !prNumber) {
      setState(emptyState);
      return;
    }
    const workspaceId = activeWorkspace.id;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const comments = await getGitHubPullRequestComments(
        workspaceId,
        prNumber,
      );
      if (
        requestIdRef.current !== requestId ||
        workspaceIdRef.current !== workspaceId ||
        prNumberRef.current !== prNumber
      ) {
        return;
      }
      setState({ comments, isLoading: false, error: null });
    } catch (error) {
      console.error("Failed to load GitHub pull request comments", error);
      if (
        requestIdRef.current !== requestId ||
        workspaceIdRef.current !== workspaceId ||
        prNumberRef.current !== prNumber
      ) {
        return;
      }
      setState({
        comments: [],
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [activeWorkspace, prNumber]);

  useEffect(() => {
    const workspaceId = activeWorkspace?.id ?? null;
    if (workspaceIdRef.current !== workspaceId) {
      workspaceIdRef.current = workspaceId;
      requestIdRef.current += 1;
      setState(emptyState);
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (prNumberRef.current !== prNumber) {
      prNumberRef.current = prNumber ?? null;
      requestIdRef.current += 1;
      setState(emptyState);
    }
  }, [prNumber]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  return {
    comments: state.comments,
    isLoading: state.isLoading,
    error: state.error,
    refresh,
  };
}
