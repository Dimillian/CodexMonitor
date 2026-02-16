import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { WorkspaceInfo } from "../../../types";

export const REMOTE_THREAD_POLL_INTERVAL_MS = 12000;

type UseRemoteThreadRefreshOnFocusOptions = {
  backendMode: string;
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  activeThreadIsProcessing?: boolean;
  suspendPolling?: boolean;
  reconnectWorkspace?: (workspace: WorkspaceInfo) => Promise<unknown> | unknown;
  refreshThread: (workspaceId: string, threadId: string) => Promise<unknown> | unknown;
};

export function useRemoteThreadRefreshOnFocus({
  backendMode,
  activeWorkspace,
  activeThreadId,
  activeThreadIsProcessing = false,
  suspendPolling = false,
  reconnectWorkspace,
  refreshThread,
}: UseRemoteThreadRefreshOnFocusOptions) {
  const workspaceId = activeWorkspace?.id ?? null;
  const refreshThreadRef = useRef(refreshThread);
  const reconnectWorkspaceRef = useRef(reconnectWorkspace);
  const activeWorkspaceRef = useRef(activeWorkspace);
  const workspaceConnectedRef = useRef(Boolean(activeWorkspace?.connected));

  useEffect(() => {
    refreshThreadRef.current = refreshThread;
  }, [refreshThread]);

  useEffect(() => {
    reconnectWorkspaceRef.current = reconnectWorkspace;
  }, [reconnectWorkspace]);

  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
    workspaceConnectedRef.current = Boolean(activeWorkspace?.connected);
  }, [activeWorkspace]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let refreshInFlight = false;
    let reconnectInFlight = false;
    let didCleanup = false;
    let windowFocused =
      typeof document === "undefined" ? true : document.visibilityState === "visible";
    let unlistenWindowFocus: (() => void) | null = null;
    let unlistenWindowBlur: (() => void) | null = null;

    const canRefresh = () =>
      backendMode === "remote" &&
      Boolean(workspaceId) &&
      Boolean(activeThreadId);

    const ensureWorkspaceConnected = () => {
      if (
        !activeWorkspaceRef.current ||
        workspaceConnectedRef.current ||
        reconnectInFlight ||
        !reconnectWorkspaceRef.current
      ) {
        return null;
      }
      reconnectInFlight = true;
      return Promise.resolve(
        reconnectWorkspaceRef.current(activeWorkspaceRef.current),
      )
        .catch(() => {
          // Ignore reconnect failures so lifecycle hooks do not surface toast noise.
        })
        .finally(() => {
          reconnectInFlight = false;
        });
    };

    const runRefresh = () => {
      if (!canRefresh() || !workspaceId || !activeThreadId || refreshInFlight) {
        return;
      }
      refreshInFlight = true;
      void (async () => {
        const reconnectPromise = ensureWorkspaceConnected();
        if (reconnectPromise) {
          await reconnectPromise;
        }
        await Promise.resolve(
          refreshThreadRef.current(workspaceId, activeThreadId),
        );
      })()
        .catch(() => {
          // Ignore refresh failures so lifecycle hooks do not surface toast noise.
        })
        .finally(() => {
          refreshInFlight = false;
        });
    };

    const refreshActiveThread = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        runRefresh();
      }, 500);
    };

    const updatePolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (
        !canRefresh() ||
        suspendPolling ||
        activeThreadIsProcessing ||
        !windowFocused ||
        document.visibilityState !== "visible"
      ) {
        return;
      }
      const pollIntervalMs = REMOTE_THREAD_POLL_INTERVAL_MS;
      pollTimer = setInterval(() => {
        runRefresh();
      }, pollIntervalMs);
    };

    const handleFocus = () => {
      windowFocused = true;
      if (!suspendPolling) {
        refreshActiveThread();
      }
      updatePolling();
    };

    const handleBlur = () => {
      windowFocused = false;
      updatePolling();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        windowFocused = true;
        if (!suspendPolling) {
          refreshActiveThread();
        }
      }
      updatePolling();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    try {
      const windowHandle = getCurrentWindow();
      windowHandle
        .listen("tauri://focus", handleFocus)
        .then((unlisten) => {
          if (didCleanup) {
            unlisten();
            return;
          }
          unlistenWindowFocus = unlisten;
        })
        .catch(() => {
          // Ignore: DOM listeners still handle focus changes when available.
        });
      windowHandle
        .listen("tauri://blur", handleBlur)
        .then((unlisten) => {
          if (didCleanup) {
            unlisten();
            return;
          }
          unlistenWindowBlur = unlisten;
        })
        .catch(() => {
          // Ignore: DOM listeners still handle visibility changes when available.
        });
    } catch {
      // In non-Tauri environments, getCurrentWindow can throw.
    }
    updatePolling();
    return () => {
      didCleanup = true;
      if (unlistenWindowFocus) {
        unlistenWindowFocus();
      }
      if (unlistenWindowBlur) {
        unlistenWindowBlur();
      }
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [
    activeThreadId,
    activeThreadIsProcessing,
    backendMode,
    suspendPolling,
    workspaceId,
  ]);
}
