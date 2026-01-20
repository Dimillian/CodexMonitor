import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  ApprovalRequest,
  AppServerEvent,
  ConversationItem,
  CustomPromptOption,
  DebugEntry,
  RateLimitSnapshot,
  ThreadSummary,
  ThreadTokenUsage,
  TurnPlan,
  TurnPlanStep,
  TurnPlanStepStatus,
  WorkspaceInfo,
} from "../../../types";
import {
  getApprovalCommandInfo,
  matchesCommandPrefix,
  normalizeCommandTokens,
} from "../../../utils/approvalRules";
import {
  respondToServerRequest,
  rememberApprovalRule,
  sendUserMessage as sendUserMessageService,
  startReview as startReviewService,
  startThread as startThreadService,
  listThreads as listThreadsService,
  resumeThread as resumeThreadService,
  archiveThread as archiveThreadService,
  getAccountRateLimits,
  interruptTurn as interruptTurnService,
} from "../../../services/tauri";
import { useAppServerEvents } from "../../app/hooks/useAppServerEvents";
import {
  buildConversationItem,
  buildItemsFromThread,
  getThreadTimestamp,
  isReviewingFromThread,
  mergeThreadItems,
  previewThreadName,
} from "../../../utils/threadItems";
import { expandCustomPromptText } from "../../../utils/customPrompts";
import { initialState, threadReducer } from "./useThreadsReducer";

const STORAGE_KEY_THREAD_ACTIVITY = "codexmonitor.threadLastUserActivity";
const STORAGE_KEY_PINNED_THREADS = "codexmonitor.pinnedThreads";
const STORAGE_KEY_CUSTOM_NAMES = "codexmonitor.threadCustomNames";
const MAX_PINS_SOFT_LIMIT = 5;

type ThreadActivityMap = Record<string, Record<string, number>>;
type PinnedThreadsMap = Record<string, number>;
type CustomNamesMap = Record<string, string>;

function loadThreadActivity(): ThreadActivityMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_THREAD_ACTIVITY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ThreadActivityMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveThreadActivity(activity: ThreadActivityMap) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY_THREAD_ACTIVITY,
      JSON.stringify(activity),
    );
  } catch {
    // Best-effort persistence; ignore write failures.
  }
}

function makeCustomNameKey(workspaceId: string, threadId: string): string {
  return `${workspaceId}:${threadId}`;
}

function loadCustomNames(): CustomNamesMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_CUSTOM_NAMES);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as CustomNamesMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveCustomName(workspaceId: string, threadId: string, name: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const current = loadCustomNames();
    const key = makeCustomNameKey(workspaceId, threadId);
    current[key] = name;
    window.localStorage.setItem(
      STORAGE_KEY_CUSTOM_NAMES,
      JSON.stringify(current),
    );
  } catch {
    // Best-effort persistence.
  }
}

function makePinKey(workspaceId: string, threadId: string): string {
  return `${workspaceId}:${threadId}`;
}

function loadPinnedThreads(): PinnedThreadsMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PINNED_THREADS);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as PinnedThreadsMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function savePinnedThreads(pinned: PinnedThreadsMap) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY_PINNED_THREADS,
      JSON.stringify(pinned),
    );
  } catch {
    // Best-effort persistence; ignore write failures.
  }
}

type UseThreadsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onWorkspaceConnected: (id: string) => void;
  onDebug?: (entry: DebugEntry) => void;
  model?: string | null;
  effort?: string | null;
  collaborationMode?: Record<string, unknown> | null;
  accessMode?: "read-only" | "current" | "full-access";
  customPrompts?: CustomPromptOption[];
  onMessageActivity?: () => void;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function normalizeStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => asString(entry)).filter(Boolean);
  }
  const single = asString(value);
  return single ? [single] : [];
}

