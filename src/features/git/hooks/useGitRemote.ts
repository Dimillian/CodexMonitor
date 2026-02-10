import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceInfo } from "../../../types";
import { getGitRemote } from "../../../services/tauri";

type GitRemoteState = {
  remote: string | null;
  error: string | null;
};

const emptyState: GitRemoteState = {
  remote: null,
  error: null,
};

export function useGitRemote(activeWorkspace: WorkspaceInfo | null) {
  const [state, setState] = useState<GitRemoteState>(emptyState);
  const requestIdRef = useRef(0);
  const workspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);
  const workspaceId = activeWorkspace?.id ?? null;

  const refresh = useCallback(() => {
    if (!workspaceId) {
      setState(emptyState);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    return getGitRemote(workspaceId)
      .then((remote) => {
        if (
          requestIdRef.current !== requestId ||
          workspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        setState({ remote, error: null });
      })
      .catch((error) => {
        if (
          requestIdRef.current !== requestId ||
          workspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        setState({
          remote: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceIdRef.current !== workspaceId) {
      workspaceIdRef.current = workspaceId;
      requestIdRef.current += 1;
      setState(emptyState);
    }

    if (!workspaceId) {
      setState(emptyState);
      return;
    }

    refresh()?.catch(() => {});
  }, [refresh, workspaceId]);

  return { ...state, refresh };
}
