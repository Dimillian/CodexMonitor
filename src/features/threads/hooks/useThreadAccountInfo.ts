import { useCallback, useEffect } from "react";
import type { AccountSnapshot, DebugEntry } from "../../../types";
import { getAccountInfo } from "../../../services/tauri";
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
  const resultValue =
    response?.result && typeof response.result === "object" ? response.result : null;
  const dataValue =
    resultValue && typeof (resultValue as Record<string, unknown>).data === "object"
      ? ((resultValue as Record<string, unknown>).data as Record<string, unknown>)
      : null;
  const accountValue =
    (resultValue as Record<string, unknown> | null)?.account ??
    dataValue?.account ??
    response?.account ??
    (response?.data as Record<string, unknown> | undefined)?.account ??
    (resultValue as Record<string, unknown> | null);
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

  const authenticatedRaw =
    (resultValue as Record<string, unknown> | null)?.authenticated ??
    (resultValue as Record<string, unknown> | null)?.isAuthenticated ??
    dataValue?.authenticated ??
    dataValue?.isAuthenticated ??
    response?.authenticated ??
    response?.isAuthenticated;
  const authenticated =
    typeof authenticatedRaw === "boolean" ? authenticatedRaw : null;
  const loginRaw =
    (resultValue as Record<string, unknown> | null)?.login ??
    (resultValue as Record<string, unknown> | null)?.user ??
    dataValue?.login ??
    dataValue?.user ??
    (account as Record<string, unknown> | null)?.login ??
    (account as Record<string, unknown> | null)?.user ??
    response?.login ??
    response?.user;
  const login =
    typeof loginRaw === "string" ? loginRaw.trim() : "";

  if (!account) {
    return {
      type: "unknown",
      email: authenticated ? login || "Copilot" : null,
      planType: null,
      requiresOpenaiAuth,
    };
  }

  const typeRaw =
    typeof account.type === "string" ? account.type.toLowerCase() : "unknown";
  const type = typeRaw === "chatgpt" || typeRaw === "apikey" ? typeRaw : "unknown";
  const emailRaw =
    typeof account.email === "string"
      ? account.email.trim()
      : typeof account.login === "string"
        ? account.login.trim()
        : typeof account.user === "string"
          ? account.user.trim()
          : "";
  const fallbackEmail = login || "";
  const email = emailRaw || fallbackEmail;
  const planRaw =
    typeof account.planType === "string" ? account.planType.trim() : "";

  return {
    type,
    email: email ? email : null,
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