function normalizeRootPath(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function extractRpcErrorMessage(response: unknown) {
  if (!response || typeof response !== "object") {
    return null;
  }
  const record = response as Record<string, unknown>;
  if (!record.error) {
    return null;
  }
  const errorValue = record.error;
  if (typeof errorValue === "string") {
    return errorValue;
  }
  if (typeof errorValue === "object" && errorValue) {
    const message = asString((errorValue as Record<string, unknown>).message);
    return message || "Request failed.";
  }
  return "Request failed.";
}

function parseReviewTarget(input: string) {
  const trimmed = input.trim();
  const rest = trimmed.replace(/^\/review\b/i, "").trim();
  if (!rest) {
    return { type: "uncommittedChanges" } as const;
  }
  const lower = rest.toLowerCase();
  if (lower.startsWith("base ")) {
    const branch = rest.slice(5).trim();
    return { type: "baseBranch", branch } as const;
  }
  if (lower.startsWith("commit ")) {
    const payload = rest.slice(7).trim();
    const [sha, ...titleParts] = payload.split(/\s+/);
    const title = titleParts.join(" ").trim();
    return {
      type: "commit",
      sha,
      ...(title ? { title } : {}),
    } as const;
  }
  if (lower.startsWith("custom ")) {
    const instructions = rest.slice(7).trim();
    return { type: "custom", instructions } as const;
  }
  return { type: "custom", instructions: rest } as const;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function normalizeTokenUsage(raw: Record<string, unknown>): ThreadTokenUsage {
  const total = (raw.total as Record<string, unknown>) ?? {};
  const last = (raw.last as Record<string, unknown>) ?? {};
  return {
    total: {
      totalTokens: asNumber(total.totalTokens ?? total.total_tokens),
      inputTokens: asNumber(total.inputTokens ?? total.input_tokens),
      cachedInputTokens: asNumber(
        total.cachedInputTokens ?? total.cached_input_tokens,
      ),
      outputTokens: asNumber(total.outputTokens ?? total.output_tokens),
      reasoningOutputTokens: asNumber(
        total.reasoningOutputTokens ?? total.reasoning_output_tokens,
      ),
    },
    last: {
      totalTokens: asNumber(last.totalTokens ?? last.total_tokens),
      inputTokens: asNumber(last.inputTokens ?? last.input_tokens),
      cachedInputTokens: asNumber(last.cachedInputTokens ?? last.cached_input_tokens),
      outputTokens: asNumber(last.outputTokens ?? last.output_tokens),
      reasoningOutputTokens: asNumber(
        last.reasoningOutputTokens ?? last.reasoning_output_tokens,
      ),
    },
    modelContextWindow: (() => {
      const value = raw.modelContextWindow ?? raw.model_context_window;
      if (typeof value === "number") {
        return value;
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })(),
  };
}

function normalizeRateLimits(raw: Record<string, unknown>): RateLimitSnapshot {
  const primary = (raw.primary as Record<string, unknown>) ?? null;
  const secondary = (raw.secondary as Record<string, unknown>) ?? null;
  const credits = (raw.credits as Record<string, unknown>) ?? null;
  return {
    primary: primary
      ? {
          usedPercent: asNumber(primary.usedPercent ?? primary.used_percent),
          windowDurationMins: (() => {
            const value = primary.windowDurationMins ?? primary.window_duration_mins;
            if (typeof value === "number") {
              return value;
            }
            if (typeof value === "string") {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })(),
          resetsAt: (() => {
            const value = primary.resetsAt ?? primary.resets_at;
            if (typeof value === "number") {
              return value;
            }
            if (typeof value === "string") {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })(),
        }
      : null,
    secondary: secondary
      ? {
          usedPercent: asNumber(secondary.usedPercent ?? secondary.used_percent),
          windowDurationMins: (() => {
            const value = secondary.windowDurationMins ?? secondary.window_duration_mins;
            if (typeof value === "number") {
              return value;
            }
            if (typeof value === "string") {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })(),
          resetsAt: (() => {
            const value = secondary.resetsAt ?? secondary.resets_at;
            if (typeof value === "number") {
              return value;
            }
            if (typeof value === "string") {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })(),
        }
      : null,
    credits: credits
      ? {
          hasCredits: Boolean(credits.hasCredits ?? credits.has_credits),
          unlimited: Boolean(credits.unlimited),
          balance: typeof credits.balance === "string" ? credits.balance : null,
        }
      : null,
    planType: typeof raw.planType === "string"
      ? raw.planType
      : typeof raw.plan_type === "string"
        ? raw.plan_type
        : null,
  };
}

function normalizePlanStepStatus(value: unknown): TurnPlanStepStatus {
  const raw = typeof value === "string" ? value : "";
  const normalized = raw.replace(/[_\s-]/g, "").toLowerCase();
  if (normalized === "inprogress") {
    return "inProgress";
  }
  if (normalized === "completed") {
    return "completed";
  }
  return "pending";
}

function normalizePlanUpdate(
  turnId: string,
  explanation: unknown,
  plan: unknown,
): TurnPlan | null {
  const steps = Array.isArray(plan)
    ? plan
        .map((entry) => {
          const step = asString((entry as Record<string, unknown>)?.step ?? "");
          if (!step) {
            return null;
          }
          return {
            step,
            status: normalizePlanStepStatus(
              (entry as Record<string, unknown>)?.status,
            ),
          } satisfies TurnPlanStep;
        })
        .filter((entry): entry is TurnPlanStep => Boolean(entry))
    : [];
  const note = asString(explanation).trim();
  if (!steps.length && !note) {
    return null;
  }
  return {
    turnId,
    explanation: note ? note : null,
    steps,
  };
}

function formatReviewLabel(target: ReturnType<typeof parseReviewTarget>) {
  if (target.type === "uncommittedChanges") {
    return "current changes";
  }
  if (target.type === "baseBranch") {
    return `base branch ${target.branch}`;
  }
  if (target.type === "commit") {
    return target.title
      ? `commit ${target.sha}: ${target.title}`
      : `commit ${target.sha}`;
  }
  const instructions = target.instructions.trim();
  if (!instructions) {
    return "custom review";
  }
  return instructions.length > 80
    ? `${instructions.slice(0, 80)}…`
    : instructions;
}

export function useThreads({
  activeWorkspace,
  onWorkspaceConnected,
  onDebug,
  model,
  effort,
  collaborationMode,
  accessMode,
  customPrompts = [],
  onMessageActivity,
}: UseThreadsOptions) {
  const [state, dispatch] = useReducer(threadReducer, initialState);
  const loadedThreads = useRef<Record<string, boolean>>({});
  const replaceOnResumeRef = useRef<Record<string, boolean>>({});
  const threadActivityRef = useRef<ThreadActivityMap>(loadThreadActivity());
  const pinnedThreadsRef = useRef<PinnedThreadsMap>(loadPinnedThreads());
  const [pinnedThreadsVersion, setPinnedThreadsVersion] = useState(0);
  void pinnedThreadsVersion;
  const pendingInterruptsRef = useRef<Set<string>>(new Set());
  const customNamesRef = useRef<CustomNamesMap>({});
  const approvalAllowlistRef = useRef<Record<string, string[][]>>({});

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    customNamesRef.current = loadCustomNames();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY_CUSTOM_NAMES) {
        customNamesRef.current = loadCustomNames();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const getCustomName = useCallback((workspaceId: string, threadId: string) => {
    const key = makeCustomNameKey(workspaceId, threadId);
    return customNamesRef.current[key];
  }, []);

  const recordThreadActivity = useCallback(
    (workspaceId: string, threadId: string, timestamp = Date.now()) => {
      const nextForWorkspace = {
        ...(threadActivityRef.current[workspaceId] ?? {}),
        [threadId]: timestamp,
      };
      const next = {
        ...threadActivityRef.current,
        [workspaceId]: nextForWorkspace,
      };
      threadActivityRef.current = next;
      saveThreadActivity(next);
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    pinnedThreadsRef.current = loadPinnedThreads();
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY_PINNED_THREADS) {
        return;
      }
      pinnedThreadsRef.current = loadPinnedThreads();
      setPinnedThreadsVersion((version) => version + 1);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const pinThread = useCallback((workspaceId: string, threadId: string): boolean => {
    const key = makePinKey(workspaceId, threadId);
    if (key in pinnedThreadsRef.current) {
      return false;
    }
    const currentPinsForWorkspace = Object.keys(pinnedThreadsRef.current).filter(
      (entry) => entry.startsWith(`${workspaceId}:`),
    ).length;
    if (currentPinsForWorkspace >= MAX_PINS_SOFT_LIMIT) {
      console.warn(
        `Pin limit reached (${MAX_PINS_SOFT_LIMIT}). Consider unpinning some threads.`,
      );
    }
    const next = { ...pinnedThreadsRef.current, [key]: Date.now() };
    pinnedThreadsRef.current = next;
    savePinnedThreads(next);
    setPinnedThreadsVersion((version) => version + 1);
    return true;
  }, []);

  const unpinThread = useCallback((workspaceId: string, threadId: string) => {
    const key = makePinKey(workspaceId, threadId);
    if (!(key in pinnedThreadsRef.current)) {
      return;
    }
    const { [key]: _removed, ...rest } = pinnedThreadsRef.current;
    pinnedThreadsRef.current = rest;
    savePinnedThreads(rest);
    setPinnedThreadsVersion((version) => version + 1);
  }, []);

  const isThreadPinned = useCallback(
    (workspaceId: string, threadId: string): boolean => {
      const key = makePinKey(workspaceId, threadId);
      return key in pinnedThreadsRef.current;
    },
    [],
  );

  const getPinTimestamp = useCallback(
    (workspaceId: string, threadId: string): number | null => {
      const key = makePinKey(workspaceId, threadId);
      return pinnedThreadsRef.current[key] ?? null;
    },
    [],
  );

  const activeWorkspaceId = activeWorkspace?.id ?? null;
  const activeThreadId = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }
    return state.activeThreadIdByWorkspace[activeWorkspaceId] ?? null;
  }, [activeWorkspaceId, state.activeThreadIdByWorkspace]);

  const activeItems = useMemo(
    () => (activeThreadId ? state.itemsByThread[activeThreadId] ?? [] : []),
    [activeThreadId, state.itemsByThread],
  );

  const refreshAccountRateLimits = useCallback(
    async (workspaceId?: string) => {
      const targetId = workspaceId ?? activeWorkspaceId;
      if (!targetId) {
        return;
      }
      onDebug?.({
        id: `${Date.now()}-client-account-rate-limits`,
        timestamp: Date.now(),
        source: "client",
        label: "account/rateLimits/read",
        payload: { workspaceId: targetId },
      });
      try {
        const response = await getAccountRateLimits(targetId);
        onDebug?.({
          id: `${Date.now()}-server-account-rate-limits`,
          timestamp: Date.now(),
          source: "server",
          label: "account/rateLimits/read response",
          payload: response,
        });
        const rateLimits =
          (response?.result?.rateLimits as Record<string, unknown> | undefined) ??
          (response?.result?.rate_limits as Record<string, unknown> | undefined) ??
          (response?.rateLimits as Record<string, unknown> | undefined) ??
          (response?.rate_limits as Record<string, unknown> | undefined);
        if (rateLimits) {
          dispatch({
            type: "setRateLimits",
            workspaceId: targetId,
            rateLimits: normalizeRateLimits(rateLimits),
          });
        }
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-account-rate-limits-error`,
          timestamp: Date.now(),
          source: "error",
          label: "account/rateLimits/read error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [activeWorkspaceId, onDebug],
  );

  const pushThreadErrorMessage = useCallback(
    (threadId: string, message: string) => {
      dispatch({
        type: "addAssistantMessage",
        threadId,
        text: message,
      });
      if (threadId !== activeThreadId) {
        dispatch({ type: "markUnread", threadId, hasUnread: true });
      }
    },
    [activeThreadId],
  );

  const markProcessing = useCallback((threadId: string, isProcessing: boolean) => {
    dispatch({
      type: "markProcessing",
      threadId,
      isProcessing,
      timestamp: Date.now(),
    });
  }, []);

  const safeMessageActivity = useCallback(() => {
    try {
      void onMessageActivity?.();
    } catch {
      // Ignore refresh errors to avoid breaking the UI.
    }
  }, [onMessageActivity]);

  const wouldCreateThreadCycle = useCallback(
    (parentId: string, childId: string) => {
      const visited = new Set([childId]);
      let current: string | undefined = parentId;
      while (current) {
        if (visited.has(current)) {
          return true;
        }
        visited.add(current);
        current = state.threadParentById[current];
      }
      return false;
    },
    [state.threadParentById],
  );

  const updateThreadParent = useCallback(
    (parentId: string, childIds: string[]) => {
      if (!parentId || childIds.length === 0) {
        return;
      }
      childIds.forEach((childId) => {
        if (!childId || childId === parentId) {
          return;
        }
        const existingParent = state.threadParentById[childId];
        if (existingParent === parentId) {
          return;
        }
        if (existingParent) {
          return;
        }
        if (wouldCreateThreadCycle(parentId, childId)) {
          return;
        }
        dispatch({ type: "setThreadParent", threadId: childId, parentId });
      });
    },
    [state.threadParentById, wouldCreateThreadCycle],
  );

  const applyCollabThreadLinks = useCallback(
    (fallbackThreadId: string, item: Record<string, unknown>) => {
      const itemType = asString(item?.type ?? "");
      if (itemType !== "collabToolCall" && itemType !== "collabAgentToolCall") {
        return;
      }
      const sender = asString(item.senderThreadId ?? item.sender_thread_id ?? "");
      const parentId = sender || fallbackThreadId;
      if (!parentId) {
        return;
      }
      const receivers = [
        ...normalizeStringList(item.receiverThreadId ?? item.receiver_thread_id),
        ...normalizeStringList(item.receiverThreadIds ?? item.receiver_thread_ids),
        ...normalizeStringList(item.newThreadId ?? item.new_thread_id),
      ];
      updateThreadParent(parentId, receivers);
    },
    [updateThreadParent],
  );

  const applyCollabThreadLinksFromThread = useCallback(
    (fallbackThreadId: string, thread: Record<string, unknown>) => {
      const turns = Array.isArray(thread.turns) ? thread.turns : [];
      turns.forEach((turn) => {
        const turnRecord = turn as Record<string, unknown>;
        const turnItems = Array.isArray(turnRecord.items)
          ? (turnRecord.items as Record<string, unknown>[])
          : [];
        turnItems.forEach((item) => {
          applyCollabThreadLinks(fallbackThreadId, item);
        });
      });
    },
    [applyCollabThreadLinks],
  );

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
        dispatch({ type: "markReviewing", threadId, isReviewing: true });
      } else if (itemType === "exitedReviewMode") {
        dispatch({ type: "markReviewing", threadId, isReviewing: false });
        markProcessing(threadId, false);
      }
      const converted = buildConversationItem(item);
      if (converted) {
        dispatch({ type: "upsertItem", threadId, item: converted });
      }
      safeMessageActivity();
    },
    [applyCollabThreadLinks, markProcessing, safeMessageActivity],
  );

  const handleToolOutputDelta = useCallback(
    (threadId: string, itemId: string, delta: string) => {
      markProcessing(threadId, true);
      dispatch({ type: "appendToolOutput", threadId, itemId, delta });
      safeMessageActivity();
    },
    [markProcessing, safeMessageActivity],
  );

  const handleWorkspaceConnected = useCallback(
    (workspaceId: string) => {
      onWorkspaceConnected(workspaceId);
      void refreshAccountRateLimits(workspaceId);
    },
    [onWorkspaceConnected, refreshAccountRateLimits],
  );

  const rememberApprovalPrefix = useCallback((workspaceId: string, command: string[]) => {
    const normalized = normalizeCommandTokens(command);
    if (!normalized.length) {
      return;
    }
    const allowlist = approvalAllowlistRef.current[workspaceId] ?? [];
    const exists = allowlist.some(
      (entry) =>
        entry.length === normalized.length &&
        entry.every((token, index) => token === normalized[index]),
    );
    if (!exists) {
      approvalAllowlistRef.current = {
        ...approvalAllowlistRef.current,
        [workspaceId]: [...allowlist, normalized],
      };
    }
  }, []);

  const handlers = useMemo(
    () => ({
      onWorkspaceConnected: handleWorkspaceConnected,
      onApprovalRequest: (approval: ApprovalRequest) => {
        const commandInfo = getApprovalCommandInfo(approval.params ?? {});
        const allowlist =
          approvalAllowlistRef.current[approval.workspace_id] ?? [];
        if (
          commandInfo &&
          matchesCommandPrefix(commandInfo.tokens, allowlist)
        ) {
          void respondToServerRequest(
            approval.workspace_id,
            approval.request_id,
            "accept",
          );
          return;
        }
        dispatch({ type: "addApproval", approval });
      },
      onAppServerEvent: (event: AppServerEvent) => {
        const method = String(event.message?.method ?? "");
        const inferredSource =
          method === "codex/stderr" ? "stderr" : "event";
        onDebug?.({
          id: `${Date.now()}-server-event`,
          timestamp: Date.now(),
          source: inferredSource,
          label: method || "event",
          payload: event,
        });
      },
      onAgentMessageDelta: ({
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
        dispatch({ type: "ensureThread", workspaceId, threadId });
        markProcessing(threadId, true);
        const hasCustomName = Boolean(getCustomName(workspaceId, threadId));
        dispatch({
          type: "appendAgentDelta",
          workspaceId,
          threadId,
          itemId,
          delta,
          hasCustomName,
        });
      },
      onAgentMessageCompleted: ({
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
          type: "setLastAgentMessage",
          threadId,
          text,
          timestamp,
        });
        markProcessing(threadId, false);
        recordThreadActivity(workspaceId, threadId, timestamp);
        safeMessageActivity();
        if (threadId !== activeThreadId) {
          dispatch({ type: "markUnread", threadId, hasUnread: true });
        }
      },
      onItemStarted: (
        workspaceId: string,
        threadId: string,
        item: Record<string, unknown>,
      ) => {
        handleItemUpdate(workspaceId, threadId, item, true);
      },
      onItemCompleted: (
        workspaceId: string,
        threadId: string,
        item: Record<string, unknown>,
      ) => {
        handleItemUpdate(workspaceId, threadId, item, false);
      },
      onReasoningSummaryDelta: (
        _workspaceId: string,
        threadId: string,
        itemId: string,
        delta: string,
      ) => {
        dispatch({ type: "appendReasoningSummary", threadId, itemId, delta });
      },
      onReasoningTextDelta: (
        _workspaceId: string,
        threadId: string,
        itemId: string,
        delta: string,
      ) => {
        dispatch({ type: "appendReasoningContent", threadId, itemId, delta });
      },
      onCommandOutputDelta: (
        _workspaceId: string,
        threadId: string,
        itemId: string,
        delta: string,
      ) => {
        handleToolOutputDelta(threadId, itemId, delta);
      },
      onFileChangeOutputDelta: (
        _workspaceId: string,
        threadId: string,
        itemId: string,
        delta: string,
      ) => {
        handleToolOutputDelta(threadId, itemId, delta);
      },
      onTurnStarted: (workspaceId: string, threadId: string, turnId: string) => {
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
          dispatch({ type: "setActiveTurnId", threadId, turnId });
        }
      },
      onTurnCompleted: (_workspaceId: string, threadId: string, _turnId: string) => {
        markProcessing(threadId, false);
        dispatch({ type: "setActiveTurnId", threadId, turnId: null });
        pendingInterruptsRef.current.delete(threadId);
      },
      onTurnPlanUpdated: (
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
      onThreadTokenUsageUpdated: (
        workspaceId: string,
        threadId: string,
        tokenUsage: Record<string, unknown>,
      ) => {
        dispatch({ type: "ensureThread", workspaceId, threadId });
        dispatch({
          type: "setThreadTokenUsage",
          threadId,
          tokenUsage: normalizeTokenUsage(tokenUsage),
        });
      },
      onAccountRateLimitsUpdated: (
        workspaceId: string,
        rateLimits: Record<string, unknown>,
      ) => {
        dispatch({
          type: "setRateLimits",
          workspaceId,
          rateLimits: normalizeRateLimits(rateLimits),
        });
      },
      onTurnError: (
        workspaceId: string,
        threadId: string,
        _turnId: string,
        payload: { message: string; willRetry: boolean },
      ) => {
        if (payload.willRetry) {
          return;
        }
        dispatch({ type: "ensureThread", workspaceId, threadId });
        markProcessing(threadId, false);
        dispatch({ type: "markReviewing", threadId, isReviewing: false });
        dispatch({
          type: "setActiveTurnId",
          threadId,
          turnId: null,
        });
        const message = payload.message
          ? `Turn failed: ${payload.message}`
          : "Turn failed.";
        pushThreadErrorMessage(threadId, message);
        safeMessageActivity();
      },
    }),
    [
      activeThreadId,
      getCustomName,
      handleWorkspaceConnected,
      handleItemUpdate,
      handleToolOutputDelta,
      markProcessing,
      onDebug,
      recordThreadActivity,
      pushThreadErrorMessage,
      safeMessageActivity,
    ],
  );

  useAppServerEvents(handlers);

  const startThreadForWorkspace = useCallback(
    async (workspaceId: string, options?: { activate?: boolean }) => {
      const shouldActivate = options?.activate !== false;
      onDebug?.({
        id: `${Date.now()}-client-thread-start`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/start",
        payload: { workspaceId },
      });
      try {
        const response = await startThreadService(workspaceId);
        onDebug?.({
          id: `${Date.now()}-server-thread-start`,
          timestamp: Date.now(),
          source: "server",
          label: "thread/start response",
          payload: response,
        });
        const thread = response.result?.thread ?? response.thread;
        const threadId = String(thread?.id ?? "");
        if (threadId) {
          dispatch({ type: "ensureThread", workspaceId, threadId });
          if (shouldActivate) {
            dispatch({ type: "setActiveThreadId", workspaceId, threadId });
          }
          loadedThreads.current[threadId] = true;
          return threadId;
        }
        return null;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-start-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/start error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [onDebug],
  );

  const startThread = useCallback(async () => {
    if (!activeWorkspaceId) {
      return null;
    }
    return startThreadForWorkspace(activeWorkspaceId);
  }, [activeWorkspaceId, startThreadForWorkspace]);

  const resumeThreadForWorkspace = useCallback(
    async (
      workspaceId: string,
      threadId: string,
      force = false,
      replaceLocal = false,
    ) => {
      if (!threadId) {
        return null;
      }
      if (!force && loadedThreads.current[threadId]) {
        return threadId;
      }
      onDebug?.({
        id: `${Date.now()}-client-thread-resume`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/resume",
        payload: { workspaceId, threadId },
      });
      try {
        const response =
          (await resumeThreadService(workspaceId, threadId)) as
            | Record<string, unknown>
            | null;
        onDebug?.({
          id: `${Date.now()}-server-thread-resume`,
          timestamp: Date.now(),
          source: "server",
          label: "thread/resume response",
          payload: response,
        });
        const result = (response?.result ?? response) as
          | Record<string, unknown>
          | null;
        const thread = (result?.thread ?? response?.thread ?? null) as
          | Record<string, unknown>
          | null;
        if (thread) {
          applyCollabThreadLinksFromThread(threadId, thread);
          const items = buildItemsFromThread(thread);
          const localItems = state.itemsByThread[threadId] ?? [];
          const shouldReplace =
            replaceLocal || replaceOnResumeRef.current[threadId] === true;
          if (shouldReplace) {
            replaceOnResumeRef.current[threadId] = false;
          }
          const mergedItems =
            items.length > 0
              ? shouldReplace
                ? items
                : mergeThreadItems(items, localItems)
              : localItems;
          if (mergedItems.length > 0) {
            dispatch({ type: "setThreadItems", threadId, items: mergedItems });
          }
          dispatch({
            type: "markReviewing",
            threadId,
            isReviewing: isReviewingFromThread(thread),
          });
          const preview = asString(thread?.preview ?? "");
          const customName = getCustomName(workspaceId, threadId);
          if (!customName && preview) {
            dispatch({
              type: "setThreadName",
              workspaceId,
              threadId,
              name: previewThreadName(preview, `Agent ${threadId.slice(0, 4)}`),
            });
          }
          const lastAgentMessage = [...mergedItems]
            .reverse()
            .find(
              (item) => item.kind === "message" && item.role === "assistant",
            ) as ConversationItem | undefined;
          const lastText =
            lastAgentMessage && lastAgentMessage.kind === "message"
              ? lastAgentMessage.text
              : preview;
          if (lastText) {
            dispatch({
              type: "setLastAgentMessage",
              threadId,
              text: lastText,
              timestamp: getThreadTimestamp(thread),
            });
          }
        }
        loadedThreads.current[threadId] = true;
        return threadId;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-resume-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/resume error",
          payload: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
    [applyCollabThreadLinksFromThread, getCustomName, onDebug, state.itemsByThread],
  );

  const refreshThread = useCallback(
    async (workspaceId: string, threadId: string) => {
      if (!threadId) {
        return null;
      }
      replaceOnResumeRef.current[threadId] = true;
      return resumeThreadForWorkspace(workspaceId, threadId, true, true);
    },
    [resumeThreadForWorkspace],
  );

  const resetWorkspaceThreads = useCallback(
    (workspaceId: string) => {
      const threadIds = new Set<string>();
      const list = state.threadsByWorkspace[workspaceId] ?? [];
      list.forEach((thread) => threadIds.add(thread.id));
      const activeThread = state.activeThreadIdByWorkspace[workspaceId];
      if (activeThread) {
        threadIds.add(activeThread);
      }
      threadIds.forEach((threadId) => {
        loadedThreads.current[threadId] = false;
      });
    },
    [state.activeThreadIdByWorkspace, state.threadsByWorkspace],
  );

  const listThreadsForWorkspace = useCallback(
    async (workspace: WorkspaceInfo) => {
      const workspacePath = normalizeRootPath(workspace.path);
      dispatch({
        type: "setThreadListLoading",
        workspaceId: workspace.id,
        isLoading: true,
      });
      dispatch({
        type: "setThreadListCursor",
        workspaceId: workspace.id,
        cursor: null,
      });
      onDebug?.({
        id: `${Date.now()}-client-thread-list`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/list",
        payload: { workspaceId: workspace.id, path: workspace.path },
      });
      try {
        const knownActivityByThread = threadActivityRef.current[workspace.id] ?? {};
        const hasKnownActivity = Object.keys(knownActivityByThread).length > 0;
        const matchingThreads: Record<string, unknown>[] = [];
        const targetCount = 20;
        const pageSize = 20;
        const maxPagesWithoutMatch = hasKnownActivity ? Number.POSITIVE_INFINITY : 5;
        let pagesFetched = 0;
        let cursor: string | null = null;
        do {
          pagesFetched += 1;
          const response =
            (await listThreadsService(
              workspace.id,
              cursor,
              pageSize,
            )) as Record<string, unknown>;
          onDebug?.({
            id: `${Date.now()}-server-thread-list`,
            timestamp: Date.now(),
            source: "server",
            label: "thread/list response",
            payload: response,
          });
          const result = (response.result ?? response) as Record<string, unknown>;
          const data = Array.isArray(result?.data)
            ? (result.data as Record<string, unknown>[])
            : [];
          const nextCursor =
            (result?.nextCursor ?? result?.next_cursor ?? null) as string | null;
          matchingThreads.push(
            ...data.filter(
              (thread) =>
                normalizeRootPath(String(thread?.cwd ?? "")) === workspacePath,
            ),
          );
          cursor = nextCursor;
          if (matchingThreads.length === 0 && pagesFetched >= maxPagesWithoutMatch) {
            break;
          }
        } while (cursor && matchingThreads.length < targetCount);

        const uniqueById = new Map<string, Record<string, unknown>>();
        matchingThreads.forEach((thread) => {
          const id = String(thread?.id ?? "");
          if (id && !uniqueById.has(id)) {
            uniqueById.set(id, thread);
          }
        });
        const uniqueThreads = Array.from(uniqueById.values());
        const activityByThread = threadActivityRef.current[workspace.id] ?? {};
        const nextActivityByThread = { ...activityByThread };
        let didChangeActivity = false;
        uniqueThreads.forEach((thread) => {
          const threadId = String(thread?.id ?? "");
          if (!threadId) {
            return;
          }
          const timestamp = getThreadTimestamp(thread);
          if (timestamp > (nextActivityByThread[threadId] ?? 0)) {
            nextActivityByThread[threadId] = timestamp;
            didChangeActivity = true;
          }
        });
        if (didChangeActivity) {
          const next = {
            ...threadActivityRef.current,
            [workspace.id]: nextActivityByThread,
          };
          threadActivityRef.current = next;
          saveThreadActivity(next);
        }
        uniqueThreads.sort((a, b) => {
          const aId = String(a?.id ?? "");
          const bId = String(b?.id ?? "");
          const aCreated = getThreadTimestamp(a);
          const bCreated = getThreadTimestamp(b);
          const aActivity = Math.max(nextActivityByThread[aId] ?? 0, aCreated);
          const bActivity = Math.max(nextActivityByThread[bId] ?? 0, bCreated);
          return bActivity - aActivity;
        });
        const summaries = uniqueThreads
          .slice(0, targetCount)
          .map((thread, index) => {
            const id = String(thread?.id ?? "");
            const preview = asString(thread?.preview ?? "").trim();
            const customName = getCustomName(workspace.id, id);
            const fallbackName = `Agent ${index + 1}`;
            const name = customName
              ? customName
              : preview.length > 0
                ? preview.length > 38
                  ? `${preview.slice(0, 38)}…`
                  : preview
                : fallbackName;
            return {
              id,
              name,
              updatedAt: getThreadTimestamp(thread),
            };
          })
          .filter((entry) => entry.id);
        dispatch({
          type: "setThreads",
          workspaceId: workspace.id,
          threads: summaries,
        });
        dispatch({
          type: "setThreadListCursor",
          workspaceId: workspace.id,
          cursor,
        });
        uniqueThreads.forEach((thread) => {
          const threadId = String(thread?.id ?? "");
          const preview = asString(thread?.preview ?? "").trim();
          if (!threadId || !preview) {
            return;
          }
          dispatch({
            type: "setLastAgentMessage",
            threadId,
            text: preview,
            timestamp: getThreadTimestamp(thread),
          });
        });
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-list-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/list error",
          payload: error instanceof Error ? error.message : String(error),
        });
      } finally {
        dispatch({
          type: "setThreadListLoading",
          workspaceId: workspace.id,
          isLoading: false,
        });
      }
    },
    [getCustomName, onDebug],
  );

  const loadOlderThreadsForWorkspace = useCallback(
    async (workspace: WorkspaceInfo) => {
      const nextCursor = state.threadListCursorByWorkspace[workspace.id] ?? null;
      if (!nextCursor) {
        return;
      }
      const workspacePath = normalizeRootPath(workspace.path);
      const existing = state.threadsByWorkspace[workspace.id] ?? [];
      dispatch({
        type: "setThreadListPaging",
        workspaceId: workspace.id,
        isLoading: true,
      });
      onDebug?.({
        id: `${Date.now()}-client-thread-list-older`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/list older",
        payload: { workspaceId: workspace.id, cursor: nextCursor },
      });
      try {
        const matchingThreads: Record<string, unknown>[] = [];
        const targetCount = 20;
        const pageSize = 20;
        const maxPagesWithoutMatch = 10;
        let pagesFetched = 0;
        let cursor: string | null = nextCursor;
        do {
          pagesFetched += 1;
          const response =
            (await listThreadsService(
              workspace.id,
              cursor,
              pageSize,
            )) as Record<string, unknown>;
          onDebug?.({
            id: `${Date.now()}-server-thread-list-older`,
            timestamp: Date.now(),
            source: "server",
            label: "thread/list older response",
            payload: response,
          });
          const result = (response.result ?? response) as Record<string, unknown>;
          const data = Array.isArray(result?.data)
            ? (result.data as Record<string, unknown>[])
            : [];
          const next =
            (result?.nextCursor ?? result?.next_cursor ?? null) as string | null;
          matchingThreads.push(
            ...data.filter(
              (thread) =>
                normalizeRootPath(String(thread?.cwd ?? "")) === workspacePath,
            ),
          );
          cursor = next;
          if (matchingThreads.length === 0 && pagesFetched >= maxPagesWithoutMatch) {
            break;
          }
        } while (cursor && matchingThreads.length < targetCount);

        const existingIds = new Set(existing.map((thread) => thread.id));
        const additions: ThreadSummary[] = [];
        matchingThreads.forEach((thread) => {
          const id = String(thread?.id ?? "");
          if (!id || existingIds.has(id)) {
            return;
          }
          const preview = asString(thread?.preview ?? "").trim();
          const customName = getCustomName(workspace.id, id);
          const fallbackName = `Agent ${existing.length + additions.length + 1}`;
          const name = customName
            ? customName
            : preview.length > 0
              ? preview.length > 38
                ? `${preview.slice(0, 38)}…`
                : preview
              : fallbackName;
          additions.push({ id, name, updatedAt: getThreadTimestamp(thread) });
          existingIds.add(id);
        });

        if (additions.length > 0) {
          dispatch({
            type: "setThreads",
            workspaceId: workspace.id,
            threads: [...existing, ...additions],
          });
        }
        dispatch({
          type: "setThreadListCursor",
          workspaceId: workspace.id,
          cursor,
        });
        matchingThreads.forEach((thread) => {
          const threadId = String(thread?.id ?? "");
          const preview = asString(thread?.preview ?? "").trim();
          if (!threadId || !preview) {
            return;
          }
          dispatch({
            type: "setLastAgentMessage",
            threadId,
            text: preview,
            timestamp: getThreadTimestamp(thread),
          });
        });
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-list-older-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/list older error",
          payload: error instanceof Error ? error.message : String(error),
        });
      } finally {
        dispatch({
          type: "setThreadListPaging",
          workspaceId: workspace.id,
          isLoading: false,
        });
      }
    },
    [
      getCustomName,
      onDebug,
      state.threadListCursorByWorkspace,
      state.threadsByWorkspace,
    ],
  );

  const ensureThreadForActiveWorkspace = useCallback(async () => {
    if (!activeWorkspace) {
      return null;
    }
    let threadId = activeThreadId;
    if (!threadId) {
      threadId = await startThreadForWorkspace(activeWorkspace.id);
      if (!threadId) {
        return null;
      }
    } else if (!loadedThreads.current[threadId]) {
      await resumeThreadForWorkspace(activeWorkspace.id, threadId);
    }
    return threadId;
  }, [activeWorkspace, activeThreadId, resumeThreadForWorkspace, startThreadForWorkspace]);

  const sendMessageToThread = useCallback(
    async (
      workspace: WorkspaceInfo,
      threadId: string,
      text: string,
      images: string[] = [],
      options?: { skipPromptExpansion?: boolean },
    ) => {
      const messageText = text.trim();
      if (!messageText && images.length === 0) {
        return;
      }
      let finalText = messageText;
      if (!options?.skipPromptExpansion) {
        const promptExpansion = expandCustomPromptText(messageText, customPrompts);
        if (promptExpansion && "error" in promptExpansion) {
          pushThreadErrorMessage(threadId, promptExpansion.error);
          safeMessageActivity();
          return;
        }
        finalText = promptExpansion?.expanded ?? messageText;
      }
      recordThreadActivity(workspace.id, threadId);
      const hasCustomName = Boolean(getCustomName(workspace.id, threadId));
      dispatch({
        type: "addUserMessage",
        workspaceId: workspace.id,
        threadId,
        text: finalText,
        images,
        hasCustomName,
      });
      markProcessing(threadId, true);
      safeMessageActivity();
      onDebug?.({
        id: `${Date.now()}-client-turn-start`,
        timestamp: Date.now(),
        source: "client",
        label: "turn/start",
        payload: {
          workspaceId: workspace.id,
          threadId,
          text: finalText,
          images,
          model,
          effort,
          collaborationMode,
        },
      });
      try {
        const response =
          (await sendUserMessageService(
            workspace.id,
            threadId,
            finalText,
            { model, effort, collaborationMode, accessMode, images },
          )) as Record<string, unknown>;
        onDebug?.({
          id: `${Date.now()}-server-turn-start`,
          timestamp: Date.now(),
          source: "server",
          label: "turn/start response",
          payload: response,
        });
        const rpcError = extractRpcErrorMessage(response);
        if (rpcError) {
          markProcessing(threadId, false);
          dispatch({ type: "setActiveTurnId", threadId, turnId: null });
          pushThreadErrorMessage(threadId, `Turn failed to start: ${rpcError}`);
          safeMessageActivity();
          return;
        }
        const result = (response?.result ?? response) as Record<string, unknown>;
        const turn = (result?.turn ?? response?.turn ?? null) as
          | Record<string, unknown>
          | null;
        const turnId = asString(turn?.id ?? "");
        if (!turnId) {
          markProcessing(threadId, false);
          dispatch({ type: "setActiveTurnId", threadId, turnId: null });
          pushThreadErrorMessage(threadId, "Turn failed to start.");
          safeMessageActivity();
          return;
        }
        dispatch({ type: "setActiveTurnId", threadId, turnId });
      } catch (error) {
        markProcessing(threadId, false);
        dispatch({ type: "setActiveTurnId", threadId, turnId: null });
        onDebug?.({
          id: `${Date.now()}-client-turn-start-error`,
          timestamp: Date.now(),
          source: "error",
          label: "turn/start error",
          payload: error instanceof Error ? error.message : String(error),
        });
        pushThreadErrorMessage(
          threadId,
          error instanceof Error ? error.message : String(error),
        );
        safeMessageActivity();
      }
    },
    [
      accessMode,
      collaborationMode,
      customPrompts,
      effort,
      getCustomName,
      markProcessing,
      model,
      onDebug,
      pushThreadErrorMessage,
      recordThreadActivity,
      safeMessageActivity,
    ],
  );

  const sendUserMessage = useCallback(
    async (text: string, images: string[] = []) => {
      if (!activeWorkspace) {
        return;
      }
      const messageText = text.trim();
      if (!messageText && images.length === 0) {
        return;
      }
      const promptExpansion = expandCustomPromptText(messageText, customPrompts);
      if (promptExpansion && "error" in promptExpansion) {
        if (activeThreadId) {
          pushThreadErrorMessage(activeThreadId, promptExpansion.error);
          safeMessageActivity();
        } else {
          onDebug?.({
            id: `${Date.now()}-client-prompt-expand-error`,
            timestamp: Date.now(),
            source: "error",
            label: "prompt/expand error",
            payload: promptExpansion.error,
          });
        }
        return;
      }
      const finalText = promptExpansion?.expanded ?? messageText;
      const threadId = await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return;
      }
      await sendMessageToThread(activeWorkspace, threadId, finalText, images, {
        skipPromptExpansion: true,
      });
    },
    [
      activeThreadId,
      activeWorkspace,
      customPrompts,
      ensureThreadForActiveWorkspace,
      onDebug,
      pushThreadErrorMessage,
      safeMessageActivity,
      sendMessageToThread,
    ],
  );

  const sendUserMessageToThread = useCallback(
    async (
      workspace: WorkspaceInfo,
      threadId: string,
      text: string,
      images: string[] = [],
    ) => {
      await sendMessageToThread(workspace, threadId, text, images);
    },
    [sendMessageToThread],
  );

  const interruptTurn = useCallback(async () => {
    if (!activeWorkspace || !activeThreadId) {
      return;
    }
    const activeTurnId = state.activeTurnIdByThread[activeThreadId] ?? null;
    const turnId = activeTurnId ?? "pending";
    markProcessing(activeThreadId, false);
    dispatch({ type: "setActiveTurnId", threadId: activeThreadId, turnId: null });
    dispatch({
      type: "addAssistantMessage",
      threadId: activeThreadId,
      text: "Session stopped.",
    });
    if (!activeTurnId) {
      pendingInterruptsRef.current.add(activeThreadId);
    }
    onDebug?.({
      id: `${Date.now()}-client-turn-interrupt`,
      timestamp: Date.now(),
      source: "client",
      label: "turn/interrupt",
      payload: {
        workspaceId: activeWorkspace.id,
        threadId: activeThreadId,
        turnId,
        queued: !activeTurnId,
      },
    });
    try {
      const response = await interruptTurnService(
        activeWorkspace.id,
        activeThreadId,
        turnId,
      );
      onDebug?.({
        id: `${Date.now()}-server-turn-interrupt`,
        timestamp: Date.now(),
        source: "server",
        label: "turn/interrupt response",
        payload: response,
      });
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-turn-interrupt-error`,
        timestamp: Date.now(),
        source: "error",
        label: "turn/interrupt error",
        payload: error instanceof Error ? error.message : String(error),
      });
    }
  }, [activeThreadId, activeWorkspace, markProcessing, onDebug, state.activeTurnIdByThread]);

  const startReview = useCallback(
    async (text: string) => {
      if (!activeWorkspace || !text.trim()) {
        return;
      }
      const threadId = await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return;
      }

      const target = parseReviewTarget(text);
      markProcessing(threadId, true);
      dispatch({ type: "markReviewing", threadId, isReviewing: true });
      dispatch({
        type: "upsertItem",
        threadId,
        item: {
          id: `review-start-${threadId}-${Date.now()}`,
          kind: "review",
          state: "started",
          text: formatReviewLabel(target),
        },
      });
      safeMessageActivity();
      onDebug?.({
        id: `${Date.now()}-client-review-start`,
        timestamp: Date.now(),
        source: "client",
        label: "review/start",
        payload: {
          workspaceId: activeWorkspace.id,
          threadId,
          target,
        },
      });
      try {
        const response = await startReviewService(
          activeWorkspace.id,
          threadId,
          target,
          "inline",
        );
        onDebug?.({
          id: `${Date.now()}-server-review-start`,
          timestamp: Date.now(),
          source: "server",
          label: "review/start response",
          payload: response,
        });
        const rpcError = extractRpcErrorMessage(response);
        if (rpcError) {
          markProcessing(threadId, false);
          dispatch({ type: "markReviewing", threadId, isReviewing: false });
          dispatch({ type: "setActiveTurnId", threadId, turnId: null });
          pushThreadErrorMessage(threadId, `Review failed to start: ${rpcError}`);
          safeMessageActivity();
          return;
        }
      } catch (error) {
        markProcessing(threadId, false);
        dispatch({ type: "markReviewing", threadId, isReviewing: false });
        onDebug?.({
          id: `${Date.now()}-client-review-start-error`,
          timestamp: Date.now(),
          source: "error",
          label: "review/start error",
          payload: error instanceof Error ? error.message : String(error),
        });
        pushThreadErrorMessage(
          threadId,
          error instanceof Error ? error.message : String(error),
        );
        safeMessageActivity();
      }
    },
    [
      activeWorkspace,
      ensureThreadForActiveWorkspace,
      markProcessing,
      onDebug,
      pushThreadErrorMessage,
      safeMessageActivity,
    ],
  );

  const handleApprovalDecision = useCallback(
    async (request: ApprovalRequest, decision: "accept" | "decline") => {
      await respondToServerRequest(
        request.workspace_id,
        request.request_id,
        decision,
      );
      dispatch({
        type: "removeApproval",
        requestId: request.request_id,
        workspaceId: request.workspace_id,
      });
    },
    [],
  );

  const handleApprovalRemember = useCallback(
    async (request: ApprovalRequest, command: string[]) => {
      try {
        await rememberApprovalRule(request.workspace_id, command);
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-approval-rule-error`,
          timestamp: Date.now(),
          source: "error",
          label: "approval rule error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }

      rememberApprovalPrefix(request.workspace_id, command);

      await respondToServerRequest(
        request.workspace_id,
        request.request_id,
        "accept",
      );
      dispatch({
        type: "removeApproval",
        requestId: request.request_id,
        workspaceId: request.workspace_id,
      });
    },
    [onDebug, rememberApprovalPrefix],
  );

  const setActiveThreadId = useCallback(
    (threadId: string | null, workspaceId?: string) => {
      const targetId = workspaceId ?? activeWorkspaceId;
      if (!targetId) {
        return;
      }
      dispatch({ type: "setActiveThreadId", workspaceId: targetId, threadId });
      if (threadId) {
        void resumeThreadForWorkspace(targetId, threadId, true);
      }
    },
    [activeWorkspaceId, resumeThreadForWorkspace],
  );

  const removeThread = useCallback(
    (workspaceId: string, threadId: string) => {
      unpinThread(workspaceId, threadId);
      dispatch({ type: "removeThread", workspaceId, threadId });
      (async () => {
        try {
          await archiveThreadService(workspaceId, threadId);
        } catch (error) {
          onDebug?.({
            id: `${Date.now()}-client-thread-archive-error`,
            timestamp: Date.now(),
            source: "error",
            label: "thread/archive error",
            payload: error instanceof Error ? error.message : String(error),
          });
        }
      })();
    },
    [onDebug, unpinThread],
  );

  const renameThread = useCallback(
    (workspaceId: string, threadId: string, newName: string) => {
      saveCustomName(workspaceId, threadId, newName);
      const key = makeCustomNameKey(workspaceId, threadId);
      customNamesRef.current[key] = newName;
      dispatch({ type: "setThreadName", workspaceId, threadId, name: newName });
    },
    [dispatch],
  );

  useEffect(() => {
    if (activeWorkspace?.connected) {
      void refreshAccountRateLimits(activeWorkspace.id);
    }
  }, [activeWorkspace?.connected, activeWorkspace?.id, refreshAccountRateLimits]);

  return {
    activeThreadId,
    setActiveThreadId,
    activeItems,
    approvals: state.approvals,
    threadsByWorkspace: state.threadsByWorkspace,
    threadParentById: state.threadParentById,
    threadStatusById: state.threadStatusById,
    threadListLoadingByWorkspace: state.threadListLoadingByWorkspace,
    threadListPagingByWorkspace: state.threadListPagingByWorkspace,
    threadListCursorByWorkspace: state.threadListCursorByWorkspace,
    activeTurnIdByThread: state.activeTurnIdByThread,
    tokenUsageByThread: state.tokenUsageByThread,
    rateLimitsByWorkspace: state.rateLimitsByWorkspace,
    planByThread: state.planByThread,
    lastAgentMessageByThread: state.lastAgentMessageByThread,
    refreshAccountRateLimits,
    interruptTurn,
    removeThread,
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    renameThread,
    startThread,
    startThreadForWorkspace,
    listThreadsForWorkspace,
    refreshThread,
    resetWorkspaceThreads,
    loadOlderThreadsForWorkspace,
    sendUserMessage,
    sendUserMessageToThread,
    startReview,
    handleApprovalDecision,
    handleApprovalRemember,
  };
}
