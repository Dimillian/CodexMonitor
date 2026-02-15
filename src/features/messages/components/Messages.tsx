import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  ConversationItem,
  OpenAppTarget,
  RequestUserInputRequest,
  RequestUserInputResponse,
} from "../../../types";
import { isPlanReadyTaggedMessage } from "../../../utils/internalPlanReadyMessages";
import { PlanReadyFollowupMessage } from "../../app/components/PlanReadyFollowupMessage";
import { RequestUserInputMessage } from "../../app/components/RequestUserInputMessage";
import { useFileLinkOpener } from "../hooks/useFileLinkOpener";
import {
  SCROLL_THRESHOLD_PX,
  buildToolGroups,
  formatDurationMs,
  parseReasoning,
  scrollKeyForItems,
  toolStatusTone,
} from "../utils/messageRenderUtils";
import {
  DiffRow,
  ExploreRow,
  MessageRow,
  ReasoningRow,
  ReviewRow,
  ToolRow,
  WorkingIndicator,
} from "./MessageRows";

const ASSISTANT_AUTO_COLLAPSE_KEEP_RECENT_COUNT = 5;
const VIRTUAL_ROW_ESTIMATE_PX = 140;
const VIRTUAL_OVERSCAN_ROWS = 18;
const VIRTUAL_ENABLE_MIN_ROWS = 120;
const VIRTUAL_TOP_REACH_THRESHOLD_PX = 16;
const VIRTUAL_TOP_REACH_COOLDOWN_MS = 900;
const VIRTUAL_AUTO_TOP_REACH_ENABLED = true;
const AUTO_SCROLL_CAPTURE_THRESHOLD_PX = SCROLL_THRESHOLD_PX;
const AUTO_SCROLL_RELEASE_THRESHOLD_PX = SCROLL_THRESHOLD_PX * 3;
const TOOL_EXPANSION_STORAGE_KEY = "codex_monitor.tool_expansion.v1";
const THREAD_SCROLL_POSITION_STORAGE_KEY =
  "codex_monitor.thread_scroll_positions.v1";

type PersistedToolExpansionState = Record<string, Record<string, boolean>>;
type PersistedThreadScrollPositions = Record<string, number>;

function loadPersistedToolExpansionState(): PersistedToolExpansionState {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(TOOL_EXPANSION_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: PersistedToolExpansionState = {};
    Object.entries(parsed).forEach(([threadKey, value]) => {
      if (!threadKey || !value || typeof value !== "object" || Array.isArray(value)) {
        return;
      }
      const threadState: Record<string, boolean> = {};
      Object.entries(value).forEach(([itemId, expanded]) => {
        if (itemId && typeof expanded === "boolean") {
          threadState[itemId] = expanded;
        }
      });
      if (Object.keys(threadState).length > 0) {
        result[threadKey] = threadState;
      }
    });
    return result;
  } catch {
    return {};
  }
}

function savePersistedToolExpansionState(state: PersistedToolExpansionState) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(TOOL_EXPANSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort persistence; ignore storage quota/privacy mode failures.
  }
}

function loadPersistedThreadScrollPositions(): PersistedThreadScrollPositions {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(THREAD_SCROLL_POSITION_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: PersistedThreadScrollPositions = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (!key || typeof value !== "number" || !Number.isFinite(value)) {
        return;
      }
      result[key] = Math.max(0, Math.round(value));
    });
    return result;
  } catch {
    return {};
  }
}

function savePersistedThreadScrollPositions(
  state: PersistedThreadScrollPositions,
) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      THREAD_SCROLL_POSITION_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Best-effort persistence; ignore storage quota/privacy mode failures.
  }
}

