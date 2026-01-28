import { useEffect } from "react";
import type { WorkspaceInfo } from "../../../types";

type WorkspaceRefreshOptions = {
  workspaces: WorkspaceInfo[];
  refreshWorkspaces: () => Promise<WorkspaceInfo[] | void>;
  listThreadsForWorkspace: (
    workspace: WorkspaceInfo,
    options?: { preserveState?: boolean },
  ) => Promise<void>;
};

export function useWorkspaceRefreshOnFocus({
  workspaces,
  refreshWorkspaces,
  listThreadsForWorkspace,
}: WorkspaceRefreshOptions) {
  useEffect(() => {
    const handleFocus = () => {
      void (async () => {
        let latestWorkspaces = workspaces;
        try {
          const entries = await refreshWorkspaces();
          if (entries) {
            latestWorkspaces = entries;
          }
        } catch {
          // Silent: refresh errors show in debug panel.
        }
        const connected = latestWorkspaces.filter((entry) => entry.connected);
        await Promise.allSettled(
          connected.map((workspace) =>
            listThreadsForWorkspace(workspace, { preserveState: true }),
          ),
        );
      })();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleFocus();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [listThreadsForWorkspace, refreshWorkspaces, workspaces]);
}
