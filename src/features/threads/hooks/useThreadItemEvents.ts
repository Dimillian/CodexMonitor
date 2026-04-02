import { startTransition, useCallback, useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { buildConversationItem } from "@utils/threadItems";
import type { CollabAgentRef } from "@/types";
import {
  buildItemForDisplay,
  handleConvertedItemEffects,
} from "./threadItemEventHelpers";
import type { ThreadAction } from "./useThreadsReducer";

type UseThreadItemEventsOptions = {
  activeThreadId: string | null;
  dispatch: Dispatch<ThreadAction>;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  markProcessing: (threadId: string, isProcessing: boolean) => void;
  markReviewing: (threadId: string, isReviewing: boolean) => void;
  safeMessageActivity: () => void;
  recordThreadActivity: (
    workspaceId: string,
    threadId: string,
    timestamp?: number,
  ) => void;
  applyCollabThreadLinks: (
    workspaceId: string,
    threadId: string,
    item: Record<string, unknown>,
  ) => void;
  hydrateSubagentThreads?: (
    workspaceId: string,
    receivers: CollabAgentRef[],
  ) => void | Promise<void>;
  onUserMessageCreated?: (
    workspaceId: string,
    threadId: string,
    text: string,
  ) => void | Promise<void>;
  onReviewExited?: (workspaceId: string, threadId: string) => void;
};

const STREAM_BATCH_WINDOW_MS = 64;

type BufferedStreamAction =
  | {
      type: "appendAgentDelta";
      workspaceId: string;
      threadId: string;
      itemId: string;
      delta: string;
      hasCustomName: boolean;
    }
  | {
      type: "appendReasoningSummary" | "appendReasoningContent" | "appendPlanDelta" | "appendToolOutput";
      threadId: string;
      itemId: string;
      delta: string;
    };

function bufferedStreamKey(action: BufferedStreamAction) {
  return `${action.type}:${action.threadId}:${action.itemId}`;
}

export function useThreadItemEvents({
  activeThreadId,
  dispatch,
  getCustomName,
  markProcessing,
  markReviewing,
  safeMessageActivity,
  recordThreadActivity,
  applyCollabThreadLinks,
  hydrateSubagentThreads,
  onUserMessageCreated,
  onReviewExited,
}: UseThreadItemEventsOptions) {
  const pendingStreamActionsRef = useRef<Map<string, BufferedStreamAction>>(new Map());
  const flushTimerRef = useRef<number | null>(null);

  const flushBufferedActions = useCallback(
    (matcher?: (action: BufferedStreamAction) => boolean) => {
      const pending = pendingStreamActionsRef.current;
      if (pending.size === 0) {
        return;
      }

      const selected: BufferedStreamAction[] = [];
      for (const [key, action] of pending.entries()) {
        if (!matcher || matcher(action)) {
          selected.push(action);
          pending.delete(key);
        }
      }

      if (selected.length === 0) {
        return;
      }

      if (flushTimerRef.current !== null && pending.size === 0) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      startTransition(() => {
        const ensuredThreads = new Set<string>();
        selected.forEach((action) => {
          if (action.type === "appendAgentDelta") {
            const ensureKey = `${action.workspaceId}:${action.threadId}`;
            if (!ensuredThreads.has(ensureKey)) {
              ensuredThreads.add(ensureKey);
              dispatch({
                type: "ensureThread",
                workspaceId: action.workspaceId,
                threadId: action.threadId,
              });
            }
            dispatch(action);
            return;
          }
          dispatch(action);
        });
      });

      safeMessageActivity();
    },
    [dispatch, safeMessageActivity],
  );

  const scheduleBufferedFlush = useCallback(() => {
    if (flushTimerRef.current !== null) {
      return;
    }
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flushBufferedActions();
    }, STREAM_BATCH_WINDOW_MS);
  }, [flushBufferedActions]);

  const queueBufferedAction = useCallback(
    (action: BufferedStreamAction) => {
      const key = bufferedStreamKey(action);
      const existing = pendingStreamActionsRef.current.get(key);
      if (existing) {
        pendingStreamActionsRef.current.set(key, {
          ...existing,
          delta: `${existing.delta}${action.delta}`,
        } as BufferedStreamAction);
      } else {
        pendingStreamActionsRef.current.set(key, action);
      }
      scheduleBufferedFlush();
    },
    [scheduleBufferedFlush],
  );

  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
      pendingStreamActionsRef.current.clear();
    };
  }, []);

  const handleItemUpdate = useCallback(
    (
      workspaceId: string,
      threadId: string,
      item: Record<string, unknown>,
      shouldMarkProcessing: boolean,
    ) => {
      flushBufferedActions((action) => action.threadId === threadId);
      dispatch({ type: "ensureThread", workspaceId, threadId });
      if (shouldMarkProcessing) {
        markProcessing(threadId, true);
      }
      applyCollabThreadLinks(workspaceId, threadId, item);
      const itemType = String(item?.type ?? "");
      if (itemType === "enteredReviewMode") {
        markReviewing(threadId, true);
      } else if (itemType === "exitedReviewMode") {
        markReviewing(threadId, false);
        markProcessing(threadId, false);
        if (!shouldMarkProcessing) {
          onReviewExited?.(workspaceId, threadId);
        }
      }
      const itemForDisplay = buildItemForDisplay(item, shouldMarkProcessing);
      const converted = buildConversationItem(itemForDisplay);
      handleConvertedItemEffects({
        converted,
        workspaceId,
        threadId,
        hydrateSubagentThreads,
        onUserMessageCreated,
      });
      if (converted) {
        dispatch({
          type: "upsertItem",
          workspaceId,
          threadId,
          item: converted,
          hasCustomName: Boolean(getCustomName(workspaceId, threadId)),
        });
      }
      safeMessageActivity();
    },
    [
      applyCollabThreadLinks,
      dispatch,
      flushBufferedActions,
      getCustomName,
      markProcessing,
      markReviewing,
      onReviewExited,
      onUserMessageCreated,
      hydrateSubagentThreads,
      safeMessageActivity,
    ],
  );

  const handleToolOutputDelta = useCallback(
    (threadId: string, itemId: string, delta: string) => {
      markProcessing(threadId, true);
      queueBufferedAction({ type: "appendToolOutput", threadId, itemId, delta });
    },
    [markProcessing, queueBufferedAction],
  );

  const handleTerminalInteraction = useCallback(
    (threadId: string, itemId: string, stdin: string) => {
      if (!stdin) {
        return;
      }
      const normalized = stdin.replace(/\r\n/g, "\n");
      const suffix = normalized.endsWith("\n") ? "" : "\n";
      handleToolOutputDelta(threadId, itemId, `\n[stdin]\n${normalized}${suffix}`);
    },
    [handleToolOutputDelta],
  );

  const onAgentMessageDelta = useCallback(
    ({
      workspaceId,
      threadId,
      itemId,
      delta,
    }: {
      workspaceId: string;
      threadId: string;
      itemId: string;
      delta: string;
    }) => {
      markProcessing(threadId, true);
      queueBufferedAction({
        type: "appendAgentDelta",
        workspaceId,
        threadId,
        itemId,
        delta,
        hasCustomName: Boolean(getCustomName(workspaceId, threadId)),
      });
    },
    [getCustomName, markProcessing, queueBufferedAction],
  );

  const onAgentMessageCompleted = useCallback(
    ({
      workspaceId,
      threadId,
      itemId,
      text,
    }: {
      workspaceId: string;
      threadId: string;
      itemId: string;
      text: string;
    }) => {
      flushBufferedActions(
        (action) =>
          action.threadId === threadId &&
          action.itemId === itemId,
      );
      const timestamp = Date.now();
      dispatch({ type: "ensureThread", workspaceId, threadId });
      const hasCustomName = Boolean(getCustomName(workspaceId, threadId));
      dispatch({
        type: "completeAgentMessage",
        workspaceId,
        threadId,
        itemId,
        text,
        hasCustomName,
      });
      dispatch({
        type: "setThreadTimestamp",
        workspaceId,
        threadId,
        timestamp,
      });
      dispatch({
        type: "setLastAgentMessage",
        threadId,
        text,
        timestamp,
      });
      recordThreadActivity(workspaceId, threadId, timestamp);
      safeMessageActivity();
      if (threadId !== activeThreadId) {
        dispatch({ type: "markUnread", threadId, hasUnread: true });
      }
    },
    [
      activeThreadId,
      dispatch,
      flushBufferedActions,
      getCustomName,
      recordThreadActivity,
      safeMessageActivity,
    ],
  );

  const onItemStarted = useCallback(
    (workspaceId: string, threadId: string, item: Record<string, unknown>) => {
      handleItemUpdate(workspaceId, threadId, item, true);
    },
    [handleItemUpdate],
  );

  const onItemCompleted = useCallback(
    (workspaceId: string, threadId: string, item: Record<string, unknown>) => {
      handleItemUpdate(workspaceId, threadId, item, false);
    },
    [handleItemUpdate],
  );

  const onReasoningSummaryDelta = useCallback(
    (_workspaceId: string, threadId: string, itemId: string, delta: string) => {
      queueBufferedAction({ type: "appendReasoningSummary", threadId, itemId, delta });
    },
    [queueBufferedAction],
  );

  const onReasoningSummaryBoundary = useCallback(
    (_workspaceId: string, threadId: string, itemId: string) => {
      flushBufferedActions(
        (action) =>
          action.threadId === threadId &&
          action.itemId === itemId &&
          action.type === "appendReasoningSummary",
      );
      dispatch({ type: "appendReasoningSummaryBoundary", threadId, itemId });
    },
    [dispatch, flushBufferedActions],
  );

  const onReasoningTextDelta = useCallback(
    (_workspaceId: string, threadId: string, itemId: string, delta: string) => {
      queueBufferedAction({ type: "appendReasoningContent", threadId, itemId, delta });
    },
    [queueBufferedAction],
  );

  const onPlanDelta = useCallback(
    (_workspaceId: string, threadId: string, itemId: string, delta: string) => {
      queueBufferedAction({ type: "appendPlanDelta", threadId, itemId, delta });
    },
    [queueBufferedAction],
  );

  const onCommandOutputDelta = useCallback(
    (_workspaceId: string, threadId: string, itemId: string, delta: string) => {
      handleToolOutputDelta(threadId, itemId, delta);
    },
    [handleToolOutputDelta],
  );

  const onTerminalInteraction = useCallback(
    (_workspaceId: string, threadId: string, itemId: string, stdin: string) => {
      handleTerminalInteraction(threadId, itemId, stdin);
    },
    [handleTerminalInteraction],
  );

  const onFileChangeOutputDelta = useCallback(
    (_workspaceId: string, threadId: string, itemId: string, delta: string) => {
      handleToolOutputDelta(threadId, itemId, delta);
    },
    [handleToolOutputDelta],
  );

  return {
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
  };
}
