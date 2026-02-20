import { useEffect, useRef } from "react";
import type { WorkspaceInfo } from "../../../types";

export const REMOTE_WORKSPACE_REFRESH_INTERVAL_MS = 15_000;

type WorkspaceRefreshOptions = {
  workspaces: WorkspaceInfo[];
  refreshWorkspaces: () => Promise<WorkspaceInfo[] | void>;
  listThreadsForWorkspace: (
    workspace: WorkspaceInfo,
    options?: { preserveState?: boolean },
  ) => Promise<void>;
  backendMode?: string;
  pollIntervalMs?: number;
};

export function useWorkspaceRefreshOnFocus({
  workspaces,
  refreshWorkspaces,
  listThreadsForWorkspace,
  backendMode = "local",
  pollIntervalMs = REMOTE_WORKSPACE_REFRESH_INTERVAL_MS,
}: WorkspaceRefreshOptions) {
  const optionsRef = useRef({
    workspaces,
    refreshWorkspaces,
    listThreadsForWorkspace,
    backendMode,
    pollIntervalMs,
  });
  useEffect(() => {
    optionsRef.current = {
      workspaces,
      refreshWorkspaces,
      listThreadsForWorkspace,
      backendMode,
      pollIntervalMs,
    };
  });

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let refreshInFlight = false;

    const runRefreshCycle = () => {
      if (refreshInFlight) {
        return;
      }
      refreshInFlight = true;
      const {
        workspaces: ws,
        refreshWorkspaces: refresh,
        listThreadsForWorkspace: listThreads,
      } = optionsRef.current;
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
          connected.map((workspace) => listThreads(workspace, { preserveState: true })),
        );
      })().finally(() => {
        refreshInFlight = false;
      });
    };

    const updatePolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      const { backendMode: currentBackendMode, pollIntervalMs: intervalMs } =
        optionsRef.current;
      if (currentBackendMode !== "remote" || document.visibilityState !== "visible") {
        return;
      }
      pollTimer = setInterval(() => {
        runRefreshCycle();
      }, intervalMs);
    };

    const scheduleRefresh = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        runRefreshCycle();
      }, 500);
    };

    const handleFocus = () => {
      scheduleRefresh();
      updatePolling();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
      }
      updatePolling();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    updatePolling();
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [backendMode, pollIntervalMs]);
}
