import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DebugEntry, WorkspaceInfo } from "../../../types";
import { getWorkspaceFiles } from "../../../services/tauri";

type UseWorkspaceFilesOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
  enabled?: boolean;
  pollingEnabled?: boolean;
};

function areStringArraysEqual(a: string[], b: string[]) {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

export function useWorkspaceFiles({
  activeWorkspace,
  onDebug,
  enabled = true,
  pollingEnabled,
}: UseWorkspaceFilesOptions) {
  const [files, setFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => document.visibilityState !== "hidden",
  );
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const inFlight = useRef<string | null>(null);

  const REFRESH_INTERVAL_MS = 30000;
  const LARGE_REFRESH_INTERVAL_MS = 60000;
  const LARGE_FILE_COUNT = 20000;
  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);
  const isEnabled = enabled;
  const isPollingEnabled = pollingEnabled ?? isEnabled;

  const refreshFiles = useCallback(async () => {
    if (!workspaceId || !isConnected || !isEnabled) {
      return;
    }
    if (inFlight.current === workspaceId) {
      return;
    }
    inFlight.current = workspaceId;
    const requestWorkspaceId = workspaceId;
    setIsLoading(true);
    onDebug?.({
      id: `${Date.now()}-client-files-list`,
      timestamp: Date.now(),
      source: "client",
      label: "files/list",
      payload: { workspaceId: requestWorkspaceId },
    });
    try {
      const response = await getWorkspaceFiles(requestWorkspaceId);
      onDebug?.({
        id: `${Date.now()}-server-files-list`,
        timestamp: Date.now(),
        source: "server",
        label: "files/list response",
        payload: response,
      });
      if (requestWorkspaceId === workspaceId) {
        const nextFiles = Array.isArray(response) ? response : [];
        setFiles((prev) => (areStringArraysEqual(prev, nextFiles) ? prev : nextFiles));
        lastFetchedWorkspaceId.current = requestWorkspaceId;
      }
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-files-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "files/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (inFlight.current === requestWorkspaceId) {
        inFlight.current = null;
        setIsLoading(false);
      }
    }
  }, [isConnected, isEnabled, onDebug, workspaceId]);

  useEffect(() => {
    setFiles([]);
    lastFetchedWorkspaceId.current = null;
    inFlight.current = null;
  }, [isConnected, workspaceId]);

  useEffect(() => {
    setIsLoading(Boolean(workspaceId && isConnected && isEnabled));
  }, [isConnected, isEnabled, workspaceId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState !== "hidden");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!workspaceId || !isConnected || !isEnabled) {
      return;
    }
    if (lastFetchedWorkspaceId.current === workspaceId && files.length > 0) {
      return;
    }
    refreshFiles();
  }, [files.length, isConnected, isEnabled, refreshFiles, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected || !isPollingEnabled || !isDocumentVisible) {
      return;
    }
    const refreshInterval =
      files.length > LARGE_FILE_COUNT ? LARGE_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS;

    const interval = window.setInterval(() => {
      // Skip if tab is hidden
      if (document.visibilityState === "hidden") {
        return;
      }
      refreshFiles().catch(() => {});
    }, refreshInterval);

    return () => {
      window.clearInterval(interval);
    };
  }, [files.length, isConnected, isDocumentVisible, isPollingEnabled, refreshFiles, workspaceId]);

  const fileOptions = useMemo(() => files.filter(Boolean), [files]);

  return {
    files: fileOptions,
    isLoading,
    refreshFiles,
  };
}
