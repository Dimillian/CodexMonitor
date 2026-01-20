import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceInfo } from "../../../types";

type WorkspaceRestoreOptions = {
  workspaces: WorkspaceInfo[];
  hasLoaded: boolean;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  listThreadsForWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
};

export type WorkspaceReconnectionState = {
  workspaceId: string;
  status: "connecting" | "connected" | "failed";
  error?: string;
  retryCount: number;
};

/**
 * Hook for restoring workspace connections on app startup
 *
 * This hook attempts to reconnect to previously connected workspaces
 * and surfaces any connection errors to the user with retry capability.
 */
export function useWorkspaceRestore({
  workspaces,
  hasLoaded,
  connectWorkspace,
  listThreadsForWorkspace,
}: WorkspaceRestoreOptions) {
  const restoredWorkspaces = useRef(new Set<string>());
  const [reconnectionStates, setReconnectionStates] = useState<
    Map<string, WorkspaceReconnectionState>
  >(new Map());

  /**
   * Retry a failed workspace connection with exponential backoff
   */
  const retryConnection = useCallback(
    async (workspace: WorkspaceInfo, maxRetries = 3): Promise<void> => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          setReconnectionStates((prev) => {
            const next = new Map(prev);
            next.set(workspace.id, {
              workspaceId: workspace.id,
              status: "connecting",
              retryCount: attempt,
            });
            return next;
          });

          await connectWorkspace(workspace);

          // Connection succeeded
          setReconnectionStates((prev) => {
            const next = new Map(prev);
            next.set(workspace.id, {
              workspaceId: workspace.id,
              status: "connected",
              retryCount: attempt + 1,
            });
            return next;
          });

          // Clear the state after a delay
          setTimeout(() => {
            setReconnectionStates((prev) => {
              const next = new Map(prev);
              next.delete(workspace.id);
              return next;
            });
          }, 3000);

          return;
        } catch (error) {
          lastError = error as Error;

          // Exponential backoff: 1s, 2s, 4s, etc. (max 10s)
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      // All retries failed - surface error to user
      setReconnectionStates((prev) => {
        const next = new Map(prev);
        next.set(workspace.id, {
          workspaceId: workspace.id,
          status: "failed",
          error: lastError?.message || "Unknown error",
          retryCount: maxRetries,
        });
        return next;
      });
    },
    [connectWorkspace]
  );

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    workspaces.forEach((workspace) => {
      if (restoredWorkspaces.current.has(workspace.id)) {
        return;
      }
      restoredWorkspaces.current.add(workspace.id);

      void (async () => {
        try {
          if (!workspace.connected) {
            await retryConnection(workspace);
          }

          // Try to list threads even if reconnection failed
          try {
            await listThreadsForWorkspace(workspace);
          } catch (error) {
            // Log but don't fail the entire restoration
            console.warn(`Failed to list threads for ${workspace.id}:`, error);
          }
        } catch (error) {
          // This should not happen due to retryConnection handling errors
          console.error(`Unexpected error restoring ${workspace.id}:`, error);
        }
      })();
    });
  }, [
    connectWorkspace,
    hasLoaded,
    listThreadsForWorkspace,
    retryConnection,
    workspaces,
  ]);

  /**
   * Clear a reconnection state (e.g., after user dismisses error)
   */
  const clearReconnectionState = useCallback((workspaceId: string) => {
    setReconnectionStates((prev) => {
      const next = new Map(prev);
      next.delete(workspaceId);
      return next;
    });
  }, []);

  return {
    reconnectionStates,
    retryConnection,
    clearReconnectionState,
  };
}