type MessagesProps = {
  items: ConversationItem[];
  threadId: string | null;
  workspaceId?: string | null;
  isThinking: boolean;
  isStreaming?: boolean;
  isLoadingMessages?: boolean;
  processingStartedAt?: number | null;
  lastDurationMs?: number | null;
  showPollingFetchStatus?: boolean;
  pollingIntervalMs?: number;
  workspacePath?: string | null;
  openTargets: OpenAppTarget[];
  selectedOpenAppId: string;
  codeBlockCopyUseModifier?: boolean;
  showMessageFilePath?: boolean;
  threadScrollRestoreMode?: "latest" | "remember";
  userInputRequests?: RequestUserInputRequest[];
  onUserInputSubmit?: (
    request: RequestUserInputRequest,
    response: RequestUserInputResponse,
  ) => void;
  onPlanAccept?: () => void;
  onPlanSubmitChanges?: (changes: string) => void;
  onOpenThreadLink?: (threadId: string) => void;
  onReachTop?: () => boolean | void | Promise<boolean | void>;
};

type RenderableItemEntry = {
  key: string;
  item: ConversationItem;
  rowClassName: string;
};

function deriveMessageActivityPhase(
  isThinking: boolean,
  hasItems: boolean,
  isStreaming: boolean,
  elapsedMs: number,
): "start" | "in-progress" | "done" {
  if (!isThinking) {
    return "done";
  }
  if (isStreaming) {
    return "in-progress";
  }
  if (!hasItems && elapsedMs < 2000) {
    return "start";
  }
  return "start";
}

const MESSAGE_PHASE_LABELS: Record<"start" | "in-progress", string> = {
  start: "等待 Agent 响应…",
  "in-progress": "Agent 正在输出…",
};

function rowClassNameForItem(item: ConversationItem): string {
  if (item.kind === "message") {
    return item.role === "assistant"
      ? "item-message-assistant"
      : "item-message-user";
  }
  return `item-${item.kind}`;
}

