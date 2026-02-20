import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import * as Sentry from "@sentry/react";
import type {
  CustomPromptOption,
  DebugEntry,
  ThreadListSortKey,
  WorkspaceInfo,
} from "@/types";
import { CHAT_SCROLLBACK_DEFAULT } from "@utils/chatScrollback";
import { useAppServerEvents } from "@app/hooks/useAppServerEvents";
import { initialState, threadReducer } from "./useThreadsReducer";
import { useThreadStorage } from "./useThreadStorage";
import { useThreadLinking } from "./useThreadLinking";
import { useThreadEventHandlers } from "./useThreadEventHandlers";
import { useThreadActions } from "./useThreadActions";
import { useThreadMessaging } from "./useThreadMessaging";
import { useThreadApprovals } from "./useThreadApprovals";
import { useThreadAccountInfo } from "./useThreadAccountInfo";
import { useThreadRateLimits } from "./useThreadRateLimits";
import { useThreadSelectors } from "./useThreadSelectors";
import { useThreadStatus } from "./useThreadStatus";
import { useThreadUserInput } from "./useThreadUserInput";
import { useThreadTitleAutogeneration } from "./useThreadTitleAutogeneration";
import {
  archiveThread as archiveThreadService,
  setThreadName as setThreadNameService,
} from "@services/tauri";
import {
  loadDetachedReviewLinks,
  makeCustomNameKey,
  saveCustomName,
  saveDetachedReviewLinks,
} from "@threads/utils/threadStorage";
import { getParentThreadIdFromSource } from "@threads/utils/threadRpc";
import { getSubagentDescendantThreadIds } from "@threads/utils/subagentTree";

type UseThreadsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onWorkspaceConnected: (id: string) => void;
  onDebug?: (entry: DebugEntry) => void;
  ensureWorkspaceRuntimeCodexArgs?: (
    workspaceId: string,
    threadId: string | null,
  ) => Promise<void>;
  model?: string | null;
  effort?: string | null;
  collaborationMode?: Record<string, unknown> | null;
  accessMode?: "read-only" | "current" | "full-access";
  reviewDeliveryMode?: "inline" | "detached";
  steerEnabled?: boolean;
  threadTitleAutogenerationEnabled?: boolean;
  chatHistoryScrollbackItems?: number | null;
  customPrompts?: CustomPromptOption[];
  onMessageActivity?: () => void;
  threadSortKey?: ThreadListSortKey;
};

function buildWorkspaceThreadKey(workspaceId: string, threadId: string) {
  return `${workspaceId}:${threadId}`;
}

const CASCADE_ARCHIVE_SKIP_TTL_MS = 120_000;

