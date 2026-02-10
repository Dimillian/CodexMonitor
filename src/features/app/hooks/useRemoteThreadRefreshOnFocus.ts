import { useEffect, useRef } from "react";
import type { WorkspaceInfo } from "../../../types";

type UseRemoteThreadRefreshOnFocusOptions = {
  backendMode: string;
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  refreshThread: (workspaceId: string, threadId: string) => Promise<unknown> | unknown;
};

export function useRemoteThreadRefreshOnFocus({
  backendMode,
  activeWorkspace,
  activeThreadId,
  refreshThread,
}: UseRemoteThreadRefreshOnFocusOptions) {
  const optionsRef = useRef({ backendMode, activeWorkspace, activeThreadId, refreshThread });
  useEffect(() => {
    optionsRef.current = { backendMode, activeWorkspace, activeThreadId, refreshThread };
  });

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshActiveThread = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        const { backendMode: mode, activeWorkspace: ws, activeThreadId: threadId, refreshThread: refresh } = optionsRef.current;
        if (mode !== "remote") {
          return;
        }
        if (!ws?.connected || !threadId) {
          return;
        }
        void refresh(ws.id, threadId);
      }, 500);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshActiveThread();
      }
    };

    window.addEventListener("focus", refreshActiveThread);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshActiveThread);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, []);
}
