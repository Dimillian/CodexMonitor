import { useCallback, useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { buildConversationItem } from "../../../utils/threadItems";
import { asString } from "../utils/threadNormalize";
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
    threadId: string,
    item: Record<string, unknown>,
  ) => void;
  onUserMessageCreated?: (
    workspaceId: string,
    threadId: string,
    text: string,
  ) => void | Promise<void>;
  onReviewExited?: (workspaceId: string, threadId: string) => void;
};

type PendingAgentDelta = {
  workspaceId: string;
  threadId: string;
  itemId: string;
  delta: string;
  hasCustomName: boolean;
  turnId: string | null;
};

function deltaKey(workspaceId: string, threadId: string, itemId: string) {
  return `${workspaceId}::${threadId}::${itemId}`;
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
  onUserMessageCreated,
  onReviewExited,
}: UseThreadItemEventsOptions) {
  const pendingAgentDeltasRef = useRef<Map<string, PendingAgentDelta>>(new Map());
  const pendingAgentDeltaFrameRef = useRef<number | null>(null);

  const flushPendingAgentDeltas = useCallback(() => {
    pendingAgentDeltaFrameRef.current = null;
    if (pendingAgentDeltasRef.current.size === 0) {
      return;
    }
    const pending = Array.from(pendingAgentDeltasRef.current.values());
    pendingAgentDeltasRef.current.clear();
    for (const entry of pending) {
      dispatch({
        type: "appendAgentDelta",
        workspaceId: entry.workspaceId,
        threadId: entry.threadId,
        itemId: entry.itemId,
        delta: entry.delta,
        hasCustomName: entry.hasCustomName,
        turnId: entry.turnId,
      });
    }
  }, [dispatch]);

  const schedulePendingAgentDeltaFlush = useCallback(() => {
    if (pendingAgentDeltaFrameRef.current !== null) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      pendingAgentDeltaFrameRef.current = window.requestAnimationFrame(() => {
        flushPendingAgentDeltas();
      });
      return;
    }
    pendingAgentDeltaFrameRef.current = window.setTimeout(() => {
      flushPendingAgentDeltas();
    }, 16) as unknown as number;
  }, [flushPendingAgentDeltas]);

  useEffect(() => {
    return () => {
      const frameId = pendingAgentDeltaFrameRef.current;
      pendingAgentDeltaFrameRef.current = null;
      if (frameId !== null && typeof window !== "undefined") {
        if (typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(frameId);
        } else {
          window.clearTimeout(frameId);
        }
      }
      flushPendingAgentDeltas();
    };
  }, [flushPendingAgentDeltas]);

  const handleItemUpdate = useCallback(
    (
      workspaceId: string,
      threadId: string,
      item: Record<string, unknown>,
      shouldMarkProcessing: boolean,
    ) => {
      dispatch({ type: "ensureThread", workspaceId, threadId });
      if (shouldMarkProcessing) {
        markProcessing(threadId, true);
      }
      applyCollabThreadLinks(threadId, item);
      const itemType = asString(item?.type ?? "");
      if (itemType === "enteredReviewMode") {
        markReviewing(threadId, true);
      } else if (itemType === "exitedReviewMode") {
        markReviewing(threadId, false);
        markProcessing(threadId, false);
        if (!shouldMarkProcessing) {
          onReviewExited?.(workspaceId, threadId);
        }
      }
      const itemForDisplay =
        itemType === "contextCompaction"
          ? ({
              ...item,
              status: shouldMarkProcessing ? "inProgress" : "completed",
            } as Record<string, unknown>)
          : item;
      const converted = buildConversationItem(itemForDisplay);
      if (converted) {
        if (converted.kind === "message" && converted.role === "user") {
          void onUserMessageCreated?.(workspaceId, threadId, converted.text);
        }
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
      getCustomName,
      markProcessing,
      markReviewing,
      onReviewExited,
      onUserMessageCreated,
      safeMessageActivity,
    ],
  );

  const handleToolOutputDelta = useCallback(
    (threadId: string, itemId: string, delta: string) => {
      markProcessing(threadId, true);
      dispatch({ type: "appendToolOutput", threadId, itemId, delta });
      safeMessageActivity();
    },
    [dispatch, markProcessing, safeMessageActivity],
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
      turnId = null,
    }: {
      workspaceId: string;
      threadId: string;
      itemId: string;
      delta: string;
      turnId?: string | null;
    }) => {
      dispatch({ type: "ensureThread", workspaceId, threadId });
      markProcessing(threadId, true);
      const hasCustomName = Boolean(getCustomName(workspaceId, threadId));
      const key = deltaKey(workspaceId, threadId, itemId);
      const existing = pendingAgentDeltasRef.current.get(key);
      if (existing) {
        pendingAgentDeltasRef.current.set(key, {
          ...existing,
          delta: `${existing.delta}${delta}`,
          hasCustomName: existing.hasCustomName || hasCustomName,
          turnId: turnId ?? existing.turnId,
        });
      } else {
        pendingAgentDeltasRef.current.set(key, {
          workspaceId,
          threadId,
          itemId,
          delta,
          hasCustomName,
          turnId,
        });
      }
      schedulePendingAgentDeltaFlush();
    },
    [dispatch, getCustomName, markProcessing, schedulePendingAgentDeltaFlush],
  );

  const onAgentMessageCompleted = useCallback(
    ({
      workspaceId,
      threadId,
      itemId,
      text,
      turnId = null,
    }: {
      workspaceId: string;
      threadId: string;
      itemId: string;
      text: string;
      turnId?: string | null;
    }) => {
      flushPendingAgentDeltas();
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
        turnId,
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
      flushPendingAgentDeltas,
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
      dispatch({ type: "appendReasoningSummary", threadId, itemId, delta });
    },
    [dispatch],
  );

  const onReasoningSummaryBoundary = useCallback(
    (_workspaceId: string, threadId: string, itemId: string) => {
      dispatch({ type: "appendReasoningSummaryBoundary", threadId, itemId });
    },
    [dispatch],
  );

  const onReasoningTextDelta = useCallback(
    (_workspaceId: string, threadId: string, itemId: string, delta: string) => {
      dispatch({ type: "appendReasoningContent", threadId, itemId, delta });
    },
    [dispatch],
  );

  const onPlanDelta = useCallback(
    (_workspaceId: string, threadId: string, itemId: string, delta: string) => {
      dispatch({ type: "appendPlanDelta", threadId, itemId, delta });
    },
    [dispatch],
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
