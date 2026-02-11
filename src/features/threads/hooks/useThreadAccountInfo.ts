import { useCallback, useEffect } from "react";
import type { AccountSnapshot, DebugEntry } from "@/types";
import { getAccountInfo } from "@services/tauri";
import type { ThreadAction } from "./useThreadsReducer";

type UseThreadAccountInfoOptions = {
  activeWorkspaceId: string | null;
  activeWorkspaceConnected?: boolean;
  dispatch: React.Dispatch<ThreadAction>;
  onDebug?: (entry: DebugEntry) => void;
};

function normalizeAccountSnapshot(
  response: Record<string, unknown> | null,
): AccountSnapshot {
  const accountValue =
    (response?.result as Record<string, unknown> | undefined)?.account ??
    response?.account;
  const account =
    accountValue && typeof accountValue === "object"
      ? (accountValue as Record<string, unknown>)
      : null;
  const requiresOpenaiAuthRaw =
    (response?.result as Record<string, unknown> | undefined)?.requiresOpenaiAuth ??
    (response?.result as Record<string, unknown> | undefined)?.requires_openai_auth ??
    response?.requiresOpenaiAuth ??
    response?.requires_openai_auth;
  const requiresOpenaiAuth =
    typeof requiresOpenaiAuthRaw === "boolean" ? requiresOpenaiAuthRaw : null;

  if (!account) {
    return {
      type: "unknown",
      email: null,
      planType: null,
      requiresOpenaiAuth,
    };
  }

  const typeRaw =
    typeof account.type === "string" ? account.type.toLowerCase() : "unknown";
  const type = typeRaw === "chatgpt" || typeRaw === "apikey" ? typeRaw : "unknown";
  const emailRaw = typeof account.email === "string" ? account.email.trim() : "";
  const planRaw =
    typeof account.planType === "string" ? account.planType.trim() : "";

  return {
    type,
    email: emailRaw ? emailRaw : null,
    planType: planRaw ? planRaw : null,
    requiresOpenaiAuth,
  };
}

export function useThreadAccountInfo({
  activeWorkspaceId,
  activeWorkspaceConnected,
  dispatch,
  onDebug,
}: UseThreadAccountInfoOptions) {
  const refreshAccountInfo = useCallback(
    async (workspaceId?: string) => {
      const targetId = workspaceId ?? activeWorkspaceId;
      if (!targetId) {
        return;
      }
      onDebug?.({
        id: `${Date.now()}-client-account-read`,
        timestamp: Date.now(),
        source: "client",
        label: "account/read",
        payload: { workspaceId: targetId },
      });
      try {
        const response = await getAccountInfo(targetId);
        onDebug?.({
          id: `${Date.now()}-server-account-read`,
          timestamp: Date.now(),
          source: "server",
          label: "account/read response",
          payload: response,
        });
        dispatch({
          type: "setAccountInfo",
          workspaceId: targetId,
          account: normalizeAccountSnapshot(response),
        });
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-account-read-error`,
          timestamp: Date.now(),
          source: "error",
          label: "account/read error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [activeWorkspaceId, dispatch, onDebug],
  );

  useEffect(() => {
    if (activeWorkspaceConnected && activeWorkspaceId) {
      void refreshAccountInfo(activeWorkspaceId);
    }
  }, [activeWorkspaceConnected, activeWorkspaceId, refreshAccountInfo]);

  return { refreshAccountInfo };
}
