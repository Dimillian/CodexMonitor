import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceInfo } from "../../../types";
import { listGitRoots } from "../../../services/tauri";

type GitRepoScanState = {
  repos: string[];
  isLoading: boolean;
  error: string | null;
  depth: number;
  hasScanned: boolean;
};

const DEFAULT_DEPTH = 2;

export function useGitRepoScan(activeWorkspace: WorkspaceInfo | null) {
  const [state, setState] = useState<GitRepoScanState>({
    repos: [],
    isLoading: false,
    error: null,
    depth: DEFAULT_DEPTH,
    hasScanned: false,
  });
  const requestIdRef = useRef(0);
  const workspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);

  const scan = useCallback(async () => {
    if (!activeWorkspace) {
      setState((prev) => ({ ...prev, repos: [], isLoading: false }));
      return;
    }
    const workspaceId = activeWorkspace.id;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      hasScanned: true,
    }));
    try {
      const repos = await listGitRoots(workspaceId, state.depth);
      if (
        requestIdRef.current !== requestId ||
        workspaceIdRef.current !== workspaceId
      ) {
        return;
      }
      setState((prev) => ({
        ...prev,
        repos,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      if (
        requestIdRef.current !== requestId ||
        workspaceIdRef.current !== workspaceId
      ) {
        return;
      }
      setState((prev) => ({
        ...prev,
        repos: [],
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [activeWorkspace, state.depth]);

  const setDepth = useCallback((depth: number) => {
    const clamped = Math.min(6, Math.max(1, depth));
    setState((prev) => ({ ...prev, depth: clamped }));
  }, []);

  const clear = useCallback(() => {
    setState((prev) => ({
      ...prev,
      repos: [],
      error: null,
      hasScanned: false,
    }));
  }, []);

  useEffect(() => {
    const workspaceId = activeWorkspace?.id ?? null;
    if (workspaceIdRef.current !== workspaceId) {
      workspaceIdRef.current = workspaceId;
      requestIdRef.current += 1;
      setState({
        repos: [],
        isLoading: false,
        error: null,
        depth: DEFAULT_DEPTH,
        hasScanned: false,
      });
    }
  }, [activeWorkspace?.id]);

  return {
    repos: state.repos,
    isLoading: state.isLoading,
    error: state.error,
    depth: state.depth,
    hasScanned: state.hasScanned,
    scan,
    setDepth,
    clear,
  };
}
