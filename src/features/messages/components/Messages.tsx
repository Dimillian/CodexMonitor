import { memo, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import type {
  ConversationItem,
  OpenAppTarget,
  RequestUserInputRequest,
  RequestUserInputResponse,
} from "../../../types";
import { PlanReadyFollowupMessage } from "../../app/components/PlanReadyFollowupMessage";
import { RequestUserInputMessage } from "../../app/components/RequestUserInputMessage";
import { useFileLinkOpener } from "../hooks/useFileLinkOpener";
import { parseReasoning } from "../utils/messageRenderUtils";
import {
  DiffRow,
  ExploreRow,
  MessageRow,
  ReasoningRow,
  ReviewRow,
  ToolRow,
  UserInputRow,
  WorkingIndicator,
} from "./MessageRows";
import { useMessagesViewState } from "./useMessagesViewState";

type MessagesProps = {
  items: ConversationItem[];
  threadId: string | null;
  workspaceId?: string | null;
  isThinking: boolean;
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
  userInputRequests?: RequestUserInputRequest[];
  onUserInputSubmit?: (
    request: RequestUserInputRequest,
    response: RequestUserInputResponse,
  ) => void;
  onPlanAccept?: () => void;
  onPlanSubmitChanges?: (changes: string) => void;
  onOpenThreadLink?: (threadId: string, workspaceId?: string | null) => void;
  onQuoteMessage?: (text: string) => void;
};

export const Messages = memo(function Messages({
  items,
  threadId,
  workspaceId = null,
  isThinking,
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
  userInputRequests = [],
  onUserInputSubmit,
  onPlanAccept,
  onPlanSubmitChanges,
  onOpenThreadLink,
  onQuoteMessage,
}: MessagesProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const root = document.documentElement;
    if (!root) {
      return undefined;
    }
    if (isThinking) {
      root.dataset.codexThinking = "true";
    } else if (root.dataset.codexThinking === "true") {
      delete root.dataset.codexThinking;
    }
    return () => {
      if (root.dataset.codexThinking === "true") {
        delete root.dataset.codexThinking;
      }
    };
  }, [isThinking]);

  const activeUserInputRequestId =
    threadId && userInputRequests.length
      ? (userInputRequests.find(
          (request) =>
            request.params.thread_id === threadId &&
            (!workspaceId || request.workspace_id === workspaceId),
        )?.request_id ?? null)
      : null;
  const { openFileLink, showFileLinkMenu } = useFileLinkOpener(
    workspacePath,
    openTargets,
    selectedOpenAppId,
  );
  const handleOpenThreadLink = useCallback(
    (threadId: string) => {
      onOpenThreadLink?.(threadId, workspaceId ?? null);
    },
    [onOpenThreadLink, workspaceId],
  );

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
  const {
    bottomRef,
    containerRef,
    contentRef,
    handleUserScrollIntent,
    updateAutoScroll,
    requestAutoScroll,
    expandedItems,
    toggleExpanded,
    collapsedToolGroups,
    toggleToolGroup,
    copiedMessageId,
    handleCopyMessage,
    handleQuoteMessage,
    reasoningMetaById,
    latestReasoningLabel,
    groupedItems,
    planFollowup,
    dismissPlanFollowup,
  } = useMessagesViewState({
    items,
    threadId,
    isThinking,
    activeUserInputRequestId,
    hasVisibleUserInputRequest,
    onPlanAccept,
    onPlanSubmitChanges,
    onQuoteMessage,
  });

  const planFollowupNode =
    planFollowup.shouldShow && onPlanAccept && onPlanSubmitChanges ? (
      <PlanReadyFollowupMessage
        onAccept={() => {
          dismissPlanFollowup();
          onPlanAccept();
        }}
        onSubmitChanges={(changes) => {
          dismissPlanFollowup();
          onPlanSubmitChanges(changes);
        }}
      />
    ) : null;

  const rowVirtualizer = useVirtualizer({
    count: groupedItems.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 120,
    overscan: 4,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualTopSpacer = virtualRows[0]?.start ?? 0;
  const virtualBottomSpacer =
    virtualRows.length > 0
      ? Math.max(
          rowVirtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0),
          0,
        )
      : 0;

  const renderItem = (item: ConversationItem) => {
    if (item.kind === "message") {
      const isCopied = copiedMessageId === item.id;
      return (
        <MessageRow
          key={item.id}
          item={item}
          isCopied={isCopied}
          onCopy={handleCopyMessage}
          onQuote={onQuoteMessage ? handleQuoteMessage : undefined}
          codeBlockCopyUseModifier={codeBlockCopyUseModifier}
          showMessageFilePath={showMessageFilePath}
          workspacePath={workspacePath}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={handleOpenThreadLink}
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
          onOpenThreadLink={handleOpenThreadLink}
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
          onOpenThreadLink={handleOpenThreadLink}
        />
      );
    }
    if (item.kind === "userInput") {
      const isExpanded = expandedItems.has(item.id);
      return (
        <UserInputRow
          key={item.id}
          item={item}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
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
          onOpenThreadLink={handleOpenThreadLink}
          onRequestAutoScroll={requestAutoScroll}
        />
      );
    }
    if (item.kind === "explore") {
      return <ExploreRow key={item.id} item={item} />;
    }
    return null;
  };

  const renderEntry = (
    entry: (typeof groupedItems)[number],
  ) => {
    if (entry.kind === "toolGroup") {
      const { group } = entry;
      const isCollapsed = collapsedToolGroups.has(group.id);
      const summaryParts = [
        group.toolCount === 1
          ? t("uiText.messages.oneToolCall")
          : t("uiText.messages.toolCallCount", { count: group.toolCount }),
      ];
      if (group.messageCount > 0) {
        summaryParts.push(
          group.messageCount === 1
            ? t("uiText.messages.oneMessage")
            : t("uiText.messages.messageCount", { count: group.messageCount }),
        );
      }
      const summaryText = summaryParts.join(", ");
      const groupBodyId = `tool-group-${group.id}`;
      const ChevronIcon = isCollapsed ? ChevronDown : ChevronUp;
      return (
        <div
          className={`tool-group ${isCollapsed ? "tool-group-collapsed" : ""}`}
        >
          <div className="tool-group-header">
            <button
              type="button"
              className="tool-group-toggle"
              onClick={() => toggleToolGroup(group.id)}
              aria-expanded={!isCollapsed}
              aria-controls={groupBodyId}
              aria-label={
                isCollapsed
                  ? t("uiText.messages.expandToolCalls")
                  : t("uiText.messages.collapseToolCalls")
              }
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

  return (
    <div
      className={`messages messages-full${isThinking ? " is-thinking" : ""}`}
      ref={containerRef}
      onWheelCapture={handleUserScrollIntent}
      onTouchStartCapture={handleUserScrollIntent}
      onScroll={updateAutoScroll}
    >
      <div className="messages-inner" ref={contentRef}>
        <div className="messages-virtual-content">
          {virtualTopSpacer > 0 ? (
            <div
              className="messages-virtual-spacer"
              style={{ height: `${virtualTopSpacer}px` }}
              aria-hidden
            />
          ) : null}
          {virtualRows.map((virtualRow) => {
            const entry = groupedItems[virtualRow.index];
            const entryKey =
              entry.kind === "toolGroup" ? `tool-group-${entry.group.id}` : entry.item.id;
            return (
              <div
                key={entryKey}
                className="messages-virtual-row"
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
              >
                {renderEntry(entry)}
              </div>
            );
          })}
          {virtualBottomSpacer > 0 ? (
            <div
              className="messages-virtual-spacer"
              style={{ height: `${virtualBottomSpacer}px` }}
              aria-hidden
            />
          ) : null}
        </div>
        {planFollowupNode}
        {userInputNode}
        <WorkingIndicator
          isThinking={isThinking}
          processingStartedAt={processingStartedAt}
          lastDurationMs={lastDurationMs}
          hasItems={items.length > 0}
          reasoningLabel={latestReasoningLabel}
          showPollingFetchStatus={showPollingFetchStatus}
          pollingIntervalMs={pollingIntervalMs}
        />
        {!items.length && !userInputNode && !isThinking && !isLoadingMessages && (
          <div className="empty messages-empty">
            {threadId
              ? t("uiText.messages.sendPromptToAgent")
              : t("uiText.messages.sendPromptToStartAgent")}
          </div>
        )}
        {!items.length && !userInputNode && !isThinking && isLoadingMessages && (
          <div className="empty messages-empty">
            <div className="messages-loading-indicator" role="status" aria-live="polite">
              <span className="working-dots" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              <span className="messages-loading-label">{t("uiText.messages.loading")}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} className="messages-bottom-anchor" />
      </div>
    </div>
  );
});
