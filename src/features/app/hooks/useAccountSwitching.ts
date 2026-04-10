import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  activateSavedAuthProfile,
  cancelCodexLogin,
  listSavedAuthProfiles,
  runCodexLogin,
  syncCurrentSavedAuthProfile,
} from "../../../services/tauri";
import { subscribeAppServerEvents } from "../../../services/events";
import type { AccountSnapshot, RateLimitSnapshot, SavedAccountProfile } from "../../../types";
import { getAppServerParams, getAppServerRawMethod } from "../../../utils/appServerEvents";
import { openUrl } from "@tauri-apps/plugin-opener";

type UseAccountSwitchingArgs = {
  activeWorkspaceId: string | null;
  accountByWorkspace: Record<string, AccountSnapshot | null | undefined>;
  activeRateLimits: RateLimitSnapshot | null;
  refreshAccountInfo: (workspaceId: string) => Promise<void> | void;
  refreshAccountRateLimits: (workspaceId: string) => Promise<void> | void;
  alertError: (error: unknown) => void;
};

type UseAccountSwitchingResult = {
  activeAccount: AccountSnapshot | null;
  accountSwitching: boolean;
  savedProfiles: SavedAccountProfile[];
  savedProfilesLoading: boolean;
  activatingProfileId: string | null;
  handleSwitchAccount: () => Promise<void>;
  handleCancelSwitchAccount: () => Promise<void>;
  handleActivateSavedProfile: (profileId: string) => Promise<void>;
};

function hasUsableAccountSnapshot(account: AccountSnapshot | null | undefined): boolean {
  if (!account) {
    return false;
  }
  return (
    account.type !== "unknown" ||
    Boolean(account.email?.trim()) ||
    Boolean(account.planType?.trim())
  );
}

function hasUsableRateLimitSnapshot(rateLimits: RateLimitSnapshot | null | undefined): boolean {
  if (!rateLimits) {
    return false;
  }
  const balance = rateLimits.credits?.balance?.trim() ?? "";
  return (
    rateLimits.primary !== null ||
    rateLimits.secondary !== null ||
    Boolean(rateLimits.planType?.trim()) ||
    Boolean(
      rateLimits.credits &&
        (rateLimits.credits.hasCredits ||
          rateLimits.credits.unlimited ||
          balance.length > 0),
    )
  );
}

function normalizeAccountType(value: unknown): SavedAccountProfile["accountType"] {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "chatgpt" || normalized === "apikey") {
    return normalized;
  }
  return "unknown";
}

function normalizeSavedProfiles(
  response: Record<string, unknown> | null,
): SavedAccountProfile[] {
  const activeProfileId =
    typeof response?.activeProfileId === "string" ? response.activeProfileId : null;
  const profiles = Array.isArray(response?.profiles) ? response.profiles : [];

  return profiles
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const profile = entry as Record<string, unknown>;
      const rateLimitsRaw =
        profile.rateLimits && typeof profile.rateLimits === "object"
          ? (profile.rateLimits as RateLimitSnapshot)
          : null;
      return {
        id: typeof profile.id === "string" ? profile.id : "",
        accountType: normalizeAccountType(profile.accountType),
        email: typeof profile.email === "string" ? profile.email.trim() || null : null,
        planType:
          typeof profile.planType === "string" ? profile.planType.trim() || null : null,
        requiresOpenaiAuth:
          typeof profile.requiresOpenaiAuth === "boolean"
            ? profile.requiresOpenaiAuth
            : null,
        rateLimits: rateLimitsRaw,
        updatedAt:
          typeof profile.updatedAt === "number" && Number.isFinite(profile.updatedAt)
            ? profile.updatedAt
            : null,
        isActive: typeof profile.id === "string" && profile.id === activeProfileId,
      } satisfies SavedAccountProfile;
    })
    .filter((profile): profile is SavedAccountProfile => Boolean(profile?.id));
}

function accountToPayload(account: AccountSnapshot | null): Record<string, unknown> | null {
  if (!account || !hasUsableAccountSnapshot(account)) {
    return null;
  }
  return {
    type: account.type,
    email: account.email,
    planType: account.planType,
    requiresOpenaiAuth: account.requiresOpenaiAuth,
  };
}

