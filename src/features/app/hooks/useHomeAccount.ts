import { useEffect, useMemo } from "react";
import type {
  AccountSnapshot,
  RateLimitSnapshot,
  WorkspaceInfo,
} from "@/types";

type UseHomeAccountArgs = {
  showHome: boolean;
  usageWorkspaceId: string | null;
  workspaces: WorkspaceInfo[];
  rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null | undefined>;
  accountByWorkspace: Record<string, AccountSnapshot | null | undefined>;
  refreshAccountInfo: (workspaceId: string) => Promise<void> | void;
  refreshAccountRateLimits: (workspaceId: string) => Promise<void> | void;
};

type ResolveHomeAccountWorkspaceIdArgs = Pick<
  UseHomeAccountArgs,
  "usageWorkspaceId" | "workspaces" | "rateLimitsByWorkspace" | "accountByWorkspace"
>;

function hasUsableAccountSnapshot(
  account: AccountSnapshot | null | undefined,
): boolean {
  if (!account) {
    return false;
  }

  return (
    account.type !== "unknown" ||
    Boolean(account.email?.trim()) ||
    Boolean(account.planType?.trim())
  );
}

function hasUsableRateLimitSnapshot(
  rateLimits: RateLimitSnapshot | null | undefined,
): boolean {
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

export function resolveHomeAccountWorkspaceId({
  usageWorkspaceId,
  workspaces,
  rateLimitsByWorkspace,
  accountByWorkspace,
}: ResolveHomeAccountWorkspaceIdArgs): string | null {
  const workspaceHasAccountData = (workspace: WorkspaceInfo) => {
    const account = accountByWorkspace[workspace.id];
    const rateLimits = rateLimitsByWorkspace[workspace.id];
    return hasUsableAccountSnapshot(account) || hasUsableRateLimitSnapshot(rateLimits);
  };

  if (usageWorkspaceId && workspaces.some((workspace) => workspace.id === usageWorkspaceId)) {
    return usageWorkspaceId;
  }

  if (usageWorkspaceId === null) {
    return null;
  }

  const connectedWorkspaceWithAccountData = workspaces.find(
    (workspace) => workspace.connected && workspaceHasAccountData(workspace),
  );
  if (connectedWorkspaceWithAccountData) {
    return connectedWorkspaceWithAccountData.id;
  }

  const connectedWorkspace = workspaces.find((workspace) => workspace.connected);
  if (connectedWorkspace) {
    return connectedWorkspace.id;
  }

  const workspaceWithAccountData = workspaces.find(workspaceHasAccountData);
  if (workspaceWithAccountData) {
    return workspaceWithAccountData.id;
  }

  return workspaces[0]?.id ?? null;
}

export function useHomeAccount({
  showHome,
  usageWorkspaceId,
  workspaces,
  rateLimitsByWorkspace,
  accountByWorkspace,
  refreshAccountInfo,
  refreshAccountRateLimits,
}: UseHomeAccountArgs) {
  const homeAccountWorkspaceId = useMemo(
    () =>
      resolveHomeAccountWorkspaceId({
        usageWorkspaceId,
        workspaces,
        rateLimitsByWorkspace,
        accountByWorkspace,
      }),
    [usageWorkspaceId, workspaces, rateLimitsByWorkspace, accountByWorkspace],
  );

  const homeAccountWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === homeAccountWorkspaceId) ?? null,
    [homeAccountWorkspaceId, workspaces],
  );

  const homeAccount = homeAccountWorkspaceId
    ? accountByWorkspace[homeAccountWorkspaceId] ?? null
    : null;
  const homeRateLimits = homeAccountWorkspaceId
    ? rateLimitsByWorkspace[homeAccountWorkspaceId] ?? null
    : null;

  useEffect(() => {
    if (!showHome || !homeAccountWorkspaceId || !homeAccountWorkspace?.connected) {
      return;
    }
    void refreshAccountInfo(homeAccountWorkspaceId);
    void refreshAccountRateLimits(homeAccountWorkspaceId);
  }, [
    homeAccountWorkspace?.connected,
    homeAccountWorkspaceId,
    refreshAccountInfo,
    refreshAccountRateLimits,
    showHome,
  ]);

  return {
    homeAccountWorkspace,
    homeAccountWorkspaceId,
    homeAccount,
    homeRateLimits,
  };
}
