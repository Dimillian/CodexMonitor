import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import * as Sentry from "@sentry/react";
import type {
  CustomPromptOption,
  DebugEntry,
  ThreadListSortKey,
  WorkspaceInfo,
} from "../../../types";
import { useAppServerEvents } from "../../app/hooks/useAppServerEvents";
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
<<<<<<< HEAD
import { useThreadStaleGuard } from "./useThreadStaleGuard";
import { setThreadName as setThreadNameService } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import { makeCustomNameKey, saveCustomName, saveCustomNames } from "../utils/threadStorage";

const SUB_AGENT_AUTO_ARCHIVE_DEFAULT_MAX_AGE_MINUTES = 30;
const SUB_AGENT_AUTO_ARCHIVE_MIN_AGE_MINUTES = 5;
const SUB_AGENT_AUTO_ARCHIVE_MAX_AGE_MINUTES = 240;
const SUB_AGENT_AUTO_ARCHIVE_CHECK_INTERVAL_MS = 60 * 1000;

function clampSubAgentAutoArchiveMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return SUB_AGENT_AUTO_ARCHIVE_DEFAULT_MAX_AGE_MINUTES;
  }
  return Math.min(
    SUB_AGENT_AUTO_ARCHIVE_MAX_AGE_MINUTES,
    Math.max(SUB_AGENT_AUTO_ARCHIVE_MIN_AGE_MINUTES, Math.round(value)),
  );
}
=======
import { setThreadName as setThreadNameService } from "@services/tauri";
import {
  loadDetachedReviewLinks,
  makeCustomNameKey,
  saveCustomName,
  saveDetachedReviewLinks,
} from "@threads/utils/threadStorage";
import { getParentThreadIdFromSource } from "@threads/utils/threadRpc";
>>>>>>> origin/main

type UseThreadsOptions = {
  workspaces?: WorkspaceInfo[];
  activeWorkspace: WorkspaceInfo | null;
  onWorkspaceConnected: (id: string) => void;
  onDebug?: (entry: DebugEntry) => void;
  model?: string | null;
  effort?: string | null;
  collaborationMode?: Record<string, unknown> | null;
  reviewDeliveryMode?: "inline" | "detached";
  steerEnabled?: boolean;
  autoArchiveSubAgentThreadsEnabled?: boolean;
  autoArchiveSubAgentThreadsMaxAgeMinutes?: number;
  threadTitleAutogenerationEnabled?: boolean;
  customPrompts?: CustomPromptOption[];
  onMessageActivity?: () => void;
  threadSortKey?: ThreadListSortKey;
  persistThreadDisplayName?: (
    workspaceId: string,
    threadId: string,
    displayName: string | null,
  ) => void | Promise<void>;
};

