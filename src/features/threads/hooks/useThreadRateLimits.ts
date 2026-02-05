import { useCallback, useEffect } from "react";
import type { DebugEntry } from "../../../types";
import { getAccountRateLimits, fetchCopilotUsage } from "../../../services/tauri";
import { normalizeRateLimits } from "../utils/threadNormalize";
import type { ThreadAction } from "./useThreadsReducer";

type UseThreadRateLimitsOptions = {
  activeWorkspaceId: string | null;
  activeWorkspaceConnected?: boolean;
  dispatch: React.Dispatch<ThreadAction>;
  onDebug?: (entry: DebugEntry) => void;
};

export function useThreadRateLimits({
  activeWorkspaceId,
  activeWorkspaceConnected,
  dispatch,
  onDebug,
}: UseThreadRateLimitsOptions) {
  const refreshAccountRateLimits = useCallback(
    async (workspaceId?: string) => {
      const targetId = workspaceId ?? activeWorkspaceId;
      if (!targetId) {
        return;
      }
      onDebug?.({
        id: `${Date.now()}-client-account-rate-limits`,
        timestamp: Date.now(),
        source: "client",
        label: "account/rateLimits/read",
        payload: { workspaceId: targetId },
      });
      
      // Try Copilot API first (direct GitHub API call)
      try {
        const copilotUsage = await fetchCopilotUsage();
        onDebug?.({
          id: `${Date.now()}-server-copilot-usage`,
          timestamp: Date.now(),
          source: "server",
          label: "copilot/usage response",
          payload: copilotUsage,
        });
        
        if (copilotUsage?.primary) {
          dispatch({
            type: "setRateLimits",
            workspaceId: targetId,
            rateLimits: normalizeRateLimits(copilotUsage as Record<string, unknown>),
          });
          return;
        }
      } catch (copilotError) {
        onDebug?.({
          id: `${Date.now()}-client-copilot-usage-error`,
          timestamp: Date.now(),
          source: "error",
          label: "copilot/usage error (falling back)",
          payload: copilotError instanceof Error ? copilotError.message : String(copilotError),
        });
      }
      
      // Fall back to standard method
      try {
        const response = await getAccountRateLimits(targetId);
        onDebug?.({
          id: `${Date.now()}-server-account-rate-limits`,
          timestamp: Date.now(),
          source: "server",
          label: "account/rateLimits/read response",
          payload: response,
        });
        const rateLimits =
          (response?.result?.rateLimits as Record<string, unknown> | undefined) ??
          (response?.result?.rate_limits as Record<string, unknown> | undefined) ??
          (response?.rateLimits as Record<string, unknown> | undefined) ??
          (response?.rate_limits as Record<string, unknown> | undefined);
        if (rateLimits) {
          dispatch({
            type: "setRateLimits",
            workspaceId: targetId,
            rateLimits: normalizeRateLimits(rateLimits),
          });
        }
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-account-rate-limits-error`,
          timestamp: Date.now(),
          source: "error",
          label: "account/rateLimits/read error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [activeWorkspaceId, dispatch, onDebug],
  );

  useEffect(() => {
    if (activeWorkspaceConnected && activeWorkspaceId) {
      void refreshAccountRateLimits(activeWorkspaceId);
    }
  }, [activeWorkspaceConnected, activeWorkspaceId, refreshAccountRateLimits]);

  return { refreshAccountRateLimits };
}
