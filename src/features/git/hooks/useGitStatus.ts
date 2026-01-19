import { useCallback, useEffect, useRef, useState } from "react";
import type { GitFileStatus, WorkspaceInfo } from "../../../types";
import { getGitStatus } from "../../../services/tauri";

type GitStatusState = {
  branchName: string;
  files: GitFileStatus[];
  stagedFiles: GitFileStatus[];
  unstagedFiles: GitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
  error: string | null;
};

const emptyStatus: GitStatusState = {
  branchName: "",
  files: [],
  stagedFiles: [],
  unstagedFiles: [],
  totalAdditions: 0,
  totalDeletions: 0,
  error: null,
};

const REFRESH_INTERVAL_MS = 3000;

export function useGitStatus(activeWorkspace: WorkspaceInfo | null) {
  const [status, setStatus] = useState<GitStatusState>(emptyStatus);
  const requestIdRef = useRef(0);
  const workspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);
  const cachedStatusRef = useRef<Map<string, GitStatusState>>(new Map());
  const workspaceId = activeWorkspace?.id ?? null;

  const refresh = useCallback(() => {
    if (!workspaceId) {
      setStatus(emptyStatus);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    return getGitStatus(workspaceId)
      .then((data) => {
        if (
          requestIdRef.current !== requestId ||
          workspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        const nextStatus = { ...data, error: null };
        setStatus(nextStatus);
        cachedStatusRef.current.set(workspaceId, nextStatus);
      })
      .catch((err) => {
        console.error("Failed to load git status", err);
        if (
          requestIdRef.current !== requestId ||
          workspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        const nextStatus = {
          ...emptyStatus,
          branchName: "unknown",
          error: err instanceof Error ? err.message : String(err),
        };
        setStatus(nextStatus);
        cachedStatusRef.current.set(workspaceId, nextStatus);
      });
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceIdRef.current !== workspaceId) {
      workspaceIdRef.current = workspaceId;
      requestIdRef.current += 1;
      if (!workspaceId) {
        setStatus(emptyStatus);
        return;
      }
      const cached = cachedStatusRef.current.get(workspaceId);
      setStatus(cached ?? emptyStatus);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      setStatus(emptyStatus);
      return;
    }

    const fetchStatus = () => {
      refresh()?.catch(() => {});
    };

    fetchStatus();
    const interval = window.setInterval(fetchStatus, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [refresh, workspaceId]);

  return { status, refresh };
}
