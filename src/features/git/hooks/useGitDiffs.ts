import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitFileDiff, GitFileStatus, WorkspaceInfo } from "../../../types";
import { getGitDiffs } from "../../../services/tauri";

type GitDiffState = {
  diffs: GitFileDiff[];
  isLoading: boolean;
  error: string | null;
};

const emptyState: GitDiffState = {
  diffs: [],
  isLoading: false,
  error: null,
};

export function useGitDiffs(
  activeWorkspace: WorkspaceInfo | null,
  files: GitFileStatus[],
  enabled: boolean,
) {
  const [state, setState] = useState<GitDiffState>(emptyState);
  const requestIdRef = useRef(0);
  const workspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);
  const cachedDiffsRef = useRef<Map<string, GitFileDiff[]>>(new Map());

  const fileKey = useMemo(
    () =>
      files
        .map(
          (file) =>
            `${file.path}:${file.status}:${file.additions}:${file.deletions}`,
        )
        .sort()
        .join("|"),
    [files],
  );

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
      const diffs = await getGitDiffs(workspaceId);
      if (
        requestIdRef.current !== requestId ||
        workspaceIdRef.current !== workspaceId
      ) {
        return;
      }
      setState({ diffs, isLoading: false, error: null });
      cachedDiffsRef.current.set(workspaceId, diffs);
    } catch (error) {
      console.error("Failed to load git diffs", error);
      if (
        requestIdRef.current !== requestId ||
        workspaceIdRef.current !== workspaceId
      ) {
        return;
      }
      setState({
        diffs: [],
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
      if (!workspaceId) {
        setState(emptyState);
        return;
      }
      const cached = cachedDiffsRef.current.get(workspaceId);
      setState({
        diffs: cached ?? [],
        isLoading: false,
        error: null,
      });
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refresh();
  }, [enabled, fileKey, refresh]);

  const orderedDiffs = useMemo(() => {
    const diffByPath = new Map(
      state.diffs.map((entry) => [entry.path, entry]),
    );
    return files.map((file) => {
      const entry = diffByPath.get(file.path);
      return {
        path: file.path,
        status: file.status,
        diff: entry?.diff ?? "",
        isImage: entry?.isImage,
        oldImageData: entry?.oldImageData,
        newImageData: entry?.newImageData,
        oldImageMime: entry?.oldImageMime,
        newImageMime: entry?.newImageMime,
      };
    });
  }, [files, state.diffs]);

  return {
    diffs: orderedDiffs,
    isLoading: state.isLoading,
    error: state.error,
    refresh,
  };
}
