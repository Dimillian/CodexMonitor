import { useWindowDrag } from "@/features/layout/hooks/useWindowDrag";
import {
  REMOTE_WORKSPACE_REFRESH_INTERVAL_MS,
  useWorkspaceRefreshOnFocus,
} from "@/features/workspaces/hooks/useWorkspaceRefreshOnFocus";
import { useWorkspaceRestore } from "@/features/workspaces/hooks/useWorkspaceRestore";
import { useTabActivationGuard } from "@app/hooks/useTabActivationGuard";
import {
  useRemoteThreadRefreshOnFocus,
} from "@app/hooks/useRemoteThreadRefreshOnFocus";
import type { WorkspaceInfo } from "@/types";

type UseMainAppWorkspaceLifecycleArgs = {
  activeTab: "home" | "projects" | "opencode" | "git" | "log";
  isTablet: boolean;
  setActiveTab: (tab: "home" | "projects" | "opencode" | "git" | "log") => void;
  workspaces: WorkspaceInfo[];
  hasLoaded: boolean;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  listThreadsForWorkspaces: (workspaces: WorkspaceInfo[]) => Promise<void>;
  refreshWorkspaces: () => Promise<void | WorkspaceInfo[]>;
  backendMode: "local" | "remote";
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  threadStatusById: Record<string, { isProcessing: boolean }>;
  remoteThreadConnectionState: "live" | "polling" | "disconnected";
  refreshThread: (workspaceId: string, threadId: string) => Promise<unknown>;
};

export function useMainAppWorkspaceLifecycle({
  activeTab,
  isTablet,
  setActiveTab,
  workspaces,
  hasLoaded,
  connectWorkspace,
  listThreadsForWorkspaces,
  refreshWorkspaces,
  backendMode,
  activeWorkspace,
  activeThreadId,
  threadStatusById,
  remoteThreadConnectionState,
  refreshThread,
}: UseMainAppWorkspaceLifecycleArgs) {
  useTabActivationGuard({
    activeTab,
    isTablet,
    setActiveTab,
  });

  useWindowDrag("titlebar");

  useWorkspaceRestore({
    workspaces,
    hasLoaded,
    connectWorkspace,
    listThreadsForWorkspaces,
  });

  useWorkspaceRefreshOnFocus({
    workspaces,
    refreshWorkspaces,
    listThreadsForWorkspaces,
    backendMode,
    pollIntervalMs: REMOTE_WORKSPACE_REFRESH_INTERVAL_MS,
  });

  useRemoteThreadRefreshOnFocus({
    backendMode,
    activeWorkspace,
    activeThreadId,
    activeThreadIsProcessing: Boolean(
      activeThreadId && threadStatusById[activeThreadId]?.isProcessing,
    ),
    suspendPolling:
      backendMode === "remote" && remoteThreadConnectionState === "live",
    reconnectWorkspace: connectWorkspace,
    refreshThread,
  });
}