export const Messages = memo(function Messages({
  items,
  threadId,
  workspaceId = null,
  isThinking,
  isStreaming = false,
  isLoadingMessages = false,
  processingStartedAt = null,
  lastDurationMs = null,
  showPollingFetchStatus = false,
  pollingIntervalMs = 12000,
  workspacePath = null,
  openTargets,
  selectedOpenAppId,
  codeBlockCopyUseModifier = false,
  showMessageFilePath = true,
  threadScrollRestoreMode = "latest",
  userInputRequests = [],
  onUserInputSubmit,
  onPlanAccept,
  onPlanSubmitChanges,
  onOpenThreadLink,
  onReachTop,
}: MessagesProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);
  const pendingThreadPinRef = useRef<string | null>(null);
  const currentThreadScrollStorageKeyRef = useRef<string | null>(null);
  const pendingScrollPersistRafRef = useRef<number | null>(null);
  const pendingScrollPersistValueRef = useRef<{
    storageKey: string;
    scrollTop: number;
  } | null>(null);

  const threadScrollStorageKey = useMemo(() => {
    if (!threadId) {
      return null;
    }
    return `${workspaceId ?? "global"}::${threadId}`;
  }, [threadId, workspaceId]);

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [persistedToolExpansionState, setPersistedToolExpansionState] =
    useState<PersistedToolExpansionState>(() => loadPersistedToolExpansionState());
  const persistedToolExpansionStateRef = useRef(persistedToolExpansionState);
  persistedToolExpansionStateRef.current = persistedToolExpansionState;
  const persistedThreadScrollPositionsRef = useRef<PersistedThreadScrollPositions>(
    loadPersistedThreadScrollPositions(),
  );
  const topReachInFlightRef = useRef(false);
  const topReachLastAtRef = useRef(0);
  const manuallyToggledExpandedRef = useRef<Set<string>>(new Set());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const copiedMessageIdRef = useRef(copiedMessageId);
  copiedMessageIdRef.current = copiedMessageId;
  const copyTimeoutRef = useRef<number | null>(null);
  const activeUserInputRequestId =
    threadId && userInputRequests.length
      ? (userInputRequests.find(
          (request) =>
            request.params.thread_id === threadId &&
            (!workspaceId || request.workspace_id === workspaceId),
        )?.request_id ?? null)
      : null;
  const scrollKey = `${scrollKeyForItems(items)}-${activeUserInputRequestId ?? "no-input"}`;
  const [statusElapsedMs, setStatusElapsedMs] = useState(0);
  const { openFileLink, showFileLinkMenu } = useFileLinkOpener(
    workspacePath,
    openTargets,
    selectedOpenAppId,
  );

  useEffect(() => {
    if (!isThinking || !processingStartedAt) {
      setStatusElapsedMs(0);
      return undefined;
    }
    setStatusElapsedMs(Date.now() - processingStartedAt);
    const interval = window.setInterval(() => {
      setStatusElapsedMs(Date.now() - processingStartedAt);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isThinking, processingStartedAt]);

  const distanceFromBottom = useCallback(
    (node: HTMLDivElement) => node.scrollHeight - node.scrollTop - node.clientHeight,
    [],
  );

  const isNearBottom = useCallback(
    (node: HTMLDivElement) =>
      distanceFromBottom(node) <= AUTO_SCROLL_CAPTURE_THRESHOLD_PX,
    [distanceFromBottom],
  );

  const computeAutoScrollEnabled = useCallback(
    (node: HTMLDivElement, previousEnabled: boolean) => {
      const distance = distanceFromBottom(node);
      if (previousEnabled) {
        return distance <= AUTO_SCROLL_RELEASE_THRESHOLD_PX;
      }
      return distance <= AUTO_SCROLL_CAPTURE_THRESHOLD_PX;
    },
    [distanceFromBottom],
  );


  const triggerTopReach = useCallback(() => {
    if (!onReachTop) {
      return;
    }
    const now = Date.now();
    if (topReachInFlightRef.current) {
      return;
    }
    if (now - topReachLastAtRef.current < VIRTUAL_TOP_REACH_COOLDOWN_MS) {
      return;
    }
    topReachInFlightRef.current = true;
    topReachLastAtRef.current = now;
    Promise.resolve(onReachTop())
      .catch(() => {
        // Best-effort only; top history fetch failures are handled by caller.
      })
      .finally(() => {
        topReachInFlightRef.current = false;
      });
  }, [onReachTop]);

  const persistThreadScrollPositionNow = useCallback(
    (storageKey: string, scrollTop: number) => {
      const normalizedTop = Math.max(0, Math.round(scrollTop));
      const current = persistedThreadScrollPositionsRef.current[storageKey];
      if (current === normalizedTop) {
        return;
      }
      const nextState = {
        ...persistedThreadScrollPositionsRef.current,
        [storageKey]: normalizedTop,
      };
      persistedThreadScrollPositionsRef.current = nextState;
      savePersistedThreadScrollPositions(nextState);
    },
    [],
  );

  const persistThreadScrollPosition = useCallback(
    (storageKey: string, scrollTop: number) => {
      if (typeof window === "undefined") {
        return;
      }
      pendingScrollPersistValueRef.current = {
        storageKey,
        scrollTop,
      };
      if (pendingScrollPersistRafRef.current !== null) {
        return;
      }
      pendingScrollPersistRafRef.current = window.requestAnimationFrame(() => {
        pendingScrollPersistRafRef.current = null;
        const pending = pendingScrollPersistValueRef.current;
        if (!pending) {
          return;
        }
        persistThreadScrollPositionNow(pending.storageKey, pending.scrollTop);
      });
    },
    [persistThreadScrollPositionNow],
  );

  useEffect(() => {
    return () => {
      const pending = pendingScrollPersistValueRef.current;
      if (pending) {
        persistThreadScrollPositionNow(pending.storageKey, pending.scrollTop);
      }
      if (pendingScrollPersistRafRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollPersistRafRef.current);
      }
    };
  }, [persistThreadScrollPositionNow]);

  // Keep auto-scroll state in sync immediately when user scrolls.
  // The virtual window state itself is batched into RAF to avoid jitter.
  const updateAutoScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const scrollTop = container.scrollTop;
    const nextAutoScrollEnabled = computeAutoScrollEnabled(
      container,
      autoScrollRef.current,
    );
    autoScrollRef.current = nextAutoScrollEnabled;

    if (
      VIRTUAL_AUTO_TOP_REACH_ENABLED &&
      onReachTop &&
      scrollTop <= VIRTUAL_TOP_REACH_THRESHOLD_PX
    ) {
      triggerTopReach();
    }
    if (threadScrollRestoreMode === "remember" && threadScrollStorageKey) {
      persistThreadScrollPosition(threadScrollStorageKey, scrollTop);
    }
  }, [
    computeAutoScrollEnabled,
    onReachTop,
    persistThreadScrollPosition,
    threadScrollRestoreMode,
    threadScrollStorageKey,
    triggerTopReach,
  ]);

  const requestAutoScroll = useCallback(() => {
    const container = containerRef.current;
    const shouldScroll =
      autoScrollRef.current || (container ? isNearBottom(container) : true);
    if (!shouldScroll) {
      return;
    }
    if (container) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [isNearBottom]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const previousStorageKey = currentThreadScrollStorageKeyRef.current;
    if (
      threadScrollRestoreMode === "remember" &&
      container &&
      previousStorageKey
    ) {
      persistThreadScrollPositionNow(previousStorageKey, container.scrollTop);
    }
    currentThreadScrollStorageKeyRef.current = threadScrollStorageKey;
    autoScrollRef.current = true;
    topReachInFlightRef.current = false;
    topReachLastAtRef.current = 0;
    manuallyToggledExpandedRef.current = new Set();
    setExpandedItems((prev) => (prev.size === 0 ? prev : new Set()));
    pendingThreadPinRef.current = threadId;
  }, [
    persistThreadScrollPositionNow,
    threadId,
    threadScrollRestoreMode,
    threadScrollStorageKey,
  ]);


  const toggleExpanded = useCallback((id: string) => {
    manuallyToggledExpandedRef.current.add(id);
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleToolExpanded = useCallback(
    (id: string) => {
      manuallyToggledExpandedRef.current.add(id);
      if (!threadId) {
        return;
      }
      setPersistedToolExpansionState((prev) => {
        const threadState = prev[threadId] ?? {};
        const nextExpanded = !(threadState[id] ?? false);
        const nextThreadState = {
          ...threadState,
          [id]: nextExpanded,
        };
        const nextState = {
          ...prev,
          [threadId]: nextThreadState,
        };
        savePersistedToolExpansionState(nextState);
        return nextState;
      });
    },
    [threadId],
  );

  // Incrementally cache reasoning parse results — only re-parse items whose
  // object reference actually changed, which avoids redundant work during
  // streaming when only the last message delta changes.
  const reasoningCacheRef = useRef(
    new Map<string, { item: ConversationItem; parsed: ReturnType<typeof parseReasoning> }>(),
  );
  const reasoningMetaById = useMemo(() => {
    const cache = reasoningCacheRef.current;
    const meta = new Map<string, ReturnType<typeof parseReasoning>>();
    const nextCache = new Map<string, { item: ConversationItem; parsed: ReturnType<typeof parseReasoning> }>();
    items.forEach((item) => {
      if (item.kind === "reasoning") {
        const cached = cache.get(item.id);
        if (cached && cached.item === item) {
          meta.set(item.id, cached.parsed);
          nextCache.set(item.id, cached);
        } else {
          const parsed = parseReasoning(item);
          meta.set(item.id, parsed);
          nextCache.set(item.id, { item, parsed });
        }
      }
    });
    reasoningCacheRef.current = nextCache;
    return meta;
  }, [items]);

  // Keep refs in sync so renderItem callback stays stable across renders
  const expandedItemsRef = useRef(expandedItems);
  expandedItemsRef.current = expandedItems;
  const reasoningMetaByIdRef = useRef(reasoningMetaById);
  reasoningMetaByIdRef.current = reasoningMetaById;

  const latestReasoningLabel = useMemo(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.kind === "message") {
        break;
      }
      if (item.kind !== "reasoning") {
        continue;
      }
      const parsed = reasoningMetaById.get(item.id);
      if (parsed?.workingLabel) {
        return parsed.workingLabel;
      }
    }
    return null;
  }, [items, reasoningMetaById]);
  const activityPhase = deriveMessageActivityPhase(
    isThinking,
    items.length > 0,
    isStreaming,
    statusElapsedMs,
  );
  const activityLabel =
    latestReasoningLabel
    || (activityPhase !== "done" ? MESSAGE_PHASE_LABELS[activityPhase] : "Agent 正在输出…");

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (
          item.kind === "message" &&
          item.role === "user" &&
          isPlanReadyTaggedMessage(item.text)
        ) {
          return false;
        }
        if (item.kind !== "reasoning") {
          return true;
        }
        return reasoningMetaById.get(item.id)?.hasBody ?? false;
      }),
    [items, reasoningMetaById],
  );

  useEffect(() => {
    for (let index = visibleItems.length - 1; index >= 0; index -= 1) {
      const item = visibleItems[index];
      if (
        item.kind === "tool" &&
        item.toolType === "plan" &&
        (item.output ?? "").trim().length > 0
      ) {
        const threadToolState =
          threadId ? persistedToolExpansionStateRef.current[threadId] : undefined;
        if (threadToolState && Object.prototype.hasOwnProperty.call(threadToolState, item.id)) {
          return;
        }
        if (manuallyToggledExpandedRef.current.has(item.id)) {
          return;
        }
        setExpandedItems((prev) => {
          if (prev.has(item.id)) {
            return prev;
          }
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });
        return;
      }
    }
  }, [threadId, visibleItems]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyMessage = useCallback(
    async (item: Extract<ConversationItem, { kind: "message" }>) => {
      try {
        await navigator.clipboard.writeText(item.text);
        setCopiedMessageId(item.id);
        if (copyTimeoutRef.current) {
          window.clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = window.setTimeout(() => {
          setCopiedMessageId(null);
        }, 1200);
      } catch {
        // No-op: clipboard errors can occur in restricted contexts.
      }
    },
    [],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const shouldScroll =
      autoScrollRef.current ||
      (container ? isNearBottom(container) : true);
    if (!shouldScroll) {
      return;
    }
    if (container) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [isNearBottom, isThinking, scrollKey, threadId]);

  const assistantAutoCollapsedIds = useMemo(() => {
    const ids = new Set<string>();
    let recentAssistantCount = 0;
    for (let index = visibleItems.length - 1; index >= 0; index -= 1) {
      const item = visibleItems[index];
      if (item.kind !== "message" || item.role !== "assistant") {
        continue;
      }
      if (recentAssistantCount >= ASSISTANT_AUTO_COLLAPSE_KEEP_RECENT_COUNT) {
        ids.add(item.id);
      }
      recentAssistantCount += 1;
    }
    return ids;
  }, [visibleItems]);

  const groupedItems = useMemo(() => buildToolGroups(visibleItems), [visibleItems]);

  const renderableEntries = useMemo<RenderableItemEntry[]>(() => {
    const flattened = groupedItems.flatMap((entry) => {
      if (entry.kind === "toolGroup") {
        return entry.group.items.map((item) => ({
          key: item.id,
          item,
          rowClassName: rowClassNameForItem(item),
        }));
      }
      return [
        {
          key: entry.item.id,
          item: entry.item,
          rowClassName: rowClassNameForItem(entry.item),
        },
      ];
    });

    return flattened.map((entry, index) => {
      const needsAssistantDivider =
        entry.item.kind === "message" &&
        entry.item.role === "assistant" &&
        index > 0;
      if (!needsAssistantDivider) {
        return entry;
      }
      return {
        ...entry,
        rowClassName: `${entry.rowClassName} item-message-assistant-divider`,
      };
    });
  }, [groupedItems]);

  const shouldVirtualize = renderableEntries.length >= VIRTUAL_ENABLE_MIN_ROWS;
  const virtualContentRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: renderableEntries.length,
    getItemKey: (index) => renderableEntries[index]?.key ?? index,
    getScrollElement: () => containerRef.current,
    estimateSize: () => VIRTUAL_ROW_ESTIMATE_PX,
    overscan: VIRTUAL_OVERSCAN_ROWS,
    enabled: shouldVirtualize,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualHeight = rowVirtualizer.getTotalSize();

  useLayoutEffect(() => {
    const virtualContent = virtualContentRef.current;
    if (!virtualContent || !shouldVirtualize) {
      return;
    }
    virtualContent.style.setProperty("--messages-virtual-height", `${totalVirtualHeight}px`);
  }, [shouldVirtualize, totalVirtualHeight]);

  useLayoutEffect(() => {
    const virtualContent = virtualContentRef.current;
    if (!virtualContent || !shouldVirtualize) {
      return;
    }
    for (const virtualRow of virtualRows) {
      const rowElement = virtualContent.querySelector<HTMLElement>(
        `[data-index="${virtualRow.index}"]`,
      );
      if (!rowElement) {
        continue;
      }
      rowElement.style.setProperty("--messages-virtual-row-offset", `${virtualRow.start}px`);
    }
  }, [shouldVirtualize, virtualRows]);

  useLayoutEffect(() => {
    if (!threadId || pendingThreadPinRef.current !== threadId) {
      return;
    }
    if (isLoadingMessages && renderableEntries.length === 0) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scrollToThreadBottom = () => {
      if (shouldVirtualize && renderableEntries.length > 0) {
        rowVirtualizer.scrollToIndex(renderableEntries.length - 1, {
          align: "end",
        });
      }
      container.scrollTop = container.scrollHeight;
    };
    const restoreThreadScrollPosition = () => {
      if (threadScrollRestoreMode === "latest") {
        scrollToThreadBottom();
        autoScrollRef.current = true;
        return;
      }
      const savedScrollTop = threadScrollStorageKey
        ? persistedThreadScrollPositionsRef.current[threadScrollStorageKey]
        : null;
      if (typeof savedScrollTop !== "number" || !Number.isFinite(savedScrollTop)) {
        scrollToThreadBottom();
        autoScrollRef.current = true;
        return;
      }
      const restoredScrollTop = savedScrollTop;
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      container.scrollTop = Math.min(
        Math.max(restoredScrollTop, 0),
        maxScrollTop,
      );
      autoScrollRef.current = isNearBottom(container);
    };

    restoreThreadScrollPosition();
    const rafId = window.requestAnimationFrame(restoreThreadScrollPosition);
    pendingThreadPinRef.current = null;

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [
    isLoadingMessages,
    renderableEntries.length,
    rowVirtualizer,
    shouldVirtualize,
    threadId,
    threadScrollRestoreMode,
    threadScrollStorageKey,
    isNearBottom,
  ]);

  const hasActiveUserInputRequest = activeUserInputRequestId !== null;
  const hasVisibleUserInputRequest = hasActiveUserInputRequest && Boolean(onUserInputSubmit);
  const userInputNode =
    hasActiveUserInputRequest && onUserInputSubmit ? (
      <RequestUserInputMessage
        requests={userInputRequests}
        activeThreadId={threadId}
        activeWorkspaceId={workspaceId}
        onSubmit={onUserInputSubmit}
      />
    ) : null;

  const [dismissedPlanFollowupByThread, setDismissedPlanFollowupByThread] =
    useState<Record<string, string>>({});

  const planFollowup = useMemo(() => {
    if (!threadId) {
      return { shouldShow: false, planItemId: null as string | null };
    }
    if (!onPlanAccept || !onPlanSubmitChanges) {
      return { shouldShow: false, planItemId: null as string | null };
    }
    if (hasVisibleUserInputRequest) {
      return { shouldShow: false, planItemId: null as string | null };
    }
    let planIndex = -1;
    let planItem: Extract<ConversationItem, { kind: "tool" }> | null = null;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.kind === "tool" && item.toolType === "plan") {
        planIndex = index;
        planItem = item;
        break;
      }
    }
    if (!planItem) {
      return { shouldShow: false, planItemId: null as string | null };
    }
    const planItemId = planItem.id;
    if (dismissedPlanFollowupByThread[threadId] === planItemId) {
      return { shouldShow: false, planItemId };
    }
    if (!(planItem.output ?? "").trim()) {
      return { shouldShow: false, planItemId };
    }
    const planTone = toolStatusTone(planItem, false);
    if (planTone === "failed") {
      return { shouldShow: false, planItemId };
    }
    // Some backends stream plan output deltas without a final status update. As
    // soon as the turn stops thinking, treat the latest plan output as ready.
    if (isThinking && planTone !== "completed") {
      return { shouldShow: false, planItemId };
    }
    for (let index = planIndex + 1; index < items.length; index += 1) {
      const item = items[index];
      if (item.kind === "message" && item.role === "user") {
        return { shouldShow: false, planItemId };
      }
    }
    return { shouldShow: true, planItemId };
  }, [
    dismissedPlanFollowupByThread,
    hasVisibleUserInputRequest,
    isThinking,
    items,
    onPlanAccept,
    onPlanSubmitChanges,
    threadId,
  ]);

  const planFollowupNode =
    planFollowup.shouldShow && onPlanAccept && onPlanSubmitChanges ? (
      <PlanReadyFollowupMessage
        onAccept={() => {
          if (threadId && planFollowup.planItemId) {
            setDismissedPlanFollowupByThread((prev) => ({
              ...prev,
              [threadId]: planFollowup.planItemId!,
            }));
          }
          onPlanAccept();
        }}
        onSubmitChanges={(changes) => {
          if (threadId && planFollowup.planItemId) {
            setDismissedPlanFollowupByThread((prev) => ({
              ...prev,
              [threadId]: planFollowup.planItemId!,
            }));
          }
          onPlanSubmitChanges(changes);
        }}
      />
    ) : null;

  // renderItem uses refs for high-frequency state (copiedMessageId, expandedItems,
  // reasoningMetaById) so the callback identity stays stable across streaming
  // updates. The child Row components are memo'd, so stable callback + stable item
  // references = zero wasted re-renders for unchanged rows.
  const renderItem = useCallback(
    (item: ConversationItem) => {
      if (item.kind === "message") {
        const isCopied = copiedMessageIdRef.current === item.id;
        return (
          <MessageRow
            key={item.id}
            item={item}
            isCopied={isCopied}
            onCopy={handleCopyMessage}
            codeBlockCopyUseModifier={codeBlockCopyUseModifier}
            showMessageFilePath={showMessageFilePath}
            workspaceId={workspaceId}
            workspacePath={workspacePath}
            onOpenFileLink={openFileLink}
            onOpenFileLinkMenu={showFileLinkMenu}
            onOpenThreadLink={onOpenThreadLink}
            shouldAutoCollapseLongAssistantMessage={assistantAutoCollapsedIds.has(item.id)}
          />
        );
      }
      if (item.kind === "reasoning") {
        const isExpanded = expandedItemsRef.current.has(item.id);
        const parsed =
          reasoningMetaByIdRef.current.get(item.id) ?? parseReasoning(item);
        return (
          <ReasoningRow
            key={item.id}
            item={item}
            parsed={parsed}
            isExpanded={isExpanded}
            onToggle={toggleExpanded}
            showMessageFilePath={showMessageFilePath}
            workspaceId={workspaceId}
            workspacePath={workspacePath}
            onOpenFileLink={openFileLink}
            onOpenFileLinkMenu={showFileLinkMenu}
            onOpenThreadLink={onOpenThreadLink}
          />
        );
      }
      if (item.kind === "review") {
        return (
          <ReviewRow
            key={item.id}
            item={item}
            showMessageFilePath={showMessageFilePath}
            workspaceId={workspaceId}
            workspacePath={workspacePath}
            onOpenFileLink={openFileLink}
            onOpenFileLinkMenu={showFileLinkMenu}
            onOpenThreadLink={onOpenThreadLink}
          />
        );
      }
      if (item.kind === "diff") {
        return <DiffRow key={item.id} item={item} />;
      }
      if (item.kind === "tool") {
        const persistedExpanded = Boolean(
          threadId && persistedToolExpansionStateRef.current[threadId]?.[item.id],
        );
        const isExpanded = persistedExpanded || expandedItemsRef.current.has(item.id);
        return (
          <ToolRow
            key={item.id}
            item={item}
            isExpanded={isExpanded}
            onToggle={toggleToolExpanded}
            showMessageFilePath={showMessageFilePath}
            workspaceId={workspaceId}
            workspacePath={workspacePath}
            onOpenFileLink={openFileLink}
            onOpenFileLinkMenu={showFileLinkMenu}
            onOpenThreadLink={onOpenThreadLink}
            onRequestAutoScroll={requestAutoScroll}
          />
        );
      }
      if (item.kind === "explore") {
        return <ExploreRow key={item.id} item={item} />;
      }
      return null;
    },
    [
      handleCopyMessage,
      codeBlockCopyUseModifier,
      showMessageFilePath,
      workspaceId,
      workspacePath,
      openFileLink,
      showFileLinkMenu,
      onOpenThreadLink,
      toggleExpanded,
      toggleToolExpanded,
      requestAutoScroll,
      assistantAutoCollapsedIds,
      threadId,
    ],
  );

  return (
    <div
      className="messages messages-full"
      ref={containerRef}
      onScroll={updateAutoScroll}
    >
      {isThinking && (
        <div className={`messages-status-bar working-phase-${activityPhase}`} aria-live="polite">
          <span className="working-spinner" aria-hidden />
          <span className="messages-status-text">{activityLabel}</span>
          <span className="messages-status-timer">{formatDurationMs(statusElapsedMs)}</span>
          <span className="messages-status-phase-badge">
            {activityPhase === "start" ? "等待中" : "输出中"}
          </span>
        </div>
      )}
      {/* Top manual "load older" control removed.
          Upward scroll-to-top still triggers onReachTop for history loading. */}
      {renderableEntries.length > 0 && shouldVirtualize && (
        <div className="messages-virtual-content is-virtualized" ref={virtualContentRef}>
          {virtualRows.map((virtualRow) => {
            const entry = renderableEntries[virtualRow.index];
            if (!entry) {
              return null;
            }
            return (
              <div
                key={entry.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className={`messages-virtual-row is-virtualized ${entry.rowClassName}`}
              >
                {renderItem(entry.item)}
              </div>
            );
          })}
        </div>
      )}
      {renderableEntries.length > 0 && !shouldVirtualize && (
        <div className="messages-virtual-content">
          {renderableEntries.map((entry) => (
            <div key={entry.key} className={`messages-virtual-row ${entry.rowClassName}`}>
              {renderItem(entry.item)}
            </div>
          ))}
        </div>
      )}
      {planFollowupNode}
      {userInputNode}
      <WorkingIndicator
        isThinking={isThinking}
        isStreaming={isStreaming}
        processingStartedAt={processingStartedAt}
        lastDurationMs={lastDurationMs}
        hasItems={items.length > 0}
        reasoningLabel={latestReasoningLabel}
        showPollingFetchStatus={showPollingFetchStatus}
        pollingIntervalMs={pollingIntervalMs}
      />
      {!items.length && !userInputNode && !isThinking && !isLoadingMessages && (
        <div className="empty messages-empty">
          {threadId ? "发送消息开始对话。" : "发送消息开始新对话。"}
        </div>
      )}
      {!items.length && !userInputNode && !isThinking && isLoadingMessages && (
        <div className="empty messages-empty">
          <div className="messages-loading-indicator" role="status" aria-live="polite">
            <span className="working-spinner" aria-hidden />
            <span className="messages-loading-label">正在加载对话记录…</span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
});
