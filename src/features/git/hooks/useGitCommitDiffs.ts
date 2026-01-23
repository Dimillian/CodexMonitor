import { useCallback, useEffect, useRef, useState } from "react";
import type { GitCommitDiff, WorkspaceInfo } from "../../../types";
import { getGitCommitDiff } from "../../../services/tauri";

type CommitDiffState = {
  diffs: GitCommitDiff[];
  isLoading: boolean;
  error: string | null;
};

const emptyState: CommitDiffState = {
  diffs: [],
  isLoading: false,
  error: null,
};

export function useGitCommitDiffs(
  activeWorkspace: WorkspaceInfo | null,
  sha: string | null,
  enabled: boolean,
) {
  const [state, setState] = useState<CommitDiffState>(emptyState);
  const requestIdRef = useRef(0);
  const workspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);
  const shaRef = useRef<string | null>(sha ?? null);

  const refresh = useCallback(async () => {
    if (!activeWorkspace || !sha) {
      setState(emptyState);
      return;
    }
    const workspaceId = activeWorkspace.id;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const diffs = await getGitCommitDiff(workspaceId, sha);
      if (
        requestIdRef.current !== requestId ||
        workspaceIdRef.current !== workspaceId ||
        shaRef.current !== sha
      ) {
        return;
      }
      setState({ diffs, isLoading: false, error: null });
    } catch (error) {
      console.error("Failed to load git commit diff", error);
      if (
        requestIdRef.current !== requestId ||
        workspaceIdRef.current !== workspaceId ||
        shaRef.current !== sha
      ) {
        return;
      }
      setState({
        diffs: [],
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [activeWorkspace, sha]);

  useEffect(() => {
    const workspaceId = activeWorkspace?.id ?? null;
    if (workspaceIdRef.current !== workspaceId) {
      workspaceIdRef.current = workspaceId;
      requestIdRef.current += 1;
      setState(emptyState);
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (shaRef.current !== sha) {
      shaRef.current = sha ?? null;
      requestIdRef.current += 1;
      setState(emptyState);
    }
  }, [sha]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  return {
    diffs: state.diffs,
    isLoading: state.isLoading,
    error: state.error,
    refresh,
  };
}
