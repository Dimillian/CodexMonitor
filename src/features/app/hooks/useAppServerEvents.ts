import { useEffect, useRef } from "react";
import type {
  AppServerEvent,
  ApprovalRequest,
  RequestUserInputRequest,
} from "../../../types";
import { subscribeAppServerEvents } from "../../../services/events";
import {
  getAppServerParams,
  getAppServerRawMethod,
  getAppServerRequestId,
  isApprovalRequestMethod,
  isSupportedAppServerMethod,
} from "../../../utils/appServerEvents";
import type { SupportedAppServerMethod } from "../../../utils/appServerEvents";

type AgentDelta = {
  workspaceId: string;
  threadId: string;
  itemId: string;
  delta: string;
  turnId?: string | null;
};

type AgentCompleted = {
  workspaceId: string;
  threadId: string;
  itemId: string;
  text: string;
  turnId?: string | null;
};

type TurnStartMetadata = {
  model: string | null;
};

function isAgentMessageType(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return value.toLowerCase().replace(/[_-]/g, "") === "agentmessage";
}

type AppServerEventHandlers = {
  onWorkspaceConnected?: (workspaceId: string) => void;
  onWorkspaceDisconnected?: (workspaceId: string) => void;
  onThreadStarted?: (workspaceId: string, thread: Record<string, unknown>) => void;
  onThreadNameUpdated?: (
    workspaceId: string,
    payload: { threadId: string; threadName: string | null },
  ) => void;
  onBackgroundThreadAction?: (
    workspaceId: string,
    threadId: string,
    action: string,
  ) => void;
  onApprovalRequest?: (request: ApprovalRequest) => void;
  onRequestUserInput?: (request: RequestUserInputRequest) => void;
  onAgentMessageDelta?: (event: AgentDelta) => void;
  onAgentMessageCompleted?: (event: AgentCompleted) => void;
  onAppServerEvent?: (event: AppServerEvent) => void;
  onTurnStarted?: (
    workspaceId: string,
    threadId: string,
    turnId: string,
    metadata?: TurnStartMetadata,
  ) => void;
  onTurnCompleted?: (workspaceId: string, threadId: string, turnId: string) => void;
  onTurnError?: (
    workspaceId: string,
    threadId: string,
    turnId: string,
    payload: { message: string; willRetry: boolean },
  ) => void;
  onTurnPlanUpdated?: (
    workspaceId: string,
    threadId: string,
    turnId: string,
    payload: { explanation: unknown; plan: unknown },
  ) => void;
  onItemStarted?: (workspaceId: string, threadId: string, item: Record<string, unknown>) => void;
  onItemCompleted?: (workspaceId: string, threadId: string, item: Record<string, unknown>) => void;
  onReasoningSummaryDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onReasoningSummaryBoundary?: (workspaceId: string, threadId: string, itemId: string) => void;
  onReasoningTextDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onPlanDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onCommandOutputDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onTerminalInteraction?: (
    workspaceId: string,
    threadId: string,
    itemId: string,
    stdin: string,
  ) => void;
  onFileChangeOutputDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onTurnDiffUpdated?: (workspaceId: string, threadId: string, diff: string) => void;
  onThreadTokenUsageUpdated?: (
    workspaceId: string,
    threadId: string,
    payload: {
      turnId: string | null;
      tokenUsage: Record<string, unknown> | null;
    },
  ) => void;
  onAccountRateLimitsUpdated?: (
    workspaceId: string,
    rateLimits: Record<string, unknown>,
  ) => void;
  onAccountUpdated?: (workspaceId: string, authMode: string | null) => void;
  onAccountLoginCompleted?: (
    workspaceId: string,
    payload: { loginId: string | null; success: boolean; error: string | null },
  ) => void;
  onIsAlive?: (workspaceId: string) => void;
};

