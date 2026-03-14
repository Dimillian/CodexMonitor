import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AccountSnapshot,
  RateLimitSnapshot,
  ThreadSummary,
  WorkspaceInfo,
} from "@/types";

type UseHomeAccountArgs = {
  showHome: boolean;
  usageWorkspaceId: string | null;
  workspaces: WorkspaceInfo[];
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadListLoadingByWorkspace: Record<string, boolean | undefined>;
  rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null | undefined>;
  accountByWorkspace: Record<string, AccountSnapshot | null | undefined>;
  refreshAccountInfo: (workspaceId: string) => Promise<void> | void;
  refreshAccountRateLimits: (workspaceId: string) => Promise<void> | void;
};

type ResolveHomeAccountWorkspaceIdArgs = Pick<
  UseHomeAccountArgs,
  | "usageWorkspaceId"
  | "workspaces"
  | "threadsByWorkspace"
  | "rateLimitsByWorkspace"
  | "accountByWorkspace"
>;

type AggregateHomeAccountSelectionState = {
  workspaceId: string | null;
  isCommitted: boolean;
};

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

function getWorkspaceLatestThreadUpdatedAt(
  workspaceId: string,
  threadsByWorkspace: Record<string, ThreadSummary[]>,
): number {
  const threads = threadsByWorkspace[workspaceId] ?? [];
  return threads.reduce(
    (latestUpdatedAt, thread) =>
      thread.updatedAt > latestUpdatedAt ? thread.updatedAt : latestUpdatedAt,
    0,
  );
}

function workspaceHasAccountData(
  workspace: WorkspaceInfo,
  rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null | undefined>,
  accountByWorkspace: Record<string, AccountSnapshot | null | undefined>,
): boolean {
  const account = accountByWorkspace[workspace.id];
  const rateLimits = rateLimitsByWorkspace[workspace.id];
  return hasUsableAccountSnapshot(account) || hasUsableRateLimitSnapshot(rateLimits);
}

function hasConnectedWorkspaceWithAccountData(
  workspaces: WorkspaceInfo[],
  rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null | undefined>,
  accountByWorkspace: Record<string, AccountSnapshot | null | undefined>,
): boolean {
  return workspaces.some(
    (workspace) =>
      workspace.connected &&
      workspaceHasAccountData(workspace, rateLimitsByWorkspace, accountByWorkspace),
  );
}

function canRetainAggregateHomeAccountWorkspaceId(
  workspaceId: string | null,
  workspaces: WorkspaceInfo[],
  aggregateThreadListsSettled: boolean,
  rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null | undefined>,
  accountByWorkspace: Record<string, AccountSnapshot | null | undefined>,
): boolean {
  if (!workspaceId) {
    return false;
  }

  const workspace = workspaces.find((entry) => entry.id === workspaceId);
  if (!workspace) {
    return false;
  }

  if (
    aggregateThreadListsSettled &&
    !workspace.connected &&
    hasConnectedWorkspaceWithAccountData(
      workspaces,
      rateLimitsByWorkspace,
      accountByWorkspace,
    )
  ) {
    return false;
  }

  return workspaceHasAccountData(workspace, rateLimitsByWorkspace, accountByWorkspace);
}

function haveAggregateThreadListsSettled(
  workspaces: WorkspaceInfo[],
  threadListLoadingByWorkspace: Record<string, boolean | undefined>,
): boolean {
  const connectedWorkspaces = workspaces.filter((workspace) => workspace.connected);
  if (connectedWorkspaces.length === 0) {
    return true;
  }

  return connectedWorkspaces.every((workspace) =>
    Object.prototype.hasOwnProperty.call(threadListLoadingByWorkspace, workspace.id) &&
    threadListLoadingByWorkspace[workspace.id] === false,
  );
}

export function resolveHomeAccountWorkspaceId({
  usageWorkspaceId,
  workspaces,
  threadsByWorkspace,
  rateLimitsByWorkspace,
  accountByWorkspace,
}: ResolveHomeAccountWorkspaceIdArgs): string | null {
  const workspaceHasCurrentAccountData = (workspace: WorkspaceInfo) =>
    workspaceHasAccountData(workspace, rateLimitsByWorkspace, accountByWorkspace);
  const workspaceIndexById = new Map(
    workspaces.map((workspace, index) => [workspace.id, index]),
  );
  const workspaceLatestThreadUpdatedAtById = new Map(
    workspaces.map((workspace) => [
      workspace.id,
      getWorkspaceLatestThreadUpdatedAt(workspace.id, threadsByWorkspace),
    ]),
  );
  const workspaceOrder = [...workspaces].sort((left, right) => {
    const activityDelta =
      (workspaceLatestThreadUpdatedAtById.get(right.id) ?? 0) -
      (workspaceLatestThreadUpdatedAtById.get(left.id) ?? 0);
    if (activityDelta !== 0) {
      return activityDelta;
    }
    return (workspaceIndexById.get(left.id) ?? 0) - (workspaceIndexById.get(right.id) ?? 0);
  });

  if (usageWorkspaceId && workspaces.some((workspace) => workspace.id === usageWorkspaceId)) {
    return usageWorkspaceId;
  }

  const connectedWorkspaceWithAccountData = workspaceOrder.find(
    (workspace) => workspace.connected && workspaceHasCurrentAccountData(workspace),
  );
  if (connectedWorkspaceWithAccountData) {
    return connectedWorkspaceWithAccountData.id;
  }

  const connectedWorkspace = workspaceOrder.find((workspace) => workspace.connected);
  if (connectedWorkspace) {
    return connectedWorkspace.id;
  }

  const workspaceWithAccountData = workspaceOrder.find(workspaceHasCurrentAccountData);
  if (workspaceWithAccountData) {
    return workspaceWithAccountData.id;
  }

  return workspaceOrder[0]?.id ?? null;
}

