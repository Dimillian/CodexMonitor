import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, MutableRefObject } from "react";
import type { AppServerEvent, DebugEntry, TurnPlan } from "../../../types";
import { getAppServerRawMethod } from "../../../utils/appServerEvents";
import { useThreadApprovalEvents } from "./useThreadApprovalEvents";
import { useThreadItemEvents } from "./useThreadItemEvents";
import { useThreadTurnEvents } from "./useThreadTurnEvents";
import { useThreadUserInputEvents } from "./useThreadUserInputEvents";
import type { ThreadAction } from "./useThreadsReducer";

const STDERR_BATCH_WINDOW_MS = 350;
const STDERR_SAMPLE_LIMIT = 3;
const STDERR_TOP_SIGNATURE_LIMIT = 3;
const ANSI_ESCAPE_CHAR = String.fromCharCode(27);
const ANSI_SEQUENCE_PATTERN = new RegExp(`${ANSI_ESCAPE_CHAR}\\[[0-9;]*m`, "g");

type PendingStderrBatch = {
  workspaceId: string;
  count: number;
  firstTimestamp: number;
  lastTimestamp: number;
  samples: string[];
  signatureCounts: Record<string, number>;
};

function stripAnsiSequences(value: string): string {
  return value.replace(ANSI_SEQUENCE_PATTERN, "");
}

function normalizeStderrMessage(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const stripped = stripAnsiSequences(raw).trim();
  if (!stripped) {
    return null;
  }
  return stripped.replace(/\s+/g, " ");
}

function classifyStderrSignature(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("rmcp::transport::worker")) {
    if (lower.includes("connection refused")) {
      return "rmcp.connection_refused";
    }
    if (lower.includes("untagged enum jsonrpcmessage")) {
      return "rmcp.decode_invalid_jsonrpc";
    }
    return "rmcp.transport_other";
  }
  if (lower.includes("state db missing rollout path")) {
    return "state_db.missing_rollout_path";
  }
  return message.slice(0, 120);
}

function extractStderrRawMessage(event: AppServerEvent): unknown {
  if (!event.message || typeof event.message !== "object") {
    return null;
  }
  const message = event.message as Record<string, unknown>;
  if (!message.params || typeof message.params !== "object") {
    return null;
  }
  const params = message.params as Record<string, unknown>;
  return params.message;
}

function buildTopSignatures(signatureCounts: Record<string, number>) {
  return Object.entries(signatureCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, STDERR_TOP_SIGNATURE_LIMIT)
    .map(([signature, count]) => ({ signature, count }));
}

type ThreadEventHandlersOptions = {
  activeThreadId: string | null;
  dispatch: Dispatch<ThreadAction>;
  planByThreadRef: MutableRefObject<Record<string, TurnPlan | null>>;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  isThreadHidden: (workspaceId: string, threadId: string) => boolean;
  markProcessing: (threadId: string, isProcessing: boolean) => void;
  markReviewing: (threadId: string, isReviewing: boolean) => void;
  markThreadError?: (threadId: string, message: string) => void;
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
  resolveCurrentModel?: () => string | null;
};