export const METHODS_ROUTED_IN_USE_APP_SERVER_EVENTS = [
  "account/login/completed",
  "account/rateLimits/updated",
  "account/updated",
  "codex/backgroundThread",
  "codex/connected",
  "codex/disconnected",
  "error",
  "item/agentMessage/delta",
  "item/commandExecution/outputDelta",
  "item/commandExecution/terminalInteraction",
  "item/completed",
  "item/fileChange/outputDelta",
  "item/plan/delta",
  "item/reasoning/summaryPartAdded",
  "item/reasoning/summaryTextDelta",
  "item/reasoning/textDelta",
  "item/started",
  "item/tool/requestUserInput",
  "thread/name/updated",
  "thread/started",
  "thread/tokenUsage/updated",
  "turn/completed",
  "turn/diff/updated",
  "turn/plan/updated",
  "turn/started",
] as const satisfies readonly SupportedAppServerMethod[];

const AGENT_DELTA_FLUSH_INTERVAL_MS = 16;
const TURN_COMPLETION_FALLBACK_MS = 15_000;
const TURN_COMPLETION_QUIET_WINDOW_MS = 2_000;
const TURN_COMPLETION_MAX_WAIT_MS = 90_000;

type TurnCompletionFallbackTimer = {
  timerId: number;
  startedAtMs: number;
};

function extractAgentMessageTextFromChunk(chunk: unknown): string {
  if (typeof chunk === "string") {
    return chunk;
  }
  if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) {
    return "";
  }
  const record = chunk as Record<string, unknown>;
  const directText = record.text;
  if (typeof directText === "string" && directText.length > 0) {
    return directText;
  }
  if (Array.isArray(directText)) {
    return directText
      .map((entry) => extractAgentMessageTextFromChunk(entry))
      .filter(Boolean)
      .join("");
  }
  const nestedContent = record.content;
  if (Array.isArray(nestedContent)) {
    return nestedContent
      .map((entry) => extractAgentMessageTextFromChunk(entry))
      .filter(Boolean)
      .join("");
  }
  if (typeof nestedContent === "string" && nestedContent.length > 0) {
    return nestedContent;
  }
  const value = record.value;
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return "";
}

function extractAgentMessageText(item: Record<string, unknown>): string {
  const direct = item.text;
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }
  const content = item.content;
  if (Array.isArray(content)) {
    const joined = content
      .map((chunk) => extractAgentMessageTextFromChunk(chunk))
      .filter(Boolean)
      .join("");
    if (joined.length > 0) {
      return joined;
    }
  }
  if (typeof content === "string" && content.length > 0) {
    return content;
  }
  return "";
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    const next = asNonEmptyString(value);
    if (next) {
      return next;
    }
  }
  return null;
}

function extractModelHint(
  params: Record<string, unknown>,
  turn?: Record<string, unknown>,
): string | null {
  return firstNonEmptyString(
    params.model,
    params.modelId,
    params.model_id,
    params.modelSlug,
    params.model_slug,
    turn?.model,
    turn?.modelId,
    turn?.model_id,
    turn?.modelSlug,
    turn?.model_slug,
  );
}