export function useThreads({
  workspaces = [],
  activeWorkspace,
  onWorkspaceConnected,
  onDebug,
  model,
  effort,
  collaborationMode,
  reviewDeliveryMode = "inline",
  steerEnabled = false,
  autoArchiveSubAgentThreadsEnabled = true,
  autoArchiveSubAgentThreadsMaxAgeMinutes =
    SUB_AGENT_AUTO_ARCHIVE_DEFAULT_MAX_AGE_MINUTES,
  threadTitleAutogenerationEnabled = false,
  customPrompts = [],
  onMessageActivity,
  threadSortKey = "updated_at",
  persistThreadDisplayName,
}: UseThreadsOptions) {
  const [state, dispatch] = useReducer(threadReducer, initialState);
  const loadedThreadsRef = useRef<Record<string, boolean>>({});
  const replaceOnResumeRef = useRef<Record<string, boolean>>({});
  const pendingInterruptsRef = useRef<Set<string>>(new Set());
  const planByThreadRef = useRef(state.planByThread);
  const itemsByThreadRef = useRef(state.itemsByThread);
  const threadsByWorkspaceRef = useRef(state.threadsByWorkspace);
<<<<<<< HEAD
  const detachedReviewNoticeRef = useRef<Set<string>>(new Set());
  const subAgentThreadIdsRef = useRef<Record<string, true>>({});
  const threadCreatedAtByIdRef = useRef<Record<string, number>>({});
  const autoArchiveInFlightRef = useRef<Set<string>>(new Set());
=======
  const activeTurnIdByThreadRef = useRef(state.activeTurnIdByThread);
  const detachedReviewStartedNoticeRef = useRef<Set<string>>(new Set());
  const detachedReviewCompletedNoticeRef = useRef<Set<string>>(new Set());
  const detachedReviewParentByChildRef = useRef<Record<string, string>>({});
  const subagentThreadByWorkspaceThreadRef = useRef<Record<string, true>>({});
  const detachedReviewLinksByWorkspaceRef = useRef(loadDetachedReviewLinks());
>>>>>>> origin/main
  planByThreadRef.current = state.planByThread;
  itemsByThreadRef.current = state.itemsByThread;
  threadsByWorkspaceRef.current = state.threadsByWorkspace;
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
  void pinnedThreadsVersion;

  useEffect(() => {
    if (!workspaces.length) {
      return;
    }
    const nextCustomNames = { ...customNamesRef.current };
    let didChange = false;
    workspaces.forEach((workspace) => {
      const names = workspace.settings.threadDisplayNames ?? {};
      Object.entries(names).forEach(([threadId, rawName]) => {
        if (typeof rawName !== "string") {
          return;
        }
        const normalized = rawName.trim();
        if (!normalized) {
          return;
        }
        const key = makeCustomNameKey(workspace.id, threadId);
        if (nextCustomNames[key] === normalized) {
          return;
        }
        nextCustomNames[key] = normalized;
        didChange = true;
      });
    });
    if (!didChange) {
      return;
    }
    customNamesRef.current = nextCustomNames;
    saveCustomNames(nextCustomNames);
  }, [customNamesRef, workspaces]);

  const persistedThreadDisplayNamesByWorkspace = useMemo(() => {
    const next: Record<string, Record<string, string>> = {};
    workspaces.forEach((workspace) => {
      const names = workspace.settings.threadDisplayNames;
      if (!names || typeof names !== "object") {
        return;
      }
      const normalizedNames: Record<string, string> = {};
      Object.entries(names).forEach(([threadId, rawName]) => {
        if (typeof rawName !== "string") {
          return;
        }
        const normalized = rawName.trim();
        if (!normalized) {
          return;
        }
        normalizedNames[threadId] = normalized;
      });
      if (Object.keys(normalizedNames).length > 0) {
        next[workspace.id] = normalizedNames;
      }
    });
    return next;
  }, [workspaces]);

  const getPersistedThreadDisplayName = useCallback(
    (workspaceId: string, threadId: string) =>
      persistedThreadDisplayNamesByWorkspace[workspaceId]?.[threadId],
    [persistedThreadDisplayNamesByWorkspace],
  );

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

  const {
    markProcessing,
    markReviewing,
    markThreadError,
    setActiveTurnId,
    resetThreadRuntimeState,
  } = useThreadStatus({
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

  const { recordAlive, handleDisconnected } = useThreadStaleGuard({
    activeWorkspaceId,
    activeThreadId,
    threadStatusById: state.threadStatusById,
    markProcessing,
    markReviewing,
    setActiveTurnId,
    pushThreadErrorMessage,
  });

  const safeMessageActivity = useCallback(() => {
    try {
      void onMessageActivity?.();
    } catch {
      // Ignore refresh errors to avoid breaking the UI.
    }
  }, [onMessageActivity]);

  const renameThread = useCallback(
    (workspaceId: string, threadId: string, newName: string) => {
      const normalizedName = newName.trim();
      if (!normalizedName) {
        return;
      }
      saveCustomName(workspaceId, threadId, normalizedName);
      const key = makeCustomNameKey(workspaceId, threadId);
      customNamesRef.current[key] = normalizedName;
      dispatch({ type: "setThreadName", workspaceId, threadId, name: normalizedName });
      void Promise.resolve(
        persistThreadDisplayName?.(workspaceId, threadId, normalizedName),
      ).catch((error) => {
        onDebug?.({
          id: `${Date.now()}-client-thread-display-name-persist-error`,
          timestamp: Date.now(),
          source: "error",
          label: "workspace/settings threadDisplayNames error",
          payload: error instanceof Error ? error.message : String(error),
        });
      });
      void Promise.resolve(
        setThreadNameService(workspaceId, threadId, normalizedName),
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
    [customNamesRef, dispatch, onDebug, persistThreadDisplayName],
  );

  const { applyCollabThreadLinks, applyCollabThreadLinksFromThread, updateThreadParent } =
    useThreadLinking({
      dispatch,
      threadParentById: state.threadParentById,
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

  const handleReviewExited = useCallback(
    (workspaceId: string, threadId: string) => {
      const parentId = state.threadParentById[threadId];
      if (!parentId || parentId === threadId) {
        return;
      }
      const parentStatus = state.threadStatusById[parentId];
      if (!parentStatus?.isReviewing) {
        return;
      }

      markReviewing(parentId, false);
      markProcessing(parentId, false);
      setActiveTurnId(parentId, null);

      const timestamp = Date.now();
      recordThreadActivity(workspaceId, parentId, timestamp);
      dispatch({
        type: "setThreadTimestamp",
        workspaceId,
        threadId: parentId,
        timestamp,
      });
      const noticeKey = `${parentId}->${threadId}`;
      const alreadyNotified = detachedReviewNoticeRef.current.has(noticeKey);
      if (!alreadyNotified) {
        detachedReviewNoticeRef.current.add(noticeKey);
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
      markProcessing,
      markReviewing,
      recordThreadActivity,
      safeMessageActivity,
      setActiveTurnId,
      state.threadParentById,
      state.threadStatusById,
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

  const resolveCurrentModel = useCallback(() => {
    if (typeof model !== "string") {
      return null;
    }
    const trimmed = model.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [model]);

  const threadHandlers = useThreadEventHandlers({
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
    onWorkspaceConnected: handleWorkspaceConnected,
    applyCollabThreadLinks,
    onReviewExited: handleReviewExited,
    approvalAllowlistRef,
    pendingInterruptsRef,
    resolveCurrentModel,
  });

  const handleAccountLoginCompleted = useCallback(
    (workspaceId: string) => {
      handleAccountUpdated(workspaceId);
    },
    [handleAccountUpdated],
  );

  const handlers = useMemo(
    () => ({
      ...threadHandlers,
      onAccountUpdated: handleAccountUpdated,
      onAccountLoginCompleted: handleAccountLoginCompleted,
      onWorkspaceDisconnected: handleDisconnected,
      onIsAlive: recordAlive,
    }),
<<<<<<< HEAD
    [threadHandlers, handleAccountUpdated, handleAccountLoginCompleted, handleDisconnected, recordAlive],
=======
    [
      threadHandlers,
      handleThreadStarted,
      handleAccountUpdated,
      handleAccountLoginCompleted,
    ],
>>>>>>> origin/main
  );

  useAppServerEvents(handlers);

  const markSubAgentThread = useCallback((threadId: string) => {
    if (!threadId) {
      return;
    }
    subAgentThreadIdsRef.current[threadId] = true;
  }, []);

  const recordThreadCreatedAt = useCallback((threadId: string, createdAt: number) => {
    if (!threadId || !Number.isFinite(createdAt) || createdAt <= 0) {
      return;
    }
    const current = threadCreatedAtByIdRef.current[threadId];
    if (typeof current === "number" && current > 0 && current <= createdAt) {
      return;
    }
    threadCreatedAtByIdRef.current[threadId] = createdAt;
  }, []);

  const {
    startThreadForWorkspace,
    forkThreadForWorkspace,
    resumeThreadForWorkspace,
    refreshThread,
    loadOlderMessagesForThread,
    resetWorkspaceThreads,
    listThreadsForWorkspace,
    loadOlderThreadsForWorkspace,
    archiveThreads,
  } = useThreadActions({
    dispatch,
    itemsByThread: state.itemsByThread,
    threadsByWorkspace: state.threadsByWorkspace,
    activeThreadIdByWorkspace: state.activeThreadIdByWorkspace,
    threadListCursorByWorkspace: state.threadListCursorByWorkspace,
    threadStatusById: state.threadStatusById,
    threadSortKey,
    onDebug,
    getCustomName,
    getPersistedThreadDisplayName,
    threadActivityRef,
    loadedThreadsRef,
    replaceOnResumeRef,
    applyCollabThreadLinksFromThread,
    updateThreadParent,
<<<<<<< HEAD
    markSubAgentThread,
    recordThreadCreatedAt,
=======
    onSubagentThreadDetected,
>>>>>>> origin/main
  });

  const cleanupThreadRefs = useCallback((threadId: string) => {
    delete loadedThreadsRef.current[threadId];
    delete replaceOnResumeRef.current[threadId];
    delete subAgentThreadIdsRef.current[threadId];
    delete threadCreatedAtByIdRef.current[threadId];
    pendingInterruptsRef.current.delete(threadId);
    detachedReviewNoticeRef.current.delete(threadId);
  }, []);

  const removeThreads = useCallback(
    async (workspaceId: string, threadIds: string[]) => {
      const normalizedThreadIds = Array.from(
        new Set(
          threadIds
            .map((threadId) => threadId.trim())
            .filter((threadId) => threadId.length > 0),
        ),
      );
      if (!workspaceId || normalizedThreadIds.length === 0) {
        return {
          allSucceeded: true,
          okIds: [],
          failed: [],
          total: 0,
        };
      }

      const result = await archiveThreads(workspaceId, normalizedThreadIds);
      result.okIds.forEach((threadId) => {
        unpinThread(workspaceId, threadId);
        cleanupThreadRefs(threadId);
        dispatch({ type: "removeThread", workspaceId, threadId });
      });
      onDebug?.({
        id: `${Date.now()}-client-thread-remove-batch`,
        timestamp: Date.now(),
        source: result.allSucceeded ? "client" : "error",
        label: "thread/remove batch",
        payload: {
          workspaceId,
          allSucceeded: result.allSucceeded,
          total: result.total,
          okIds: result.okIds,
          failed: result.failed,
        },
      });
      if (result.failed.length > 0) {
        const failureSummary = result.failed
          .slice(0, 3)
          .map(({ threadId, error }) => `${threadId}: ${error}`)
          .join("\n");
        pushErrorToast({
          title: `归档部分失败（成功 ${result.okIds.length}/${result.total}）`,
          message:
            result.failed.length > 3
              ? `${failureSummary}\n… 另有 ${result.failed.length - 3} 条失败`
              : failureSummary,
        });
      }
      return result;
    },
    [archiveThreads, cleanupThreadRefs, dispatch, onDebug, unpinThread],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    if (!autoArchiveSubAgentThreadsEnabled) {
      return undefined;
    }
    const autoArchiveMaxAgeMs =
      clampSubAgentAutoArchiveMinutes(autoArchiveSubAgentThreadsMaxAgeMinutes)
      * 60
      * 1000;
    const scanAndArchive = () => {
      const now = Date.now();
      const candidates: Array<{ workspaceId: string; threadId: string; ageMs: number }> = [];
      Object.entries(state.threadsByWorkspace).forEach(([workspaceId, threads]) => {
        const activeThreadForWorkspace =
          state.activeThreadIdByWorkspace[workspaceId] ?? null;
        threads.forEach((thread) => {
          const threadId = thread.id;
          if (!threadId || !subAgentThreadIdsRef.current[threadId]) {
            return;
          }
          const createdAt = threadCreatedAtByIdRef.current[threadId];
          if (!createdAt || now - createdAt < autoArchiveMaxAgeMs) {
            return;
          }
          const status = state.threadStatusById[threadId];
          if (status?.isProcessing || status?.isReviewing || status?.hasUnread) {
            return;
          }
          if (activeThreadForWorkspace === threadId) {
            return;
          }
          if (isThreadPinned(workspaceId, threadId)) {
            return;
          }
          candidates.push({ workspaceId, threadId, ageMs: now - createdAt });
        });
      });

      candidates.forEach(({ workspaceId, threadId, ageMs }) => {
        const requestKey = `${workspaceId}:${threadId}`;
        if (autoArchiveInFlightRef.current.has(requestKey)) {
          return;
        }
        autoArchiveInFlightRef.current.add(requestKey);
        onDebug?.({
          id: `${Date.now()}-client-thread-auto-archive`,
          timestamp: Date.now(),
          source: "client",
          label: "thread/auto-archive",
          payload: { workspaceId, threadId, ageMs },
        });
        void removeThreads(workspaceId, [threadId])
          .finally(() => {
            autoArchiveInFlightRef.current.delete(requestKey);
          });
      });
    };

    scanAndArchive();
    const timer = window.setInterval(
      scanAndArchive,
      SUB_AGENT_AUTO_ARCHIVE_CHECK_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [
    removeThreads,
    autoArchiveSubAgentThreadsEnabled,
    autoArchiveSubAgentThreadsMaxAgeMinutes,
    isThreadPinned,
    onDebug,
    state.activeThreadIdByWorkspace,
    state.threadStatusById,
    state.threadsByWorkspace,
  ]);

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
      const resumed = await resumeThreadForWorkspace(activeWorkspace.id, threadId);
      if (!resumed) {
        // Thread no longer exists on the server — start a fresh one so the user
        // is not stuck on a stale threadId that will keep returning "not found".
        threadId = await startThreadForWorkspace(activeWorkspace.id);
        if (!threadId) {
          return null;
        }
      }
    }
    return threadId;
  }, [activeWorkspace, activeThreadId, resumeThreadForWorkspace, startThreadForWorkspace]);

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
        const resumed = await resumeThreadForWorkspace(workspaceId, threadId);
        if (!resumed) {
          threadId = await startThreadForWorkspace(workspaceId, {
            activate: shouldActivate,
          });
          if (!threadId) {
            return null;
          }
        }
      }
      if (shouldActivate && currentActiveThreadId !== threadId) {
        dispatch({ type: "setActiveThreadId", workspaceId, threadId });
      }
      return threadId;
    },
    [
      activeWorkspaceId,
      dispatch,
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
    model,
    effort,
    collaborationMode,
    reviewDeliveryMode,
    steerEnabled,
    customPrompts,
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
        void resumeThreadForWorkspace(targetId, threadId);
      }
    },
    [activeWorkspaceId, resumeThreadForWorkspace, state.activeThreadIdByWorkspace],
  );

  const removeThread = useCallback(
    (workspaceId: string, threadId: string) =>
      removeThreads(workspaceId, [threadId]),
    [removeThreads],
  );

  const isSubAgentThread = useCallback(
    (_workspaceId: string, threadId: string) =>
      Boolean(subAgentThreadIdsRef.current[threadId]),
    [],
  );

  return {
    activeThreadId,
    setActiveThreadId,
    activeItems,
    approvals: state.approvals,
    userInputRequests: state.userInputRequests,
    threadsByWorkspace: state.threadsByWorkspace,
    threadParentById: state.threadParentById,
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
    refreshAccountRateLimits,
    refreshAccountInfo,
    interruptTurn,
    removeThread,
    removeThreads,
    pinThread,
    unpinThread,
    isThreadPinned,
    isSubAgentThread,
    getPinTimestamp,
    renameThread,
    startThread,
    startThreadForWorkspace,
    forkThreadForWorkspace,
    listThreadsForWorkspace,
    refreshThread,
    loadOlderMessagesForThread,
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
    resetThreadRuntimeState,
  };
}