export function useThreadEventHandlers({
  activeThreadId,
  dispatch,
  planByThreadRef,
  getCustomName,
  isThreadHidden,
  markProcessing,
  markReviewing,
  markThreadError,
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
  resolveCurrentModel,
}: ThreadEventHandlersOptions) {
  const onApprovalRequest = useThreadApprovalEvents({
    dispatch,
    approvalAllowlistRef,
  });
  const onRequestUserInput = useThreadUserInputEvents({ dispatch });
  const onDebugRef = useRef(onDebug);
  const pendingStderrByWorkspaceRef = useRef<Map<string, PendingStderrBatch>>(
    new Map(),
  );
  const stderrFlushTimerRef = useRef<number | null>(null);
  const stderrBatchCounterRef = useRef(0);

  useEffect(() => {
    onDebugRef.current = onDebug;
  }, [onDebug]);

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
    markThreadError,
    setActiveTurnId,
    pendingInterruptsRef,
    pushThreadErrorMessage,
    safeMessageActivity,
    recordThreadActivity,
    resolveCurrentModel,
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

  const flushPendingStderr = useCallback(() => {
    if (stderrFlushTimerRef.current !== null) {
      window.clearTimeout(stderrFlushTimerRef.current);
      stderrFlushTimerRef.current = null;
    }
    if (!pendingStderrByWorkspaceRef.current.size) {
      return;
    }
    const debug = onDebugRef.current;
    const pending = pendingStderrByWorkspaceRef.current;
    pendingStderrByWorkspaceRef.current = new Map();
    if (!debug) {
      return;
    }
    for (const batch of pending.values()) {
      const sequence = stderrBatchCounterRef.current++;
      debug({
        id: `${Date.now()}-stderr-batch-${sequence}`,
        timestamp: batch.lastTimestamp,
        source: "stderr",
        label: `codex/stderr (batched x${batch.count})`,
        payload: {
          workspaceId: batch.workspaceId,
          count: batch.count,
          firstTimestamp: batch.firstTimestamp,
          lastTimestamp: batch.lastTimestamp,
          topSignatures: buildTopSignatures(batch.signatureCounts),
          samples: batch.samples,
        },
      });
    }
  }, []);

  const scheduleStderrFlush = useCallback(() => {
    if (stderrFlushTimerRef.current !== null) {
      return;
    }
    stderrFlushTimerRef.current = window.setTimeout(() => {
      stderrFlushTimerRef.current = null;
      flushPendingStderr();
    }, STDERR_BATCH_WINDOW_MS);
  }, [flushPendingStderr]);

  const enqueueStderrDebug = useCallback(
    (event: AppServerEvent) => {
      const normalizedMessage = normalizeStderrMessage(
        extractStderrRawMessage(event),
      );
      // Keep previous behavior for edge cases where stderr payload is malformed.
      if (!normalizedMessage) {
        onDebugRef.current?.({
          id: `${Date.now()}-server-event`,
          timestamp: Date.now(),
          source: "stderr",
          label: "codex/stderr",
          payload: event,
        });
        return;
      }

      const workspaceId = event.workspace_id;
      const signature = classifyStderrSignature(normalizedMessage);
      const now = Date.now();
      const existing = pendingStderrByWorkspaceRef.current.get(workspaceId);
      if (existing) {
        existing.count += 1;
        existing.lastTimestamp = now;
        existing.signatureCounts[signature] =
          (existing.signatureCounts[signature] ?? 0) + 1;
        if (
          existing.samples.length < STDERR_SAMPLE_LIMIT &&
          !existing.samples.includes(normalizedMessage)
        ) {
          existing.samples.push(normalizedMessage);
        }
      } else {
        pendingStderrByWorkspaceRef.current.set(workspaceId, {
          workspaceId,
          count: 1,
          firstTimestamp: now,
          lastTimestamp: now,
          samples: [normalizedMessage],
          signatureCounts: { [signature]: 1 },
        });
      }

      scheduleStderrFlush();
    },
    [scheduleStderrFlush],
  );

  useEffect(() => {
    return () => {
      flushPendingStderr();
      if (stderrFlushTimerRef.current !== null) {
        window.clearTimeout(stderrFlushTimerRef.current);
        stderrFlushTimerRef.current = null;
      }
    };
  }, [flushPendingStderr]);

  const onAppServerEvent = useCallback(
    (event: AppServerEvent) => {
      const method = getAppServerRawMethod(event) ?? "";
      if (method === "codex/stderr") {
        enqueueStderrDebug(event);
        return;
      }
      onDebugRef.current?.({
        id: `${Date.now()}-server-event`,
        timestamp: Date.now(),
        source: "event",
        label: method || "event",
        payload: event,
      });
    },
    [enqueueStderrDebug],
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