export function useAppServerEvents(handlers: AppServerEventHandlers) {
<<<<<<< HEAD
  const handlersRef = useRef(handlers);
  const pendingAgentDeltasRef = useRef<Map<string, AgentDelta>>(new Map());
  const pendingAgentDeltaFlushTimerRef = useRef<number | null>(null);
  const pendingTurnCompletionFallbackTimersRef = useRef<
    Map<string, TurnCompletionFallbackTimer>
  >(
    new Map(),
  );
  const pendingItemIdsByThreadRef = useRef<Map<string, Set<string>>>(
    new Map(),
  );
  const lastThreadEventAtRef = useRef<Map<string, number>>(
    new Map(),
  );
=======
  // Use ref to keep handlers current without triggering re-subscription
  const handlersRef = useRef(handlers);
  
  // Update ref on every render to always have latest handlers
  useEffect(() => {
    handlersRef.current = handlers;
  });
>>>>>>> origin/main

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const pendingTurnCompletionFallbackTimers = pendingTurnCompletionFallbackTimersRef.current;
    const pendingItemIdsByThread = pendingItemIdsByThreadRef.current;
    const lastThreadEventAt = lastThreadEventAtRef.current;

    const flushAgentMessageDeltas = () => {
      if (pendingAgentDeltaFlushTimerRef.current !== null) {
        window.clearTimeout(pendingAgentDeltaFlushTimerRef.current);
        pendingAgentDeltaFlushTimerRef.current = null;
      }
      if (!pendingAgentDeltasRef.current.size) {
        return;
      }
      const pending = pendingAgentDeltasRef.current;
      pendingAgentDeltasRef.current = new Map();
      const currentHandlers = handlersRef.current;
      for (const event of pending.values()) {
        currentHandlers.onAgentMessageDelta?.(event);
      }
    };

    const enqueueAgentMessageDelta = (event: AgentDelta) => {
      const key = `${event.workspaceId}:${event.threadId}:${event.itemId}`;
      const existing = pendingAgentDeltasRef.current.get(key);
      if (existing) {
        pendingAgentDeltasRef.current.set(key, {
          ...existing,
          delta: `${existing.delta}${event.delta}`,
        });
      } else {
        pendingAgentDeltasRef.current.set(key, event);
      }

      if (pendingAgentDeltaFlushTimerRef.current !== null) {
        return;
      }
      pendingAgentDeltaFlushTimerRef.current = window.setTimeout(() => {
        pendingAgentDeltaFlushTimerRef.current = null;
        flushAgentMessageDeltas();
      }, AGENT_DELTA_FLUSH_INTERVAL_MS);
    };

    const makeTurnCompletionFallbackKey = (
      workspaceId: string,
      threadId: string,
      turnId: string | null,
    ) => `${workspaceId}:${threadId}:${turnId ?? "__unknown__"}`;

    const makeThreadKey = (workspaceId: string, threadId: string) =>
      `${workspaceId}:${threadId}`;

    const markThreadEvent = (workspaceId: string, threadId: string) => {
      lastThreadEventAtRef.current.set(makeThreadKey(workspaceId, threadId), Date.now());
    };

    const clearThreadEvent = (workspaceId: string, threadId: string) => {
      lastThreadEventAtRef.current.delete(makeThreadKey(workspaceId, threadId));
    };

    const clearThreadEventsForWorkspace = (workspaceId: string) => {
      const prefix = `${workspaceId}:`;
      for (const key of Array.from(lastThreadEventAtRef.current.keys())) {
        if (key.startsWith(prefix)) {
          lastThreadEventAtRef.current.delete(key);
        }
      }
    };

    const trackItemStarted = (workspaceId: string, threadId: string, itemId: string) => {
      const key = makeThreadKey(workspaceId, threadId);
      const existing = pendingItemIdsByThreadRef.current.get(key);
      if (existing) {
        existing.add(itemId);
        return;
      }
      pendingItemIdsByThreadRef.current.set(key, new Set([itemId]));
    };

    const trackItemCompleted = (workspaceId: string, threadId: string, itemId: string) => {
      const key = makeThreadKey(workspaceId, threadId);
      const existing = pendingItemIdsByThreadRef.current.get(key);
      if (!existing) {
        return;
      }
      existing.delete(itemId);
      if (existing.size === 0) {
        pendingItemIdsByThreadRef.current.delete(key);
      }
    };

    const clearPendingItemsForThread = (workspaceId: string, threadId: string) => {
      pendingItemIdsByThreadRef.current.delete(makeThreadKey(workspaceId, threadId));
    };

    const clearPendingItemsForWorkspace = (workspaceId: string) => {
      const prefix = `${workspaceId}:`;
      for (const key of Array.from(pendingItemIdsByThreadRef.current.keys())) {
        if (key.startsWith(prefix)) {
          pendingItemIdsByThreadRef.current.delete(key);
        }
      }
    };

    const clearTurnCompletionFallbackByKey = (key: string) => {
      const timer = pendingTurnCompletionFallbackTimersRef.current.get(key);
      if (!timer) {
        return;
      }
      window.clearTimeout(timer.timerId);
      pendingTurnCompletionFallbackTimersRef.current.delete(key);
    };

    const clearTurnCompletionFallbackForThread = (
      workspaceId: string,
      threadId: string,
    ) => {
      const prefix = `${workspaceId}:${threadId}:`;
      for (const key of Array.from(
        pendingTurnCompletionFallbackTimersRef.current.keys(),
      )) {
        if (!key.startsWith(prefix)) {
          continue;
        }
        clearTurnCompletionFallbackByKey(key);
      }
    };

    const clearTurnCompletionFallbackForWorkspace = (workspaceId: string) => {
      const prefix = `${workspaceId}:`;
      for (const key of Array.from(
        pendingTurnCompletionFallbackTimersRef.current.keys(),
      )) {
        if (!key.startsWith(prefix)) {
          continue;
        }
        clearTurnCompletionFallbackByKey(key);
      }
    };

    const scheduleTurnCompletionFallback = (
      workspaceId: string,
      threadId: string,
      turnId: string | null,
      itemId: string,
    ) => {
      const key = makeTurnCompletionFallbackKey(workspaceId, threadId, turnId);
      const existing = pendingTurnCompletionFallbackTimersRef.current.get(key);
      const startedAtMs = existing?.startedAtMs ?? Date.now();
      if (existing) {
        window.clearTimeout(existing.timerId);
      }

      const runFallbackCheck = () => {
        const latest = pendingTurnCompletionFallbackTimersRef.current.get(key);
        if (!latest) {
          return;
        }

        const now = Date.now();
        const threadKey = makeThreadKey(workspaceId, threadId);
        const pendingItems =
          pendingItemIdsByThreadRef.current.get(threadKey)?.size ?? 0;
        const lastEventAt = lastThreadEventAtRef.current.get(threadKey) ?? 0;
        const idleForMs = Math.max(0, now - lastEventAt);
        const waitedMs = Math.max(0, now - latest.startedAtMs);

        const quietEnough = idleForMs >= TURN_COMPLETION_QUIET_WINDOW_MS;
        const noPendingItems = pendingItems === 0;
        const maxWaitReached = waitedMs >= TURN_COMPLETION_MAX_WAIT_MS;

        if ((quietEnough && noPendingItems) || maxWaitReached) {
          pendingTurnCompletionFallbackTimersRef.current.delete(key);
          const currentHandlers = handlersRef.current;
          currentHandlers.onAppServerEvent?.({
            workspace_id: workspaceId,
            message: {
              method: "codex/turnCompletionFallback",
              params: {
                threadId,
                turnId,
                itemId,
                timeoutMs: TURN_COMPLETION_FALLBACK_MS,
                quietWindowMs: TURN_COMPLETION_QUIET_WINDOW_MS,
                pendingItems,
                idleForMs,
                waitedMs,
                maxWaitReached,
              },
            },
          });
          currentHandlers.onTurnCompleted?.(workspaceId, threadId, turnId ?? "");
          return;
        }

        const remainingQuietMs = Math.max(
          0,
          TURN_COMPLETION_QUIET_WINDOW_MS - idleForMs,
        );
        const nextCheckMs = Math.max(250, remainingQuietMs || TURN_COMPLETION_QUIET_WINDOW_MS);
        const timerId = window.setTimeout(runFallbackCheck, nextCheckMs);
        pendingTurnCompletionFallbackTimersRef.current.set(key, {
          timerId,
          startedAtMs: latest.startedAtMs,
        });
      };

      const timerId = window.setTimeout(runFallbackCheck, TURN_COMPLETION_FALLBACK_MS);
      pendingTurnCompletionFallbackTimersRef.current.set(key, {
        timerId,
        startedAtMs,
      });
    };

    const unlisten = subscribeAppServerEvents((payload) => {
      const currentHandlers = handlersRef.current;
<<<<<<< HEAD

=======
>>>>>>> origin/main
      currentHandlers.onAppServerEvent?.(payload);

      const { workspace_id } = payload;
      const method = getAppServerRawMethod(payload);
      if (!method) {
        return;
      }

      // Signal that we received any event from this workspace — used by
      // the stale-processing guard to detect silent disconnects.
      currentHandlers.onIsAlive?.(workspace_id);
      const params = getAppServerParams(payload);
      const eventTurn = params.turn as Record<string, unknown> | undefined;
      const eventThread = params.thread as Record<string, unknown> | undefined;
      const eventThreadId = firstNonEmptyString(
        params.threadId,
        params.thread_id,
        eventTurn?.threadId,
        eventTurn?.thread_id,
        eventThread?.id,
      );
      if (eventThreadId) {
        markThreadEvent(workspace_id, eventThreadId);
      }

      if (method === "codex/connected") {
        currentHandlers.onWorkspaceConnected?.(workspace_id);
<<<<<<< HEAD
        return;
      }

      if (method === "codex/disconnected") {
        flushAgentMessageDeltas();
        clearTurnCompletionFallbackForWorkspace(workspace_id);
        clearPendingItemsForWorkspace(workspace_id);
        clearThreadEventsForWorkspace(workspace_id);
        currentHandlers.onWorkspaceDisconnected?.(workspace_id);
=======
>>>>>>> origin/main
        return;
      }

      const requestId = getAppServerRequestId(payload);
      const hasRequestId = requestId !== null;

      if (isApprovalRequestMethod(method) && hasRequestId) {
        currentHandlers.onApprovalRequest?.({
          workspace_id,
          request_id: requestId as string | number,
          method,
          params,
        });
        return;
      }

      if (!isSupportedAppServerMethod(method)) {
        if (import.meta.env.DEV) {
          console.debug("[useAppServerEvents] unsupported method:", method, payload);
        }
        return;
      }

      if (method === "item/tool/requestUserInput" && hasRequestId) {
        const questionsRaw = Array.isArray(params.questions) ? params.questions : [];
        const questions = questionsRaw
          .map((entry) => {
            const question = entry as Record<string, unknown>;
            const optionsRaw = Array.isArray(question.options) ? question.options : [];
            const options = optionsRaw
              .map((option) => {
                const record = option as Record<string, unknown>;
                const label = String(record.label ?? "").trim();
                const description = String(record.description ?? "").trim();
                if (!label && !description) {
                  return null;
                }
                return { label, description };
              })
              .filter((option): option is { label: string; description: string } => Boolean(option));
            return {
              id: String(question.id ?? "").trim(),
              header: String(question.header ?? ""),
              question: String(question.question ?? ""),
              isOther: Boolean(question.isOther ?? question.is_other),
              options: options.length ? options : undefined,
            };
          })
          .filter((question) => question.id);
        currentHandlers.onRequestUserInput?.({
          workspace_id,
          request_id: requestId as string | number,
          params: {
            thread_id: String(params.threadId ?? params.thread_id ?? ""),
            turn_id: String(params.turnId ?? params.turn_id ?? ""),
            item_id: String(params.itemId ?? params.item_id ?? ""),
            questions,
          },
        });
        return;
      }

      if (method === "item/agentMessage/delta") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
<<<<<<< HEAD
        const deltaTurn = params.turn as Record<string, unknown> | undefined;
        const turnId = firstNonEmptyString(
          params.turnId,
          params.turn_id,
          deltaTurn?.id,
        );
        const hasDeltaField =
          Object.prototype.hasOwnProperty.call(params, "delta") ||
          Object.prototype.hasOwnProperty.call(params, "textDelta") ||
          Object.prototype.hasOwnProperty.call(params, "text_delta");
        const delta = String(params.delta ?? params.textDelta ?? params.text_delta ?? "");
        if (threadId && itemId && (hasDeltaField || delta.length > 0)) {
          enqueueAgentMessageDelta({
=======
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          currentHandlers.onAgentMessageDelta?.({
>>>>>>> origin/main
            workspaceId: workspace_id,
            threadId,
            itemId,
            delta,
            turnId,
          });
        }
        return;
      }

      if (method === "turn/started") {
        const turn = params.turn as Record<string, unknown> | undefined;
        const threadId = String(
          params.threadId ?? params.thread_id ?? turn?.threadId ?? turn?.thread_id ?? "",
        );
        const turnId = String(turn?.id ?? params.turnId ?? params.turn_id ?? "");
        const model = extractModelHint(params, turn);
        if (threadId) {
<<<<<<< HEAD
          clearPendingItemsForThread(workspace_id, threadId);
          clearTurnCompletionFallbackForThread(workspace_id, threadId);
          currentHandlers.onTurnStarted?.(workspace_id, threadId, turnId, {
            model,
          });
=======
          currentHandlers.onTurnStarted?.(workspace_id, threadId, turnId);
>>>>>>> origin/main
        }
        return;
      }

      if (method === "thread/started") {
        const thread = (params.thread as Record<string, unknown> | undefined) ?? null;
        const threadId = String(thread?.id ?? "");
        if (thread && threadId) {
          currentHandlers.onThreadStarted?.(workspace_id, thread);
        }
        return;
      }

      if (method === "thread/name/updated") {
        const threadId = String(params.threadId ?? params.thread_id ?? "").trim();
        const threadNameRaw = params.threadName ?? params.thread_name ?? null;
        const threadName =
          typeof threadNameRaw === "string" && threadNameRaw.trim().length > 0
            ? threadNameRaw.trim()
            : null;
        if (threadId) {
          currentHandlers.onThreadNameUpdated?.(workspace_id, { threadId, threadName });
        }
        return;
      }

      if (method === "codex/backgroundThread") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const action = String(params.action ?? "hide");
        if (threadId) {
          currentHandlers.onBackgroundThreadAction?.(workspace_id, threadId, action);
        }
        return;
      }

      if (method === "error") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const turnId = String(params.turnId ?? params.turn_id ?? "");
        const error = (params.error as Record<string, unknown> | undefined) ?? {};
        const messageText = String(error.message ?? "");
        const willRetry = Boolean(params.willRetry ?? params.will_retry);
        if (threadId) {
          currentHandlers.onTurnError?.(workspace_id, threadId, turnId, {
            message: messageText,
            willRetry,
          });
        }
        return;
      }

      if (method === "turn/completed") {
        flushAgentMessageDeltas();
        const turn = params.turn as Record<string, unknown> | undefined;
        const threadId = String(
          params.threadId ?? params.thread_id ?? turn?.threadId ?? turn?.thread_id ?? "",
        );
        const turnId = String(turn?.id ?? params.turnId ?? params.turn_id ?? "");
        if (threadId) {
<<<<<<< HEAD
          clearPendingItemsForThread(workspace_id, threadId);
          clearThreadEvent(workspace_id, threadId);
          clearTurnCompletionFallbackForThread(workspace_id, threadId);
=======
>>>>>>> origin/main
          currentHandlers.onTurnCompleted?.(workspace_id, threadId, turnId);
        }
        return;
      }

      if (method === "turn/plan/updated") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const turnId = String(params.turnId ?? params.turn_id ?? "");
        if (threadId) {
          currentHandlers.onTurnPlanUpdated?.(workspace_id, threadId, turnId, {
            explanation: params.explanation,
            plan: params.plan,
          });
        }
        return;
      }

      if (method === "turn/diff/updated") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const diff = String(params.diff ?? "");
        if (threadId && diff) {
          currentHandlers.onTurnDiffUpdated?.(workspace_id, threadId, diff);
        }
        return;
      }

      if (method === "thread/tokenUsage/updated") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const usageTurn = params.turn as Record<string, unknown> | undefined;
        const turnId = firstNonEmptyString(
          params.turnId,
          params.turn_id,
          usageTurn?.id,
        );
        const tokenUsage =
          (params.tokenUsage as Record<string, unknown> | null | undefined) ??
          (params.token_usage as Record<string, unknown> | null | undefined);
        if (threadId && tokenUsage !== undefined) {
<<<<<<< HEAD
          currentHandlers.onThreadTokenUsageUpdated?.(workspace_id, threadId, {
            turnId,
            tokenUsage,
          });
=======
          currentHandlers.onThreadTokenUsageUpdated?.(workspace_id, threadId, tokenUsage);
>>>>>>> origin/main
        }
        return;
      }

      if (method === "account/rateLimits/updated") {
        const rateLimits =
          (params.rateLimits as Record<string, unknown> | undefined) ??
          (params.rate_limits as Record<string, unknown> | undefined);
        if (rateLimits) {
          currentHandlers.onAccountRateLimitsUpdated?.(workspace_id, rateLimits);
        }
        return;
      }

      if (method === "account/updated") {
        const authModeRaw = params.authMode ?? params.auth_mode ?? null;
        const authMode =
          typeof authModeRaw === "string" && authModeRaw.trim().length > 0
            ? authModeRaw
            : null;
        currentHandlers.onAccountUpdated?.(workspace_id, authMode);
        return;
      }

      if (method === "account/login/completed") {
        const loginIdRaw = params.loginId ?? params.login_id ?? null;
        const loginId =
          typeof loginIdRaw === "string" && loginIdRaw.trim().length > 0
            ? loginIdRaw
            : null;
        const success = Boolean(params.success);
        const errorRaw = params.error ?? null;
        const error =
          typeof errorRaw === "string" && errorRaw.trim().length > 0 ? errorRaw : null;
        currentHandlers.onAccountLoginCompleted?.(workspace_id, {
          loginId,
          success,
          error,
        });
        return;
      }

      if (method === "item/completed") {
        flushAgentMessageDeltas();
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const completedTurn = params.turn as Record<string, unknown> | undefined;
        const turnId = firstNonEmptyString(
          params.turnId,
          params.turn_id,
          completedTurn?.id,
        );
        const item = params.item as Record<string, unknown> | undefined;
        const itemId = firstNonEmptyString(
          params.itemId,
          params.item_id,
          item?.id,
        );
        if (threadId && item) {
          currentHandlers.onItemCompleted?.(workspace_id, threadId, item);
        }
        if (threadId && itemId) {
          trackItemCompleted(workspace_id, threadId, itemId);
        }
        if (threadId && item && isAgentMessageType(item.type ?? item.itemType)) {
          const text = extractAgentMessageText(item);
          if (itemId) {
            currentHandlers.onAgentMessageCompleted?.({
              workspaceId: workspace_id,
              threadId,
              itemId,
              text,
              turnId,
            });
            scheduleTurnCompletionFallback(workspace_id, threadId, turnId, itemId);
          }
        }
        return;
      }

      if (method === "item/started") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const item = params.item as Record<string, unknown> | undefined;
        const itemId = firstNonEmptyString(
          params.itemId,
          params.item_id,
          item?.id,
        );
        if (threadId && item) {
          currentHandlers.onItemStarted?.(workspace_id, threadId, item);
<<<<<<< HEAD
        }
        if (threadId && itemId) {
          trackItemStarted(workspace_id, threadId, itemId);
=======
>>>>>>> origin/main
        }
        return;
      }

      if (method === "item/reasoning/summaryTextDelta") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          currentHandlers.onReasoningSummaryDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }

      if (method === "item/reasoning/summaryPartAdded") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        if (threadId && itemId) {
          currentHandlers.onReasoningSummaryBoundary?.(workspace_id, threadId, itemId);
        }
        return;
      }

      if (method === "item/reasoning/textDelta") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          currentHandlers.onReasoningTextDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }

      if (method === "item/plan/delta") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          currentHandlers.onPlanDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }

      if (method === "item/commandExecution/outputDelta") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          currentHandlers.onCommandOutputDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }

      if (method === "item/commandExecution/terminalInteraction") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const stdin = String(params.stdin ?? "");
        if (threadId && itemId) {
          currentHandlers.onTerminalInteraction?.(workspace_id, threadId, itemId, stdin);
        }
        return;
      }

      if (method === "item/fileChange/outputDelta") {
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          currentHandlers.onFileChangeOutputDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }
    });

    return () => {
      flushAgentMessageDeltas();
      for (const timer of pendingTurnCompletionFallbackTimers.values()) {
        window.clearTimeout(timer.timerId);
      }
      pendingTurnCompletionFallbackTimers.clear();
      pendingItemIdsByThread.clear();
      lastThreadEventAt.clear();
      unlisten();
    };
  }, []);
}