function rateLimitsToPayload(
  rateLimits: RateLimitSnapshot | null,
): Record<string, unknown> | null {
  if (!rateLimits || !hasUsableRateLimitSnapshot(rateLimits)) {
    return null;
  }
  return {
    primary: rateLimits.primary,
    secondary: rateLimits.secondary,
    credits: rateLimits.credits,
    planType: rateLimits.planType,
  };
}

export function useAccountSwitching({
  activeWorkspaceId,
  accountByWorkspace,
  activeRateLimits,
  refreshAccountInfo,
  refreshAccountRateLimits,
  alertError,
}: UseAccountSwitchingArgs): UseAccountSwitchingResult {
  const [accountSwitching, setAccountSwitching] = useState(false);
  const [savedProfiles, setSavedProfiles] = useState<SavedAccountProfile[]>([]);
  const [savedProfilesLoading, setSavedProfilesLoading] = useState(false);
  const [activatingProfileId, setActivatingProfileId] = useState<string | null>(null);
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

  const syncFingerprint = useMemo(
    () =>
      JSON.stringify({
        workspaceId: activeWorkspaceId,
        account: accountToPayload(activeAccount),
        rateLimits: rateLimitsToPayload(activeRateLimits),
      }),
    [activeWorkspaceId, activeAccount, activeRateLimits],
  );

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

  const reloadSavedProfiles = useCallback(async (workspaceId: string) => {
    setSavedProfilesLoading(true);
    try {
      const response = await listSavedAuthProfiles(workspaceId);
      setSavedProfiles(normalizeSavedProfiles(response));
    } catch (error) {
      alertErrorRef.current(error);
    } finally {
      setSavedProfilesLoading(false);
    }
  }, []);

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
    if (!activeWorkspaceId) {
      setSavedProfiles([]);
      setSavedProfilesLoading(false);
      return;
    }
    void reloadSavedProfiles(activeWorkspaceId);
  }, [activeWorkspaceId, reloadSavedProfiles]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    const accountPayload = accountToPayload(activeAccount);
    const rateLimitsPayload = rateLimitsToPayload(activeRateLimits);
    if (!accountPayload && !rateLimitsPayload) {
      return;
    }
    let canceled = false;
    void syncCurrentSavedAuthProfile(activeWorkspaceId, accountPayload, rateLimitsPayload)
      .then((response) => {
        if (canceled) {
          return;
        }
        setSavedProfiles(normalizeSavedProfiles(response));
      })
      .catch(() => {
        // Some workspaces may not have auth.json yet; avoid noisy errors here.
      });

    return () => {
      canceled = true;
    };
  }, [activeWorkspaceId, syncFingerprint, activeAccount, activeRateLimits]);

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

  const handleActivateSavedProfile = useCallback(
    async (profileId: string) => {
      if (!activeWorkspaceId || !profileId || accountSwitching || activatingProfileId) {
        return;
      }
      const existingProfile = savedProfiles.find((profile) => profile.id === profileId);
      if (existingProfile?.isActive) {
        return;
      }

      setActivatingProfileId(profileId);
      try {
        const response = await activateSavedAuthProfile(activeWorkspaceId, profileId);
        setSavedProfiles(normalizeSavedProfiles(response));
        await Promise.all([
          refreshAccountInfo(activeWorkspaceId),
          refreshAccountRateLimits(activeWorkspaceId),
        ]);
        await reloadSavedProfiles(activeWorkspaceId);
      } catch (error) {
        alertError(error);
      } finally {
        setActivatingProfileId(null);
      }
    },
    [
      activeWorkspaceId,
      accountSwitching,
      activatingProfileId,
      alertError,
      refreshAccountInfo,
      refreshAccountRateLimits,
      reloadSavedProfiles,
      savedProfiles,
    ],
  );

  return {
    activeAccount,
    accountSwitching,
    savedProfiles,
    savedProfilesLoading,
    activatingProfileId,
    handleSwitchAccount,
    handleCancelSwitchAccount,
    handleActivateSavedProfile,
  };
}