export function useHomeAccount({
  showHome,
  usageWorkspaceId,
  workspaces,
  threadsByWorkspace,
  threadListLoadingByWorkspace,
  rateLimitsByWorkspace,
  accountByWorkspace,
  refreshAccountInfo,
  refreshAccountRateLimits,
}: UseHomeAccountArgs) {
  const refreshAccountInfoRef = useRef(refreshAccountInfo);
  const refreshAccountRateLimitsRef = useRef(refreshAccountRateLimits);
  const resolvedHomeAccountWorkspaceId = useMemo(
    () =>
      resolveHomeAccountWorkspaceId({
        usageWorkspaceId,
        workspaces,
        threadsByWorkspace,
        rateLimitsByWorkspace,
        accountByWorkspace,
      }),
    [
      usageWorkspaceId,
      workspaces,
      threadsByWorkspace,
      rateLimitsByWorkspace,
      accountByWorkspace,
    ],
  );

  useEffect(() => {
    refreshAccountInfoRef.current = refreshAccountInfo;
  }, [refreshAccountInfo]);

  useEffect(() => {
    refreshAccountRateLimitsRef.current = refreshAccountRateLimits;
  }, [refreshAccountRateLimits]);

  const aggregateThreadListsSettled = useMemo(
    () =>
      usageWorkspaceId
        ? false
        : haveAggregateThreadListsSettled(workspaces, threadListLoadingByWorkspace),
    [threadListLoadingByWorkspace, usageWorkspaceId, workspaces],
  );
  const [aggregateHomeAccountSelection, setAggregateHomeAccountSelection] =
    useState<AggregateHomeAccountSelectionState>(() => ({
      workspaceId: usageWorkspaceId ? null : resolvedHomeAccountWorkspaceId,
      isCommitted: usageWorkspaceId ? false : aggregateThreadListsSettled,
    }));

  const stableHomeAccountWorkspaceId = useMemo(() => {
    if (usageWorkspaceId && workspaces.some((workspace) => workspace.id === usageWorkspaceId)) {
      return usageWorkspaceId;
    }

    if (
      aggregateHomeAccountSelection.isCommitted &&
      canRetainAggregateHomeAccountWorkspaceId(
        aggregateHomeAccountSelection.workspaceId,
        workspaces,
        aggregateThreadListsSettled,
        rateLimitsByWorkspace,
        accountByWorkspace,
      )
    ) {
      return aggregateHomeAccountSelection.workspaceId;
    }

    return resolvedHomeAccountWorkspaceId;
  }, [
    accountByWorkspace,
    aggregateThreadListsSettled,
    aggregateHomeAccountSelection,
    resolvedHomeAccountWorkspaceId,
    rateLimitsByWorkspace,
    usageWorkspaceId,
    workspaces,
  ]);

  useEffect(() => {
    if (usageWorkspaceId) {
      if (
        aggregateHomeAccountSelection.workspaceId !== null ||
        aggregateHomeAccountSelection.isCommitted
      ) {
        setAggregateHomeAccountSelection({
          workspaceId: null,
          isCommitted: false,
        });
      }
      return;
    }

    const nextSelection: AggregateHomeAccountSelectionState = {
      workspaceId: stableHomeAccountWorkspaceId,
      isCommitted:
        aggregateHomeAccountSelection.workspaceId === stableHomeAccountWorkspaceId
          ? aggregateHomeAccountSelection.isCommitted || aggregateThreadListsSettled
          : aggregateThreadListsSettled,
    };
    if (
      aggregateHomeAccountSelection.workspaceId !== nextSelection.workspaceId ||
      aggregateHomeAccountSelection.isCommitted !== nextSelection.isCommitted
    ) {
      setAggregateHomeAccountSelection(nextSelection);
    }
  }, [
    aggregateHomeAccountSelection,
    aggregateThreadListsSettled,
    stableHomeAccountWorkspaceId,
    usageWorkspaceId,
  ]);

  const homeAccountWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === stableHomeAccountWorkspaceId) ?? null,
    [stableHomeAccountWorkspaceId, workspaces],
  );

  const stableHomeAccount = stableHomeAccountWorkspaceId
    ? accountByWorkspace[stableHomeAccountWorkspaceId] ?? null
    : null;
  const stableHomeRateLimits = stableHomeAccountWorkspaceId
    ? rateLimitsByWorkspace[stableHomeAccountWorkspaceId] ?? null
    : null;

  useEffect(() => {
    if (!showHome || !stableHomeAccountWorkspaceId || !homeAccountWorkspace?.connected) {
      return;
    }
    void refreshAccountInfoRef.current(stableHomeAccountWorkspaceId);
    void refreshAccountRateLimitsRef.current(stableHomeAccountWorkspaceId);
  }, [
    homeAccountWorkspace?.connected,
    showHome,
    stableHomeAccountWorkspaceId,
  ]);

  return {
    homeAccountWorkspace,
    homeAccountWorkspaceId: stableHomeAccountWorkspaceId,
    homeAccount: stableHomeAccount,
    homeRateLimits: stableHomeRateLimits,
  };
}
