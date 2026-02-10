import { useEffect } from "react";
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
  useEffect(() => {
    if (backendMode !== "remote") {
      return;
    }

    const refreshActiveThread = () => {
      if (!activeWorkspace?.connected || !activeThreadId) {
        return;
      }
      void refreshThread(activeWorkspace.id, activeThreadId);
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
    };
  }, [activeThreadId, activeWorkspace, backendMode, refreshThread]);
}
