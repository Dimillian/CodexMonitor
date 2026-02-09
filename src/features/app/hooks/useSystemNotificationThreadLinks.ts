import { useCallback, useEffect, useMemo, useRef } from "react";
import type { WorkspaceInfo } from "../../../types";

type ThreadDeepLink = {
  workspaceId: string;
  threadId: string;
  notifiedAt: number;
};

type Params = {
  hasLoadedWorkspaces: boolean;
  workspacesById: Map<string, WorkspaceInfo>;
  refreshWorkspaces: () => Promise<WorkspaceInfo[] | undefined>;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  setActiveTab: (tab: "home" | "projects" | "codex" | "git" | "log") => void;
  setCenterMode: (mode: "chat" | "diff") => void;
  setSelectedDiffPath: (path: string | null) => void;
  setActiveWorkspaceId: (workspaceId: string | null) => void;
  setActiveThreadId: (threadId: string | null, workspaceId?: string) => void;
  maxAgeMs?: number;
};

type Result = {
  recordPendingThreadLink: (workspaceId: string, threadId: string) => void;
};

export function useSystemNotificationThreadLinks({
  hasLoadedWorkspaces,
  workspacesById,
  refreshWorkspaces,
  connectWorkspace,
  setActiveTab,
  setCenterMode,
  setSelectedDiffPath,
  setActiveWorkspaceId,
  setActiveThreadId,
  maxAgeMs = 120_000,
}: Params): Result {
  const pendingLinkRef = useRef<ThreadDeepLink | null>(null);
  const refreshInFlightRef = useRef(false);

  const recordPendingThreadLink = useCallback((workspaceId: string, threadId: string) => {
    pendingLinkRef.current = { workspaceId, threadId, notifiedAt: Date.now() };
  }, []);

  const tryNavigateToLink = useCallback(async () => {
    const link = pendingLinkRef.current;
    if (!link) {
      return;
    }
    if (Date.now() - link.notifiedAt > maxAgeMs) {
      pendingLinkRef.current = null;
      return;
    }

    setCenterMode("chat");
    setSelectedDiffPath(null);
    setActiveTab("codex");

    let workspace = workspacesById.get(link.workspaceId) ?? null;
    if (!workspace && hasLoadedWorkspaces && !refreshInFlightRef.current) {
      refreshInFlightRef.current = true;
      try {
        const refreshed = await refreshWorkspaces();
        workspace =
          refreshed?.find((entry) => entry.id === link.workspaceId) ?? null;
      } finally {
        refreshInFlightRef.current = false;
      }
    }

    if (!workspace) {
      pendingLinkRef.current = null;
      return;
    }

    if (!workspace.connected) {
      try {
        await connectWorkspace(workspace);
      } catch {
        // Ignore connect failures; user can retry manually.
      }
    }

    setActiveWorkspaceId(link.workspaceId);
    setActiveThreadId(link.threadId, link.workspaceId);
    pendingLinkRef.current = null;
  }, [
    connectWorkspace,
    hasLoadedWorkspaces,
    maxAgeMs,
    refreshWorkspaces,
    setActiveTab,
    setActiveThreadId,
    setActiveWorkspaceId,
    setCenterMode,
    setSelectedDiffPath,
    workspacesById,
  ]);

  const focusHandler = useMemo(() => () => void tryNavigateToLink(), [tryNavigateToLink]);

  useEffect(() => {
    window.addEventListener("focus", focusHandler);
    return () => window.removeEventListener("focus", focusHandler);
  }, [focusHandler]);

  useEffect(() => {
    if (!pendingLinkRef.current) {
      return;
    }
    if (!hasLoadedWorkspaces) {
      return;
    }
    void tryNavigateToLink();
  }, [hasLoadedWorkspaces, tryNavigateToLink]);

  return { recordPendingThreadLink };
}
