import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelCodexLogin, runCodexLogin } from "../../../services/tauri";
import { subscribeAppServerEvents } from "../../../services/events";
import type { AccountSnapshot } from "../../../types";
import { getAppServerParams, getAppServerRawMethod } from "../../../utils/appServerEvents";
import { openUrl } from "@tauri-apps/plugin-opener";

type UseAccountSwitchingArgs = {
  activeWorkspaceId: string | null;
  accountByWorkspace: Record<string, AccountSnapshot | null | undefined>;
  refreshAccountInfo: (workspaceId: string) => Promise<void> | void;
  refreshAccountRateLimits: (workspaceId: string) => Promise<void> | void;
  alertError: (error: unknown) => void;
};

type UseAccountSwitchingResult = {
  activeAccount: AccountSnapshot | null;
  accountSwitching: boolean;
  handleSwitchAccount: () => Promise<void>;
  handleCancelSwitchAccount: () => Promise<void>;
};

export function useAccountSwitching({
  activeWorkspaceId,
  accountByWorkspace,
  refreshAccountInfo,
  refreshAccountRateLimits,
  alertError,
}: UseAccountSwitchingArgs): UseAccountSwitchingResult {
  const [accountSwitching, setAccountSwitching] = useState(false);
  const accountSwitchCanceledRef = useRef(false);
  const loginIdRef = useRef<string | null>(null);
  const loginWorkspaceIdRef = useRef<string | null>(null);
  const accountSwitchingRef = useRef(false);
  const activeWorkspaceIdRef = useRef<string | null>(activeWorkspaceId);
  const refreshAccountInfoRef = useRef(refreshAccountInfo);
  const refreshAccountRateLimitsRef = useRef(refreshAccountRateLimits);
  const alertErrorRef = useRef(alertError);

  const activeAccount = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }
    return accountByWorkspace[activeWorkspaceId] ?? null;
  }, [activeWorkspaceId, accountByWorkspace]);

  const isCodexLoginCanceled = useCallback((error: unknown) => {
    const message =
      typeof error === "string" ? error : error instanceof Error ? error.message : "";
    const normalized = message.toLowerCase();
    return (
      normalized.includes("codex login canceled") ||
      normalized.includes("codex login cancelled") ||
      normalized.includes("request canceled")
    );
  }, []);

  useEffect(() => {
    accountSwitchingRef.current = accountSwitching;
  }, [accountSwitching]);

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

  useEffect(() => {
    refreshAccountInfoRef.current = refreshAccountInfo;
  }, [refreshAccountInfo]);

  useEffect(() => {
    refreshAccountRateLimitsRef.current = refreshAccountRateLimits;
  }, [refreshAccountRateLimits]);

  useEffect(() => {
    alertErrorRef.current = alertError;
  }, [alertError]);

  useEffect(() => {
    const currentWorkspaceId = activeWorkspaceId;
    const inFlightWorkspaceId = loginWorkspaceIdRef.current;
    if (
      accountSwitchingRef.current &&
      inFlightWorkspaceId &&
      currentWorkspaceId &&
      inFlightWorkspaceId !== currentWorkspaceId
    ) {
      // The user navigated away from the workspace that initiated the login.
      // Keep tracking the in-flight login, but clear the switching indicator.
      setAccountSwitching(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    const unlisten = subscribeAppServerEvents((payload) => {
      const matchWorkspaceId = loginWorkspaceIdRef.current ?? activeWorkspaceIdRef.current;
      if (!matchWorkspaceId || payload.workspace_id !== matchWorkspaceId) {
        return;
      }

      const method = getAppServerRawMethod(payload);
      if (!method) {
        return;
      }
      const params = getAppServerParams(payload);

      if (method === "account/login/completed") {
        const loginId = String(params.loginId ?? params.login_id ?? "");
        if (loginIdRef.current && loginId && loginIdRef.current !== loginId) {
          return;
        }

        loginIdRef.current = null;
        loginWorkspaceIdRef.current = null;
        const success = Boolean(params.success);
        const errorMessage = String(params.error ?? "").trim();

        if (success && !accountSwitchCanceledRef.current) {
          void refreshAccountInfoRef.current(matchWorkspaceId);
          void refreshAccountRateLimitsRef.current(matchWorkspaceId);
        } else if (!accountSwitchCanceledRef.current && errorMessage) {
          alertErrorRef.current(errorMessage);
        }

        setAccountSwitching(false);
        accountSwitchCanceledRef.current = false;
        return;
      }

      if (method === "account/updated") {
        if (!accountSwitchingRef.current || accountSwitchCanceledRef.current) {
          return;
        }
        void refreshAccountInfoRef.current(matchWorkspaceId);
        void refreshAccountRateLimitsRef.current(matchWorkspaceId);
        setAccountSwitching(false);
        accountSwitchCanceledRef.current = false;
      }
    });

    return () => {
      unlisten();
    };
  }, []);

  const handleSwitchAccount = useCallback(async () => {
    if (!activeWorkspaceId || accountSwitching) {
      return;
    }
    const workspaceId = activeWorkspaceId;
    accountSwitchCanceledRef.current = false;
    setAccountSwitching(true);
    loginIdRef.current = null;
    loginWorkspaceIdRef.current = workspaceId;
    try {
      const { loginId, authUrl } = await runCodexLogin(workspaceId);

      if (accountSwitchCanceledRef.current) {
        loginIdRef.current = loginId;
        try {
          await cancelCodexLogin(workspaceId);
        } catch {
          // Best effort: the user already canceled.
        }
        setAccountSwitching(false);
        accountSwitchCanceledRef.current = false;
        loginIdRef.current = null;
        loginWorkspaceIdRef.current = null;
        return;
      }

      loginIdRef.current = loginId;
      await openUrl(authUrl);
    } catch (error) {
      if (accountSwitchCanceledRef.current || isCodexLoginCanceled(error)) {
        setAccountSwitching(false);
        accountSwitchCanceledRef.current = false;
        loginIdRef.current = null;
        loginWorkspaceIdRef.current = null;
        return;
      }
      alertError(error);
      if (loginIdRef.current) {
        try {
          await cancelCodexLogin(workspaceId);
        } catch {
          // Ignore cancel errors here; we already surfaced the primary failure.
        }
      }
      setAccountSwitching(false);
      accountSwitchCanceledRef.current = false;
      loginIdRef.current = null;
      loginWorkspaceIdRef.current = null;
    } finally {
      // Completion is now driven by app-server events.
    }
  }, [
    activeWorkspaceId,
    accountSwitching,
    alertError,
    isCodexLoginCanceled,
  ]);

  const handleCancelSwitchAccount = useCallback(async () => {
    const targetWorkspaceId = loginWorkspaceIdRef.current ?? activeWorkspaceId;
    if (!targetWorkspaceId || (!accountSwitchingRef.current && !loginWorkspaceIdRef.current)) {
      return;
    }
    accountSwitchCanceledRef.current = true;
    try {
      await cancelCodexLogin(targetWorkspaceId);
    } catch (error) {
      alertError(error);
    } finally {
      setAccountSwitching(false);
      loginIdRef.current = null;
      loginWorkspaceIdRef.current = null;
    }
  }, [activeWorkspaceId, alertError]);

  return {
    activeAccount,
    accountSwitching,
    handleSwitchAccount,
    handleCancelSwitchAccount,
  };
}
