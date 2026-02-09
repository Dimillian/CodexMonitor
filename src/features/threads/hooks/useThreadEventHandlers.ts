import { useCallback, useMemo } from "react";
import type { Dispatch, MutableRefObject } from "react";
import type { AppServerEvent, DebugEntry, TurnPlan } from "../../../types";
import { getAppServerRawMethod } from "../../../utils/appServerEvents";
import { useThreadApprovalEvents } from "./useThreadApprovalEvents";
import { useThreadItemEvents } from "./useThreadItemEvents";
import { useThreadTurnEvents } from "./useThreadTurnEvents";
import { useThreadUserInputEvents } from "./useThreadUserInputEvents";
import type { ThreadAction } from "./useThreadsReducer";

type ThreadEventHandlersOptions = {
  activeThreadId: string | null;
  dispatch: Dispatch<ThreadAction>;
  planByThreadRef: MutableRefObject<Record<string, TurnPlan | null>>;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  isThreadHidden: (workspaceId: string, threadId: string) => boolean;
  markProcessing: (threadId: string, isProcessing: boolean) => void;
  markReviewing: (threadId: string, isReviewing: boolean) => void;
  setActiveTurnId: (threadId: string, turnId: string | null) => void;
  safeMessageActivity: () => void;
  recordThreadActivity: (
    workspaceId: string,
    threadId: string,
    timestamp?: number,
  ) => void;
  onUserMessageCreated?: (
    workspaceId: string,
    threadId: string,
    text: string,
  ) => void | Promise<void>;
  pushThreadErrorMessage: (threadId: string, message: string) => void;
  onDebug?: (entry: DebugEntry) => void;
  onWorkspaceConnected: (workspaceId: string) => void;
  applyCollabThreadLinks: (
    threadId: string,
    item: Record<string, unknown>,
  ) => void;
  onReviewExited?: (workspaceId: string, threadId: string) => void;
  approvalAllowlistRef: MutableRefObject<Record<string, string[][]>>;
  pendingInterruptsRef: MutableRefObject<Set<string>>;
};

export function useThreadEventHandlers({
  activeThreadId,
  dispatch,
  planByThreadRef,
  getCustomName,
  isThreadHidden,
  markProcessing,
  markReviewing,
  setActiveTurnId,
  safeMessageActivity,
  recordThreadActivity,
  onUserMessageCreated,
  pushThreadErrorMessage,
  onDebug,
  onWorkspaceConnected,
  applyCollabThreadLinks,
  onReviewExited,
  approvalAllowlistRef,
  pendingInterruptsRef,
}: ThreadEventHandlersOptions) {
  const onApprovalRequest = useThreadApprovalEvents({
    dispatch,
    approvalAllowlistRef,
  });
  const onRequestUserInput = useThreadUserInputEvents({ dispatch });

  const {
    onAgentMessageDelta,
    onAgentMessageCompleted,
    onItemStarted,
    onItemCompleted,
    onReasoningSummaryDelta,
    onReasoningSummaryBoundary,
    onReasoningTextDelta,
    onPlanDelta,
    onCommandOutputDelta,
    onTerminalInteraction,
    onFileChangeOutputDelta,
  } = useThreadItemEvents({
    activeThreadId,
    dispatch,
    getCustomName,
    markProcessing,
    markReviewing,
    safeMessageActivity,
    recordThreadActivity,
    applyCollabThreadLinks,
    onUserMessageCreated,
    onReviewExited,
  });

  const {
    onThreadStarted,
    onThreadNameUpdated,
    onTurnStarted,
    onTurnCompleted,
    onTurnPlanUpdated,
    onTurnDiffUpdated,
    onThreadTokenUsageUpdated,
    onAccountRateLimitsUpdated,
    onTurnError,
  } = useThreadTurnEvents({
    dispatch,
    planByThreadRef,
    getCustomName,
    isThreadHidden,
    markProcessing,
    markReviewing,
    setActiveTurnId,
    pendingInterruptsRef,
    pushThreadErrorMessage,
    safeMessageActivity,
    recordThreadActivity,
  });

  const onBackgroundThreadAction = useCallback(
    (workspaceId: string, threadId: string, action: string) => {
      if (action !== "hide") {
        return;
      }
      dispatch({ type: "hideThread", workspaceId, threadId });
    },
    [dispatch],
  );

  const onAppServerEvent = useCallback(
    (event: AppServerEvent) => {
      const method = getAppServerRawMethod(event) ?? "";
      const inferredSource = method === "codex/stderr" ? "stderr" : "event";
      onDebug?.({
        id: `${Date.now()}-server-event`,
        timestamp: Date.now(),
        source: inferredSource,
        label: method || "event",
        payload: event,
      });
    },
    [onDebug],
  );

  const handlers = useMemo(
    () => ({
      onWorkspaceConnected,
      onApprovalRequest,
      onRequestUserInput,
      onBackgroundThreadAction,
      onAppServerEvent,
      onAgentMessageDelta,
      onAgentMessageCompleted,
      onItemStarted,
      onItemCompleted,
      onReasoningSummaryDelta,
      onReasoningSummaryBoundary,
      onReasoningTextDelta,
      onPlanDelta,
      onCommandOutputDelta,
      onTerminalInteraction,
      onFileChangeOutputDelta,
      onThreadStarted,
      onThreadNameUpdated,
      onTurnStarted,
      onTurnCompleted,
      onTurnPlanUpdated,
      onTurnDiffUpdated,
      onThreadTokenUsageUpdated,
      onAccountRateLimitsUpdated,
      onTurnError,
    }),
    [
      onWorkspaceConnected,
      onApprovalRequest,
      onRequestUserInput,
      onBackgroundThreadAction,
      onAppServerEvent,
      onAgentMessageDelta,
      onAgentMessageCompleted,
      onItemStarted,
      onItemCompleted,
      onReasoningSummaryDelta,
      onReasoningSummaryBoundary,
      onReasoningTextDelta,
      onPlanDelta,
      onCommandOutputDelta,
      onTerminalInteraction,
      onFileChangeOutputDelta,
      onThreadStarted,
      onThreadNameUpdated,
      onTurnStarted,
      onTurnCompleted,
      onTurnPlanUpdated,
      onTurnDiffUpdated,
      onThreadTokenUsageUpdated,
      onAccountRateLimitsUpdated,
      onTurnError,
    ],
  );

  return handlers;
}
