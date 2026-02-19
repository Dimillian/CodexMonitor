import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject } from "react";
import type { TurnPlan } from "@/types";
import { interruptTurn as interruptTurnService } from "@services/tauri";
import { getThreadTimestamp } from "@utils/threadItems";
import {
  asString,
  normalizePlanUpdate,
  normalizeRateLimits,
  normalizeTokenUsage,
} from "@threads/utils/threadNormalize";
import type { ThreadAction } from "./useThreadsReducer";

type UseThreadTurnEventsOptions = {
  dispatch: Dispatch<ThreadAction>;
  planByThreadRef: MutableRefObject<Record<string, TurnPlan | null>>;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  isThreadHidden: (workspaceId: string, threadId: string) => boolean;
  markProcessing: (threadId: string, isProcessing: boolean) => void;
  markReviewing: (threadId: string, isReviewing: boolean) => void;
  setActiveTurnId: (threadId: string, turnId: string | null) => void;
  getActiveTurnId: (threadId: string) => string | null;
  pendingInterruptsRef: MutableRefObject<Set<string>>;
  pushThreadErrorMessage: (threadId: string, message: string) => void;
  safeMessageActivity: () => void;
  recordThreadActivity: (workspaceId: string, threadId: string, timestamp?: number) => void;
};