export function useThreads({
  activeWorkspace,
  onWorkspaceConnected,
  onDebug,
  ensureWorkspaceRuntimeCodexArgs,
  model,
  effort,
  collaborationMode,
  accessMode,
  reviewDeliveryMode = "inline",
  steerEnabled = false,
  threadTitleAutogenerationEnabled = false,
  chatHistoryScrollbackItems,
  customPrompts = [],
  onMessageActivity,
  threadSortKey = "updated_at",
}: UseThreadsOptions) {
  const maxItemsPerThread =
    chatHistoryScrollbackItems === undefined
      ? CHAT_SCROLLBACK_DEFAULT
      : chatHistoryScrollbackItems;

  const [state, dispatch] = useReducer(
    threadReducer,
    maxItemsPerThread,
    (initialMaxItemsPerThread) => ({
      ...initialState,
      maxItemsPerThread: initialMaxItemsPerThread,
    }),
  );
  useEffect(() => {
    dispatch({ type: "setMaxItemsPerThread", maxItemsPerThread });
  }, [dispatch, maxItemsPerThread]);
  const loadedThreadsRef = useRef<Record<string, boolean>>({});
  const replaceOnResumeRef = useRef<Record<string, boolean>>({});
  const pendingInterruptsRef = useRef<Set<string>>(new Set());
  const planByThreadRef = useRef(state.planByThread);
  const itemsByThreadRef = useRef(state.itemsByThread);
  const threadsByWorkspaceRef = useRef(state.threadsByWorkspace);
  const activeTurnIdByThreadRef = useRef(state.activeTurnIdByThread);
  const detachedReviewStartedNoticeRef = useRef<Set<string>>(new Set());
  const detachedReviewCompletedNoticeRef = useRef<Set<string>>(new Set());
  const detachedReviewParentByChildRef = useRef<Record<string, string>>({});
  const subagentThreadByWorkspaceThreadRef = useRef<Record<string, true>>({});
  const threadParentByIdRef = useRef(state.threadParentById);
  const cascadeArchiveSkipRef = useRef<Record<string, number>>({});
  const detachedReviewLinksByWorkspaceRef = useRef(loadDetachedReviewLinks());
  planByThreadRef.current = state.planByThread;
  itemsByThreadRef.current = state.itemsByThread;
  threadsByWorkspaceRef.current = state.threadsByWorkspace;
  activeTurnIdByThreadRef.current = state.activeTurnIdByThread;
  threadParentByIdRef.current = state.threadParentById;
  const { approvalAllowlistRef, handleApprovalDecision, handleApprovalRemember } =
    useThreadApprovals({ dispatch, onDebug });
  const { handleUserInputSubmit } = useThreadUserInput({ dispatch });
  const {
    customNamesRef,
    threadActivityRef,
    pinnedThreadsVersion,
    getCustomName,
    recordThreadActivity,
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
  } = useThreadStorage();

  const activeWorkspaceId = activeWorkspace?.id ?? null;
  const { activeThreadId, activeItems } = useThreadSelectors({
    activeWorkspaceId,
    activeThreadIdByWorkspace: state.activeThreadIdByWorkspace,
    itemsByThread: state.itemsByThread,
  });

  const { refreshAccountRateLimits } = useThreadRateLimits({
    activeWorkspaceId,
    activeWorkspaceConnected: activeWorkspace?.connected,
    dispatch,
    onDebug,
  });
  const { refreshAccountInfo } = useThreadAccountInfo({
    activeWorkspaceId,
    activeWorkspaceConnected: activeWorkspace?.connected,
    dispatch,
    onDebug,
  });

  const { markProcessing, markReviewing, setActiveTurnId } = useThreadStatus({
    dispatch,
  });

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
    [activeThreadId, dispatch],
  );

  const safeMessageActivity = useCallback(() => {
    try {
      void onMessageActivity?.();
    } catch {
      // Ignore refresh errors to avoid breaking the UI.
    }
  }, [onMessageActivity]);

  const renameThread = useCallback(
    (workspaceId: string, threadId: string, newName: string) => {
      saveCustomName(workspaceId, threadId, newName);
      const key = makeCustomNameKey(workspaceId, threadId);
      customNamesRef.current[key] = newName;
      dispatch({ type: "setThreadName", workspaceId, threadId, name: newName });
      void Promise.resolve(
        setThreadNameService(workspaceId, threadId, newName),
      ).catch((error) => {
        onDebug?.({
          id: `${Date.now()}-client-thread-rename-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/name/set error",
          payload: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [customNamesRef, dispatch, onDebug],
  );

  const onSubagentThreadDetected = useCallback(
    (workspaceId: string, threadId: string) => {
      if (!workspaceId || !threadId) {
        return;
      }
      subagentThreadByWorkspaceThreadRef.current[
        buildWorkspaceThreadKey(workspaceId, threadId)
      ] = true;
    },
    [],
  );

  const isSubagentThread = useCallback(
    (workspaceId: string, threadId: string) =>
      Boolean(
        subagentThreadByWorkspaceThreadRef.current[
          buildWorkspaceThreadKey(workspaceId, threadId)
        ],
      ),
    [],
  );

  const { applyCollabThreadLinks, applyCollabThreadLinksFromThread, updateThreadParent } =
    useThreadLinking({
      dispatch,
      threadParentById: state.threadParentById,
      onSubagentThreadDetected,
    });

  const handleWorkspaceConnected = useCallback(
    (workspaceId: string) => {
      onWorkspaceConnected(workspaceId);
      void refreshAccountRateLimits(workspaceId);
      void refreshAccountInfo(workspaceId);
    },
    [onWorkspaceConnected, refreshAccountRateLimits, refreshAccountInfo],
  );

  const handleAccountUpdated = useCallback(
    (workspaceId: string) => {
      void refreshAccountRateLimits(workspaceId);
      void refreshAccountInfo(workspaceId);
    },
    [refreshAccountRateLimits, refreshAccountInfo],
  );

  const isThreadHidden = useCallback(
    (workspaceId: string, threadId: string) =>
      Boolean(state.hiddenThreadIdsByWorkspace[workspaceId]?.[threadId]),
    [state.hiddenThreadIdsByWorkspace],
  );

  const getActiveTurnId = useCallback(
    (threadId: string) => activeTurnIdByThreadRef.current[threadId] ?? null,
    [],
  );

  const registerDetachedReviewChild = useCallback(
    (workspaceId: string, parentId: string, childId: string) => {
      if (!workspaceId || !parentId || !childId || parentId === childId) {
        return;
      }
      detachedReviewParentByChildRef.current[childId] = parentId;
      const existingWorkspaceLinks =
        detachedReviewLinksByWorkspaceRef.current[workspaceId] ?? {};
      if (existingWorkspaceLinks[childId] !== parentId) {
        const nextLinksByWorkspace = {
          ...detachedReviewLinksByWorkspaceRef.current,
          [workspaceId]: {
            ...existingWorkspaceLinks,
            [childId]: parentId,
          },
        };
        detachedReviewLinksByWorkspaceRef.current = nextLinksByWorkspace;
        saveDetachedReviewLinks(nextLinksByWorkspace);
      }

      const timestamp = Date.now();
      recordThreadActivity(workspaceId, parentId, timestamp);
      dispatch({
        type: "setThreadTimestamp",
        workspaceId,
        threadId: parentId,
        timestamp,
      });

      const noticeKey = `${parentId}->${childId}`;
      if (!detachedReviewStartedNoticeRef.current.has(noticeKey)) {
        detachedReviewStartedNoticeRef.current.add(noticeKey);
        dispatch({
          type: "addAssistantMessage",
          threadId: parentId,
          text: `Detached review started. [Open review thread](/thread/${childId})`,
        });
      }

      if (parentId !== activeThreadId) {
        dispatch({ type: "markUnread", threadId: parentId, hasUnread: true });
      }
      safeMessageActivity();
    },
    [activeThreadId, dispatch, recordThreadActivity, safeMessageActivity],
  );

  useEffect(() => {
    const linksByWorkspace = detachedReviewLinksByWorkspaceRef.current;
    Object.entries(state.threadsByWorkspace).forEach(([workspaceId, threads]) => {
      const workspaceLinks = linksByWorkspace[workspaceId];
      if (!workspaceLinks) {
        return;
      }
      const threadIds = new Set(threads.map((thread) => thread.id));
      Object.entries(workspaceLinks).forEach(([childId, parentId]) => {
        if (!childId || !parentId || childId === parentId) {
          return;
        }
        if (!threadIds.has(childId) || !threadIds.has(parentId)) {
          return;
        }
        if (state.threadParentById[childId]) {
          return;
        }
        updateThreadParent(parentId, [childId]);
      });
    });
  }, [state.threadParentById, state.threadsByWorkspace, updateThreadParent]);

  const handleReviewExited = useCallback(
    (workspaceId: string, threadId: string) => {
      const parentId = detachedReviewParentByChildRef.current[threadId];
      if (!parentId) {
        return;
      }
      delete detachedReviewParentByChildRef.current[threadId];

      const timestamp = Date.now();
      recordThreadActivity(workspaceId, parentId, timestamp);
      dispatch({
        type: "setThreadTimestamp",
        workspaceId,
        threadId: parentId,
        timestamp,
      });
      const noticeKey = `${parentId}->${threadId}`;
      const alreadyNotified = detachedReviewCompletedNoticeRef.current.has(noticeKey);
      if (!alreadyNotified) {
        detachedReviewCompletedNoticeRef.current.add(noticeKey);
        dispatch({
          type: "addAssistantMessage",
          threadId: parentId,
          text: `Detached review completed. [Open review thread](/thread/${threadId})`,
        });
      }
      if (parentId !== activeThreadId) {
        dispatch({ type: "markUnread", threadId: parentId, hasUnread: true });
      }
      safeMessageActivity();
    },
    [
      activeThreadId,
      dispatch,
      recordThreadActivity,
      safeMessageActivity,
    ],
  );

  const { onUserMessageCreated } = useThreadTitleAutogeneration({
    enabled: threadTitleAutogenerationEnabled,
    itemsByThreadRef,
    threadsByWorkspaceRef,
    getCustomName,
    renameThread,
    onDebug,
  });

  const threadHandlers = useThreadEventHandlers({
    activeThreadId,
    dispatch,
    planByThreadRef,
    getCustomName,
    isThreadHidden,
    markProcessing,
    markReviewing,
    setActiveTurnId,
    getActiveTurnId,
    safeMessageActivity,
    recordThreadActivity,
    onUserMessageCreated,
    pushThreadErrorMessage,
    onDebug,
    onWorkspaceConnected: handleWorkspaceConnected,
    applyCollabThreadLinks,
    onReviewExited: handleReviewExited,
    approvalAllowlistRef,
    pendingInterruptsRef,
  });

  const handleAccountLoginCompleted = useCallback(
    (workspaceId: string) => {
      handleAccountUpdated(workspaceId);
    },
    [handleAccountUpdated],
  );

  const handleThreadStarted = useCallback(
    (workspaceId: string, thread: Record<string, unknown>) => {
      threadHandlers.onThreadStarted(workspaceId, thread);
      const threadId = String(thread.id ?? "").trim();
      if (!threadId) {
        return;
      }
      const sourceParentId = getParentThreadIdFromSource(thread.source);
      if (!sourceParentId) {
        return;
      }
      updateThreadParent(sourceParentId, [threadId]);
      onSubagentThreadDetected(workspaceId, threadId);
    },
    [onSubagentThreadDetected, threadHandlers, updateThreadParent],
  );

  const handleThreadArchived = useCallback(
    (workspaceId: string, threadId: string) => {
      if (!workspaceId || !threadId) {
        return;
      }
      threadHandlers.onThreadArchived?.(workspaceId, threadId);
      unpinThread(workspaceId, threadId);

      const skipKey = buildWorkspaceThreadKey(workspaceId, threadId);
      const skipAt = cascadeArchiveSkipRef.current[skipKey] ?? null;
      if (skipAt !== null) {
        delete cascadeArchiveSkipRef.current[skipKey];
        if (
          skipAt > 0 &&
          Date.now() - skipAt >= 0 &&
          Date.now() - skipAt < CASCADE_ARCHIVE_SKIP_TTL_MS
        ) {
          return;
        }
      }

      const descendants = getSubagentDescendantThreadIds({
        rootThreadId: threadId,
        threadParentById: threadParentByIdRef.current,
        isSubagentThread: (candidateId) =>
          isSubagentThread(workspaceId, candidateId),
      });
      if (descendants.length === 0) {
        return;
      }

      onDebug?.({
        id: `${Date.now()}-client-thread-archive-cascade`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/archive cascade",
        payload: { workspaceId, rootThreadId: threadId, descendantCount: descendants.length },
      });

      const now = Date.now();
      Object.entries(cascadeArchiveSkipRef.current).forEach(([key, timestamp]) => {
        if (now - timestamp >= CASCADE_ARCHIVE_SKIP_TTL_MS) {
          delete cascadeArchiveSkipRef.current[key];
        }
      });

      void (async () => {
        for (const descendantId of descendants) {
          const descendantKey = buildWorkspaceThreadKey(workspaceId, descendantId);
          cascadeArchiveSkipRef.current[descendantKey] = Date.now();
          try {
            await archiveThreadService(workspaceId, descendantId);
          } catch (error) {
            delete cascadeArchiveSkipRef.current[descendantKey];
            onDebug?.({
              id: `${Date.now()}-client-thread-archive-cascade-error`,
              timestamp: Date.now(),
              source: "error",
              label: "thread/archive cascade error",
              payload: {
                workspaceId,
                rootThreadId: threadId,
                threadId: descendantId,
                error: error instanceof Error ? error.message : String(error),
              },
            });
          }
        }
      })();
    },
    [isSubagentThread, onDebug, threadHandlers, unpinThread],
  );

  const handleThreadUnarchived = useCallback(
    (workspaceId: string, threadId: string) => {
      threadHandlers.onThreadUnarchived?.(workspaceId, threadId);
    },
    [threadHandlers],
  );

  const handlers = useMemo(
    () => ({
      ...threadHandlers,
      onThreadStarted: handleThreadStarted,
      onThreadArchived: handleThreadArchived,
      onThreadUnarchived: handleThreadUnarchived,
      onAccountUpdated: handleAccountUpdated,
      onAccountLoginCompleted: handleAccountLoginCompleted,
    }),
    [
      threadHandlers,
      handleThreadStarted,
      handleThreadArchived,
      handleThreadUnarchived,
      handleAccountUpdated,
      handleAccountLoginCompleted,
    ],
  );

  useAppServerEvents(handlers);

  const {
    startThreadForWorkspace: startThreadForWorkspaceInternal,
    forkThreadForWorkspace,
    resumeThreadForWorkspace,
    refreshThread,
    resetWorkspaceThreads,
    listThreadsForWorkspace,
    loadOlderThreadsForWorkspace,
    archiveThread,
  } = useThreadActions({
    dispatch,
    itemsByThread: state.itemsByThread,
    threadsByWorkspace: state.threadsByWorkspace,
    activeThreadIdByWorkspace: state.activeThreadIdByWorkspace,
    activeTurnIdByThread: state.activeTurnIdByThread,
    threadListCursorByWorkspace: state.threadListCursorByWorkspace,
    threadStatusById: state.threadStatusById,
    threadSortKey,
    onDebug,
    getCustomName,
    threadActivityRef,
    loadedThreadsRef,
    replaceOnResumeRef,
    applyCollabThreadLinksFromThread,
    updateThreadParent,
    onSubagentThreadDetected,
  });

  const ensureWorkspaceRuntimeCodexArgsBestEffort = useCallback(
    async (workspaceId: string, threadId: string | null, phase: string) => {
      if (!ensureWorkspaceRuntimeCodexArgs) {
        return;
      }
      try {
        await ensureWorkspaceRuntimeCodexArgs(workspaceId, threadId);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        onDebug?.({
          id: `${Date.now()}-client-thread-runtime-codex-args-sync-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/runtime-codex-args sync error",
          payload: `${phase}: ${detail}`,
        });
      }
    },
    [ensureWorkspaceRuntimeCodexArgs, onDebug],
  );

  const getWorkspaceThreadIds = useCallback(
    (workspaceId: string, includeThreadId?: string) => {
      const visibleThreadIds = (state.threadsByWorkspace[workspaceId] ?? [])
        .map((thread) => String(thread.id ?? "").trim())
        .filter((threadId) => threadId.length > 0);
      const hiddenThreadIds = Object.keys(
        state.hiddenThreadIdsByWorkspace[workspaceId] ?? {},
      );
      const activeThreadIdForWorkspace =
        state.activeThreadIdByWorkspace[workspaceId] ?? null;
      const threadIds = new Set([...visibleThreadIds, ...hiddenThreadIds]);
      if (activeThreadIdForWorkspace) {
        threadIds.add(activeThreadIdForWorkspace);
      }
      if (includeThreadId) {
        threadIds.add(includeThreadId);
      }
      return Array.from(threadIds);
    },
    [
      state.activeThreadIdByWorkspace,
      state.hiddenThreadIdsByWorkspace,
      state.threadsByWorkspace,
    ],
  );

  const hasProcessingThreadInWorkspace = useCallback(
    (workspaceId: string, excludedThreadId?: string) =>
      getWorkspaceThreadIds(workspaceId, excludedThreadId).some(
        (candidateThreadId) =>
          candidateThreadId !== excludedThreadId &&
          Boolean(state.threadStatusById[candidateThreadId]?.isProcessing),
      ),
    [getWorkspaceThreadIds, state.threadStatusById],
  );

  const shouldPreflightRuntimeCodexArgsForSend = useCallback(
    (workspaceId: string, threadId: string) =>
      !hasProcessingThreadInWorkspace(workspaceId, threadId),
    [hasProcessingThreadInWorkspace],
  );

  const startThreadForWorkspace = useCallback(
    async (workspaceId: string, options?: { activate?: boolean }) => {
      await ensureWorkspaceRuntimeCodexArgsBestEffort(workspaceId, null, "start");
      return startThreadForWorkspaceInternal(workspaceId, options);
    },
    [ensureWorkspaceRuntimeCodexArgsBestEffort, startThreadForWorkspaceInternal],
  );

  const startThread = useCallback(async () => {
    if (!activeWorkspaceId) {
      return null;
    }
    return startThreadForWorkspace(activeWorkspaceId);
  }, [activeWorkspaceId, startThreadForWorkspace]);

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
    } else if (!loadedThreadsRef.current[threadId]) {
      await ensureWorkspaceRuntimeCodexArgsBestEffort(
        activeWorkspace.id,
        threadId,
        "resume",
      );
      await resumeThreadForWorkspace(activeWorkspace.id, threadId);
    }
    return threadId;
  }, [
    activeWorkspace,
    activeThreadId,
    ensureWorkspaceRuntimeCodexArgsBestEffort,
    resumeThreadForWorkspace,
    startThreadForWorkspace,
  ]);

  const ensureThreadForWorkspace = useCallback(
    async (workspaceId: string) => {
      const currentActiveThreadId = state.activeThreadIdByWorkspace[workspaceId] ?? null;
      const shouldActivate = workspaceId === activeWorkspaceId;
      let threadId = currentActiveThreadId;
      if (!threadId) {
        threadId = await startThreadForWorkspace(workspaceId, {
          activate: shouldActivate,
        });
        if (!threadId) {
          return null;
        }
      } else if (!loadedThreadsRef.current[threadId]) {
        await ensureWorkspaceRuntimeCodexArgsBestEffort(workspaceId, threadId, "resume");
        await resumeThreadForWorkspace(workspaceId, threadId);
      }
      if (shouldActivate && currentActiveThreadId !== threadId) {
        dispatch({ type: "setActiveThreadId", workspaceId, threadId });
      }
      return threadId;
    },
    [
      activeWorkspaceId,
      dispatch,
      ensureWorkspaceRuntimeCodexArgsBestEffort,
      loadedThreadsRef,
      resumeThreadForWorkspace,
      startThreadForWorkspace,
      state.activeThreadIdByWorkspace,
    ],
  );

  const {
    interruptTurn,
    sendUserMessage,
    sendUserMessageToThread,
    startFork,
    startReview,
    startResume,
    startCompact,
    startApps,
    startMcp,
    startStatus,
    reviewPrompt,
    openReviewPrompt,
    closeReviewPrompt,
    showPresetStep,
    choosePreset,
    highlightedPresetIndex,
    setHighlightedPresetIndex,
    highlightedBranchIndex,
    setHighlightedBranchIndex,
    highlightedCommitIndex,
    setHighlightedCommitIndex,
    handleReviewPromptKeyDown,
    confirmBranch,
    selectBranch,
    selectBranchAtIndex,
    selectCommit,
    selectCommitAtIndex,
    confirmCommit,
    updateCustomInstructions,
    confirmCustom,
  } = useThreadMessaging({
    activeWorkspace,
    activeThreadId,
    accessMode,
    model,
    effort,
    collaborationMode,
    reviewDeliveryMode,
    steerEnabled,
    customPrompts,
    ensureWorkspaceRuntimeCodexArgs,
    shouldPreflightRuntimeCodexArgsForSend,
    threadStatusById: state.threadStatusById,
    activeTurnIdByThread: state.activeTurnIdByThread,
    rateLimitsByWorkspace: state.rateLimitsByWorkspace,
    pendingInterruptsRef,
    dispatch,
    getCustomName,
    markProcessing,
    markReviewing,
    setActiveTurnId,
    recordThreadActivity,
    safeMessageActivity,
    onDebug,
    pushThreadErrorMessage,
    ensureThreadForActiveWorkspace,
    ensureThreadForWorkspace,
    refreshThread,
    forkThreadForWorkspace,
    updateThreadParent,
    registerDetachedReviewChild,
  });

  const setActiveThreadId = useCallback(
    (threadId: string | null, workspaceId?: string) => {
      const targetId = workspaceId ?? activeWorkspaceId;
      if (!targetId) {
        return;
      }
      const currentThreadId = state.activeThreadIdByWorkspace[targetId] ?? null;
      dispatch({ type: "setActiveThreadId", workspaceId: targetId, threadId });
      if (threadId && currentThreadId !== threadId) {
        Sentry.metrics.count("thread_switched", 1, {
          attributes: {
            workspace_id: targetId,
            thread_id: threadId,
            reason: "select",
          },
        });
      }
      if (threadId) {
        void (async () => {
          const hasActiveTurnInWorkspace = hasProcessingThreadInWorkspace(targetId);
          if (!hasActiveTurnInWorkspace) {
            await ensureWorkspaceRuntimeCodexArgsBestEffort(targetId, threadId, "resume");
          }
          await resumeThreadForWorkspace(targetId, threadId);
        })();
      }
    },
    [
      activeWorkspaceId,
      ensureWorkspaceRuntimeCodexArgsBestEffort,
      hasProcessingThreadInWorkspace,
      resumeThreadForWorkspace,
      state.activeThreadIdByWorkspace,
    ],
  );

  const removeThread = useCallback(
    (workspaceId: string, threadId: string) => {
      unpinThread(workspaceId, threadId);
      dispatch({ type: "removeThread", workspaceId, threadId });
      void archiveThread(workspaceId, threadId);
    },
    [archiveThread, unpinThread],
  );

  return {
    activeThreadId,
    setActiveThreadId,
    activeItems,
    approvals: state.approvals,
    userInputRequests: state.userInputRequests,
    threadsByWorkspace: state.threadsByWorkspace,
    threadParentById: state.threadParentById,
    isSubagentThread,
    threadStatusById: state.threadStatusById,
    threadResumeLoadingById: state.threadResumeLoadingById,
    threadListLoadingByWorkspace: state.threadListLoadingByWorkspace,
    threadListPagingByWorkspace: state.threadListPagingByWorkspace,
    threadListCursorByWorkspace: state.threadListCursorByWorkspace,
    activeTurnIdByThread: state.activeTurnIdByThread,
    turnDiffByThread: state.turnDiffByThread,
    tokenUsageByThread: state.tokenUsageByThread,
    rateLimitsByWorkspace: state.rateLimitsByWorkspace,
    accountByWorkspace: state.accountByWorkspace,
    planByThread: state.planByThread,
    lastAgentMessageByThread: state.lastAgentMessageByThread,
    pinnedThreadsVersion,
    refreshAccountRateLimits,
    refreshAccountInfo,
    interruptTurn,
    removeThread,
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    renameThread,
    startThread,
    startThreadForWorkspace,
    forkThreadForWorkspace,
    listThreadsForWorkspace,
    refreshThread,
    resetWorkspaceThreads,
    loadOlderThreadsForWorkspace,
    sendUserMessage,
    sendUserMessageToThread,
    startFork,
    startReview,
    startResume,
    startCompact,
    startApps,
    startMcp,
    startStatus,
    reviewPrompt,
    openReviewPrompt,
    closeReviewPrompt,
    showPresetStep,
    choosePreset,
    highlightedPresetIndex,
    setHighlightedPresetIndex,
    highlightedBranchIndex,
    setHighlightedBranchIndex,
    highlightedCommitIndex,
    setHighlightedCommitIndex,
    handleReviewPromptKeyDown,
    confirmBranch,
    selectBranch,
    selectBranchAtIndex,
    selectCommit,
    selectCommitAtIndex,
    confirmCommit,
    updateCustomInstructions,
    confirmCustom,
    handleApprovalDecision,
    handleApprovalRemember,
    handleUserInputSubmit,
  };
}
