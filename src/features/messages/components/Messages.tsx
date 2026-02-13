import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
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
  formatCount,
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

type MessagesProps = {
  items: ConversationItem[];
  threadId: string | null;
  workspaceId?: string | null;
  isThinking: boolean;
  isLoadingMessages?: boolean;
  processingStartedAt?: number | null;
  lastDurationMs?: number | null;
  workspacePath?: string | null;
  openTargets: OpenAppTarget[];
  selectedOpenAppId: string;
  codeBlockCopyUseModifier?: boolean;
  showMessageFilePath?: boolean;
  userInputRequests?: RequestUserInputRequest[];
  onUserInputSubmit?: (
    request: RequestUserInputRequest,
    response: RequestUserInputResponse,
  ) => void;
  onPlanAccept?: () => void;
  onPlanSubmitChanges?: (changes: string) => void;
  onOpenThreadLink?: (threadId: string) => void;
};

export const Messages = memo(function Messages({
  items,
  threadId,
  workspaceId = null,
  isThinking,
  isLoadingMessages = false,
  processingStartedAt = null,
  lastDurationMs = null,
  workspacePath = null,
  openTargets,
  selectedOpenAppId,
  codeBlockCopyUseModifier = false,
  showMessageFilePath = true,
  userInputRequests = [],
  onUserInputSubmit,
  onPlanAccept,
  onPlanSubmitChanges,
  onOpenThreadLink,
}: MessagesProps) {
  const SCROLL_UP_DISABLE_AUTO_SCROLL_PX = 24;
  const USER_SCROLL_INPUT_TTL_MS = 450;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowNodesByKeyRef = useRef(new Map<string, HTMLDivElement>());
  const rowResizeObserversRef = useRef(new Map<Element, ResizeObserver>());
  const rowRefCallbacksByKeyRef = useRef(
    new Map<string, (node: HTMLDivElement | null) => void>(),
  );
  const autoScrollRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const userUpwardScrollDistanceRef = useRef(0);
  const lastUserScrollInputAtRef = useRef(0);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const manuallyToggledExpandedRef = useRef<Set<string>>(new Set());
  const [collapsedToolGroups, setCollapsedToolGroups] = useState<Set<string>>(
    new Set(),
  );
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
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
  const { openFileLink, showFileLinkMenu } = useFileLinkOpener(
    workspacePath,
    openTargets,
    selectedOpenAppId,
  );

  const isNearBottom = useCallback(
    (node: HTMLDivElement) =>
      node.scrollHeight - node.scrollTop - node.clientHeight <= SCROLL_THRESHOLD_PX,
    [],
  );

  const updateAutoScroll = () => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const scrollTop = container.scrollTop;
    const lastScrollTop = lastScrollTopRef.current;
    const upwardDelta = Math.max(0, lastScrollTop - scrollTop);
    const downwardDelta = Math.max(0, scrollTop - lastScrollTop);
    const hasRecentUserScrollInput =
      Date.now() - lastUserScrollInputAtRef.current <= USER_SCROLL_INPUT_TTL_MS;

    if (hasRecentUserScrollInput && upwardDelta > 0) {
      userUpwardScrollDistanceRef.current += upwardDelta;
    } else if (downwardDelta > 0) {
      userUpwardScrollDistanceRef.current = 0;
    }

    if (userUpwardScrollDistanceRef.current > SCROLL_UP_DISABLE_AUTO_SCROLL_PX) {
      autoScrollRef.current = false;
    } else if (isNearBottom(container)) {
      autoScrollRef.current = true;
    }

    lastScrollTopRef.current = scrollTop;
  };

  const requestAutoScroll = useCallback(() => {
    if (!autoScrollRef.current) {
      return;
    }
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
      lastScrollTopRef.current = container.scrollTop;
      userUpwardScrollDistanceRef.current = 0;
    }
  }, []);

  useLayoutEffect(() => {
    autoScrollRef.current = true;
    lastScrollTopRef.current = containerRef.current?.scrollTop ?? 0;
    userUpwardScrollDistanceRef.current = 0;
  }, [threadId]);

  const markUserScrollInput = useCallback(() => {
    lastUserScrollInputAtRef.current = Date.now();
  }, []);

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

  const toggleToolGroup = useCallback((id: string) => {
    setCollapsedToolGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const reasoningMetaById = useMemo(() => {
    const meta = new Map<string, ReturnType<typeof parseReasoning>>();
    items.forEach((item) => {
      if (item.kind === "reasoning") {
        meta.set(item.id, parseReasoning(item));
      }
    });
    return meta;
  }, [items]);

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
  }, [visibleItems]);

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
    if (!autoScrollRef.current) {
      return;
    }
    if (container) {
      container.scrollTop = container.scrollHeight;
      lastScrollTopRef.current = container.scrollTop;
      userUpwardScrollDistanceRef.current = 0;
    }
  }, [scrollKey, isThinking, threadId]);

  const groupedItems = useMemo(() => buildToolGroups(visibleItems), [visibleItems]);

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

  const renderItem = (item: ConversationItem) => {
    if (item.kind === "message") {
      const isCopied = copiedMessageId === item.id;
      return (
        <MessageRow
          key={item.id}
          item={item}
          isCopied={isCopied}
          onCopy={handleCopyMessage}
          codeBlockCopyUseModifier={codeBlockCopyUseModifier}
          showMessageFilePath={showMessageFilePath}
          workspacePath={workspacePath}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={onOpenThreadLink}
        />
      );
    }
    if (item.kind === "reasoning") {
      const isExpanded = expandedItems.has(item.id);
      const parsed = reasoningMetaById.get(item.id) ?? parseReasoning(item);
      return (
        <ReasoningRow
          key={item.id}
          item={item}
          parsed={parsed}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
          showMessageFilePath={showMessageFilePath}
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
      const isExpanded = expandedItems.has(item.id);
      return (
        <ToolRow
          key={item.id}
          item={item}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
          showMessageFilePath={showMessageFilePath}
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
  };

  const renderGroupedEntry = (entry: (typeof groupedItems)[number]) => {
    if (entry.kind === "toolGroup") {
      const { group } = entry;
      const isCollapsed = collapsedToolGroups.has(group.id);
      const summaryParts = [formatCount(group.toolCount, "tool call", "tool calls")];
      if (group.messageCount > 0) {
        summaryParts.push(formatCount(group.messageCount, "message", "messages"));
      }
      const summaryText = summaryParts.join(", ");
      const groupBodyId = `tool-group-${group.id}`;
      const ChevronIcon = isCollapsed ? ChevronDown : ChevronUp;
      return (
        <div className={`tool-group ${isCollapsed ? "tool-group-collapsed" : ""}`}>
          <div className="tool-group-header">
            <button
              type="button"
              className="tool-group-toggle"
              onClick={() => toggleToolGroup(group.id)}
              aria-expanded={!isCollapsed}
              aria-controls={groupBodyId}
              aria-label={isCollapsed ? "Expand tool calls" : "Collapse tool calls"}
            >
              <span className="tool-group-chevron" aria-hidden>
                <ChevronIcon size={14} />
              </span>
              <span className="tool-group-summary">{summaryText}</span>
            </button>
          </div>
          {!isCollapsed && (
            <div className="tool-group-body" id={groupBodyId}>
              {group.items.map(renderItem)}
            </div>
          )}
        </div>
      );
    }
    return renderItem(entry.item);
  };

  type MessagesVirtualEntry =
    | { kind: "grouped"; key: string; entry: (typeof groupedItems)[number] }
    | { kind: "planFollowup"; key: string }
    | { kind: "userInput"; key: string }
    | { kind: "working"; key: string }
    | { kind: "empty"; key: string; variant: "idle" | "loading" };

  const hasPlanFollowup = Boolean(planFollowupNode);
  const hasUserInput = Boolean(userInputNode);

  const virtualEntries = useMemo<MessagesVirtualEntry[]>(() => {
    const entries: MessagesVirtualEntry[] = groupedItems.map((entry) => ({
      kind: "grouped",
      key: entry.kind === "toolGroup" ? `tool-group-${entry.group.id}` : entry.item.id,
      entry,
    }));

    if (hasPlanFollowup) {
      entries.push({
        kind: "planFollowup",
        key: planFollowup.planItemId
          ? `plan-followup-${planFollowup.planItemId}`
          : "plan-followup",
      });
    }

    if (hasUserInput) {
      entries.push({
        kind: "userInput",
        key: activeUserInputRequestId
          ? `user-input-${activeUserInputRequestId}`
          : "user-input",
      });
    }

    entries.push({ kind: "working", key: "working" });

    if (!items.length && !hasUserInput && !isThinking && !isLoadingMessages) {
      entries.push({
        kind: "empty",
        key: threadId ? `empty-${threadId}` : "empty",
        variant: "idle",
      });
    }

    if (!items.length && !hasUserInput && !isThinking && isLoadingMessages) {
      entries.push({
        kind: "empty",
        key: threadId ? `loading-${threadId}` : "loading",
        variant: "loading",
      });
    }

    return entries;
  }, [
    activeUserInputRequestId,
    groupedItems,
    hasPlanFollowup,
    hasUserInput,
    isLoadingMessages,
    isThinking,
    items.length,
    planFollowup.planItemId,
    threadId,
  ]);

  const rowVirtualizer = useVirtualizer({
    count: virtualEntries.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 140,
    overscan: 8,
    getItemKey: (index) => virtualEntries[index]?.key ?? index,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  const rowVirtualizerRef = useRef(rowVirtualizer);
  rowVirtualizerRef.current = rowVirtualizer;

  const requestAutoScrollRef = useRef(requestAutoScroll);
  requestAutoScrollRef.current = requestAutoScroll;

  const getRowRefCallback = useCallback((key: string) => {
    const cached = rowRefCallbacksByKeyRef.current.get(key);
    if (cached) {
      return cached;
    }

    const callback = (node: HTMLDivElement | null) => {
      const prevNode = rowNodesByKeyRef.current.get(key);
      if (prevNode && prevNode !== node) {
        const prevObserver = rowResizeObserversRef.current.get(prevNode);
        if (prevObserver) {
          prevObserver.disconnect();
          rowResizeObserversRef.current.delete(prevNode);
        }
      }
      if (!node) {
        rowNodesByKeyRef.current.delete(key);
        rowRefCallbacksByKeyRef.current.delete(key);
        return;
      }
      rowNodesByKeyRef.current.set(key, node);
      rowVirtualizerRef.current.measureElement(node);
      if (rowResizeObserversRef.current.has(node)) {
        return;
      }
      const observer = new ResizeObserver(() => {
        rowVirtualizerRef.current.measureElement(node);
        if (autoScrollRef.current) {
          requestAutoScrollRef.current();
        }
      });
      observer.observe(node);
      rowResizeObserversRef.current.set(node, observer);
    };

    rowRefCallbacksByKeyRef.current.set(key, callback);
    return callback;
  }, []);


  useEffect(() => {
    const observers = rowResizeObserversRef.current;
    return () => {
      for (const observer of observers.values()) {
        observer.disconnect();
      }
      observers.clear();
    };
  }, []);

  return (
    <div
      className="messages messages-full"
      ref={containerRef}
      onScroll={updateAutoScroll}
      onWheel={markUserScrollInput}
      onTouchMove={markUserScrollInput}
    >
      <div
        className="messages-virtual-list"
        style={{
          height: rowVirtualizer.getTotalSize(),
        }}
      >
        {virtualRows.map((virtualRow) => {
          const entry = virtualEntries[virtualRow.index];
          if (!entry) {
            return null;
          }
          return (
            <div
              key={entry.key}
              className="messages-virtual-row"
              data-index={virtualRow.index}
              ref={getRowRefCallback(entry.key)}
              style={{
                transform: `translate3d(0, ${virtualRow.start}px, 0)`,
              }}
            >
              {entry.kind === "grouped" && renderGroupedEntry(entry.entry)}
              {entry.kind === "planFollowup" && planFollowupNode}
              {entry.kind === "userInput" && userInputNode}
              {entry.kind === "working" && (
                <WorkingIndicator
                  isThinking={isThinking}
                  processingStartedAt={processingStartedAt}
                  lastDurationMs={lastDurationMs}
                  hasItems={items.length > 0}
                  reasoningLabel={latestReasoningLabel}
                />
              )}
              {entry.kind === "empty" && entry.variant === "idle" && (
                <div className="empty messages-empty">
                  {threadId
                    ? "Send a prompt to the agent."
                    : "Send a prompt to start a new agent."}
                </div>
              )}
              {entry.kind === "empty" && entry.variant === "loading" && (
                <div className="empty messages-empty">
                  <div
                    className="messages-loading-indicator"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="working-spinner" aria-hidden />
                    <span className="messages-loading-label">Loading…</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
