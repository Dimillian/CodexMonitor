import { useEffect, useRef } from "react";
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
  const optionsRef = useRef({ workspaces, refreshWorkspaces, listThreadsForWorkspace });
  useEffect(() => {
    optionsRef.current = { workspaces, refreshWorkspaces, listThreadsForWorkspace };
  });

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleFocus = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        const { workspaces: ws, refreshWorkspaces: refresh, listThreadsForWorkspace: listThreads } = optionsRef.current;
        void (async () => {
          let latestWorkspaces = ws;
          try {
            const entries = await refresh();
            if (entries) {
              latestWorkspaces = entries;
            }
          } catch {
            // Silent: refresh errors show in debug panel.
          }
          const connected = latestWorkspaces.filter((entry) => entry.connected);
          await Promise.allSettled(
            connected.map((workspace) =>
              listThreads(workspace, { preserveState: true }),
            ),
          );
        })();
      }, 500);
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
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, []);
}