function normalizeThreadStatusType(status: Record<string, unknown>): string {
  const typeRaw = status.type ?? status.statusType ?? status.status_type;
  if (typeof typeRaw !== "string") {
    return "";
  }
  return typeRaw
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

export function useThreadTurnEvents({
  dispatch,
  planByThreadRef,
  getCustomName,
  isThreadHidden,
  markProcessing,
  markReviewing,
  setActiveTurnId,
  getActiveTurnId,
  pendingInterruptsRef,
  pushThreadErrorMessage,
  safeMessageActivity,
  recordThreadActivity,
}: UseThreadTurnEventsOptions) {
  const immediateActiveTurnIdByThreadRef = useRef<Record<string, string | null>>({});
  const lastReducerActiveTurnIdByThreadRef = useRef<Record<string, string | null>>({});
  const hasOptimisticActiveTurnByThreadRef = useRef<Record<string, boolean>>({});

  const getLatestKnownActiveTurnId = useCallback(
    (threadId: string) => {
      const reducerTurnId = getActiveTurnId(threadId);
      const lastReducerTurnId = lastReducerActiveTurnIdByThreadRef.current[threadId];
      const immediateTurnId = immediateActiveTurnIdByThreadRef.current[threadId];
      const hasOptimisticTurn =
        hasOptimisticActiveTurnByThreadRef.current[threadId] === true;

      if (hasOptimisticTurn && immediateTurnId !== undefined) {
        if (reducerTurnId === immediateTurnId) {
          // Reducer caught up with our optimistic write.
          hasOptimisticActiveTurnByThreadRef.current[threadId] = false;
        } else if (
          lastReducerTurnId !== undefined &&
          reducerTurnId !== lastReducerTurnId
        ) {
          // Reducer changed independently (e.g. resume hydration), so adopt it.
          hasOptimisticActiveTurnByThreadRef.current[threadId] = false;
          immediateActiveTurnIdByThreadRef.current[threadId] = reducerTurnId;
        } else {
          lastReducerActiveTurnIdByThreadRef.current[threadId] = reducerTurnId;
          return immediateTurnId;
        }
      }

      if (lastReducerTurnId !== reducerTurnId) {
        // Keep cache aligned with reducer when we are not in an optimistic window.
        lastReducerActiveTurnIdByThreadRef.current[threadId] = reducerTurnId;
        immediateActiveTurnIdByThreadRef.current[threadId] = reducerTurnId;
      }

      if (immediateTurnId !== undefined) {
        return immediateActiveTurnIdByThreadRef.current[threadId];
      }
      return reducerTurnId;
    },
    [getActiveTurnId],
  );

  const shouldClearCompletedPlan = useCallback((threadId: string, turnId: string) => {
    const plan = planByThreadRef.current[threadId];
    if (!plan || plan.steps.length === 0) {
      return false;
    }
    if (turnId && plan.turnId !== turnId) {
      return false;
    }
    return plan.steps.every((step) => step.status === "completed");
  }, [planByThreadRef]);

  const onThreadStarted = useCallback(
    (workspaceId: string, thread: Record<string, unknown>) => {
      const threadId = asString(thread.id);
      if (!threadId) {
        return;
      }
      if (isThreadHidden(workspaceId, threadId)) {
        return;
      }
      dispatch({ type: "ensureThread", workspaceId, threadId });
      const timestamp = getThreadTimestamp(thread);
      const activityTimestamp = timestamp > 0 ? timestamp : Date.now();
      recordThreadActivity(workspaceId, threadId, activityTimestamp);
      dispatch({
        type: "setThreadTimestamp",
        workspaceId,
        threadId,
        timestamp: activityTimestamp,
      });

      const customName = getCustomName(workspaceId, threadId);
      if (!customName) {
        const preview = asString(thread.preview).trim();
        if (preview) {
          const name = preview.length > 38 ? `${preview.slice(0, 38)}…` : preview;
          dispatch({ type: "setThreadName", workspaceId, threadId, name });
        }
      }
      safeMessageActivity();
    },
    [dispatch, getCustomName, isThreadHidden, recordThreadActivity, safeMessageActivity],
  );

  const onThreadNameUpdated = useCallback(
    (
      workspaceId: string,
      payload: { threadId: string; threadName: string | null },
    ) => {
      const { threadId, threadName } = payload;
      if (!threadId || !threadName) {
        return;
      }
      if (getCustomName(workspaceId, threadId)) {
        return;
      }
      dispatch({
        type: "setThreadName",
        workspaceId,
        threadId,
        name: threadName,
      });
    },
    [dispatch, getCustomName],
  );

  const onThreadArchived = useCallback(
    (workspaceId: string, threadId: string) => {
      if (!threadId) {
        return;
      }
      dispatch({ type: "removeThread", workspaceId, threadId });
    },
    [dispatch],
  );

  const onThreadUnarchived = useCallback(
    (workspaceId: string, threadId: string) => {
      if (!threadId) {
        return;
      }
      dispatch({ type: "ensureThread", workspaceId, threadId });
      const customName = getCustomName(workspaceId, threadId);
      if (customName) {
        dispatch({
          type: "setThreadName",
          workspaceId,
          threadId,
          name: customName,
        });
      }
      const timestamp = Date.now();
      dispatch({
        type: "setThreadTimestamp",
        workspaceId,
        threadId,
        timestamp,
      });
      recordThreadActivity(workspaceId, threadId, timestamp);
      safeMessageActivity();
    },
    [dispatch, getCustomName, recordThreadActivity, safeMessageActivity],
  );

  const onTurnStarted = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      dispatch({
        type: "ensureThread",
        workspaceId,
        threadId,
      });
      if (pendingInterruptsRef.current.has(threadId)) {
        pendingInterruptsRef.current.delete(threadId);
        if (turnId) {
          void interruptTurnService(workspaceId, threadId, turnId).catch(() => {});
        }
        return;
      }
      markProcessing(threadId, true);
      if (turnId) {
        lastReducerActiveTurnIdByThreadRef.current[threadId] =
          getActiveTurnId(threadId);
        hasOptimisticActiveTurnByThreadRef.current[threadId] = true;
        immediateActiveTurnIdByThreadRef.current[threadId] = turnId;
        setActiveTurnId(threadId, turnId);
      }
    },
    [dispatch, getActiveTurnId, markProcessing, pendingInterruptsRef, setActiveTurnId],
  );

  const onTurnCompleted = useCallback(
    (_workspaceId: string, threadId: string, turnId: string) => {
      const activeTurnId = getLatestKnownActiveTurnId(threadId);
      if (turnId && activeTurnId && turnId !== activeTurnId) {
        return;
      }
      markProcessing(threadId, false);
      hasOptimisticActiveTurnByThreadRef.current[threadId] = false;
      immediateActiveTurnIdByThreadRef.current[threadId] = null;
      setActiveTurnId(threadId, null);
      pendingInterruptsRef.current.delete(threadId);
      if (shouldClearCompletedPlan(threadId, turnId)) {
        dispatch({ type: "clearThreadPlan", threadId });
      }
    },
    [
      dispatch,
      getLatestKnownActiveTurnId,
      markProcessing,
      pendingInterruptsRef,
      setActiveTurnId,
      shouldClearCompletedPlan,
    ],
  );

  const onThreadStatusChanged = useCallback(
    (_workspaceId: string, threadId: string, status: Record<string, unknown>) => {
      const statusType = normalizeThreadStatusType(status);
      if (!statusType) {
        return;
      }
      if (statusType === "active") {
        markProcessing(threadId, true);
        return;
      }
      if (
        statusType === "idle" ||
        statusType === "notloaded" ||
        statusType === "systemerror"
      ) {
        markProcessing(threadId, false);
        hasOptimisticActiveTurnByThreadRef.current[threadId] = false;
        immediateActiveTurnIdByThreadRef.current[threadId] = null;
        setActiveTurnId(threadId, null);
        pendingInterruptsRef.current.delete(threadId);
      }
    },
    [markProcessing, pendingInterruptsRef, setActiveTurnId],
  );

  const onTurnPlanUpdated = useCallback(
    (
      workspaceId: string,
      threadId: string,
      turnId: string,
      payload: { explanation: unknown; plan: unknown },
    ) => {
      dispatch({ type: "ensureThread", workspaceId, threadId });
      const normalized = normalizePlanUpdate(
        turnId,
        payload.explanation,
        payload.plan,
      );
      dispatch({ type: "setThreadPlan", threadId, plan: normalized });
    },
    [dispatch],
  );

  const onTurnDiffUpdated = useCallback(
    (workspaceId: string, threadId: string, diff: string) => {
      dispatch({ type: "ensureThread", workspaceId, threadId });
      dispatch({ type: "setThreadTurnDiff", threadId, diff });
    },
    [dispatch],
  );

  const onThreadTokenUsageUpdated = useCallback(
    (
      workspaceId: string,
      threadId: string,
      tokenUsage: Record<string, unknown> | null,
    ) => {
      dispatch({ type: "ensureThread", workspaceId, threadId });
      dispatch({
        type: "setThreadTokenUsage",
        threadId,
        tokenUsage: normalizeTokenUsage(tokenUsage),
      });
    },
    [dispatch],
  );

  const onAccountRateLimitsUpdated = useCallback(
    (workspaceId: string, rateLimits: Record<string, unknown>) => {
      dispatch({
        type: "setRateLimits",
        workspaceId,
        rateLimits: normalizeRateLimits(rateLimits),
      });
    },
    [dispatch],
  );

  const onTurnError = useCallback(
    (
      workspaceId: string,
      threadId: string,
      turnId: string,
      payload: { message: string; willRetry: boolean },
    ) => {
      if (payload.willRetry) {
        return;
      }
      const activeTurnId = getLatestKnownActiveTurnId(threadId);
      if (turnId && activeTurnId && turnId !== activeTurnId) {
        return;
      }
      dispatch({ type: "ensureThread", workspaceId, threadId });
      markProcessing(threadId, false);
      markReviewing(threadId, false);
      hasOptimisticActiveTurnByThreadRef.current[threadId] = false;
      immediateActiveTurnIdByThreadRef.current[threadId] = null;
      setActiveTurnId(threadId, null);
      const message = payload.message
        ? `Turn failed: ${payload.message}`
        : "Turn failed.";
      pushThreadErrorMessage(threadId, message);
      safeMessageActivity();
    },
    [
      dispatch,
      getLatestKnownActiveTurnId,
      markProcessing,
      markReviewing,
      pushThreadErrorMessage,
      safeMessageActivity,
      setActiveTurnId,
    ],
  );

  return {
    onThreadStarted,
    onThreadNameUpdated,
    onThreadArchived,
    onThreadUnarchived,
    onTurnStarted,
    onTurnCompleted,
    onThreadStatusChanged,
    onTurnPlanUpdated,
    onTurnDiffUpdated,
    onThreadTokenUsageUpdated,
    onAccountRateLimitsUpdated,
    onTurnError,
  };
}
