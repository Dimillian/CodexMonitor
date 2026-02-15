import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject } from "react";
import type {
  ConversationItem,
  DebugEntry,
  ThreadArchiveBatchResult,
  ThreadListSortKey,
  ThreadSummary,
  WorkspaceInfo,
} from "../../../types";
import {
  archiveThread as archiveThreadService,
  archiveThreads as archiveThreadsService,
  forkThread as forkThreadService,
  listThreads as listThreadsService,
  resumeThread as resumeThreadService,
  startThread as startThreadService,
} from "../../../services/tauri";
import {
  buildItemsFromThread,
  getThreadCreatedTimestamp,
  getThreadTimestamp,
  isReviewingFromThread,
  mergeThreadItems,
  previewThreadName,
} from "../../../utils/threadItems";
import {
  asString,
  normalizeRootPath,
} from "../utils/threadNormalize";
import { saveThreadActivity } from "../utils/threadStorage";
import type { ThreadAction, ThreadState } from "./useThreadsReducer";

const THREAD_LIST_TARGET_COUNT = 20;
const THREAD_LIST_PAGE_SIZE = 100;
const THREAD_LIST_MAX_PAGES_WITH_ACTIVITY = 8;
const THREAD_LIST_MAX_PAGES_WITHOUT_ACTIVITY = 3;
const THREAD_LIST_MAX_PAGES_OLDER = 6;

<<<<<<< HEAD
function resolveThreadDisplayName(
  thread: Record<string, unknown>,
  index: number,
  workspaceId: string,
  getCustomName: (workspaceId: string, threadId: string) => string | undefined,
  getPersistedThreadDisplayName?: (
    workspaceId: string,
    threadId: string,
  ) => string | undefined,
): string {
  const id = String(thread.id ?? "");
  const customName = getCustomName(workspaceId, id)?.trim();
  if (customName) {
    return customName;
  }
  const persistedName = getPersistedThreadDisplayName?.(workspaceId, id)?.trim();
  if (persistedName) {
    return persistedName;
  }
  const serverName = asString(thread.name ?? thread.thread_name ?? "").trim();
  if (serverName) {
    return serverName;
  }
  const preview = asString(thread.preview ?? "").trim();
  if (preview.length > 0) {
    return preview.length > 38 ? `${preview.slice(0, 38)}…` : preview;
  }
  return `Agent ${index + 1}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function getParentThreadIdFromSource(source: unknown): string | null {
  const sourceRecord = asRecord(source);
  if (!sourceRecord) {
    return null;
  }
  const subAgent = asRecord(sourceRecord.subAgent ?? sourceRecord.sub_agent);
  if (!subAgent) {
    return null;
  }
  const threadSpawn = asRecord(subAgent.thread_spawn ?? subAgent.threadSpawn);
  if (!threadSpawn) {
    return null;
  }
  const parentId = asString(
    threadSpawn.parent_thread_id ?? threadSpawn.parentThreadId,
  );
  return parentId || null;
}

function normalizeTurnStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

function getResumedActiveTurnId(thread: Record<string, unknown>): string | null {
  const turns = Array.isArray(thread.turns)
    ? (thread.turns as Array<Record<string, unknown>>)
    : [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || typeof turn !== "object") {
      continue;
    }
    const status = normalizeTurnStatus(
      turn.status ?? turn.turnStatus ?? turn.turn_status,
    );
    const isInProgress =
      status === "inprogress" ||
      status === "running" ||
      status === "processing" ||
      status === "pending" ||
      status === "started";
    if (!isInProgress) {
      continue;
    }
    const turnId = asString(turn.id ?? turn.turnId ?? turn.turn_id);
    if (turnId) {
      return turnId;
    }
  }
  return null;
}

function normalizeArchiveThreadsResult(
  threadIds: string[],
  response: unknown,
): ThreadArchiveBatchResult {
  const requestedIds = Array.from(
    new Set(
      threadIds
        .map((threadId) => threadId.trim())
        .filter((threadId) => threadId.length > 0),
    ),
  );
  if (requestedIds.length === 0) {
    return {
      allSucceeded: true,
      okIds: [],
      failed: [],
      total: 0,
    };
  }

  const requestedIdSet = new Set(requestedIds);
  const responseRecord = asRecord(response);
  const payloadRecord = asRecord(responseRecord?.result) ?? responseRecord;
  const okIdsRaw = Array.isArray(payloadRecord?.okIds)
    ? payloadRecord?.okIds
    : [];
  const okIds = Array.from(
    new Set(
      okIdsRaw
        .map((value) => asString(value).trim())
        .filter((threadId) => threadId.length > 0 && requestedIdSet.has(threadId)),
    ),
  );
  const okIdSet = new Set(okIds);
  const failedRaw = Array.isArray(payloadRecord?.failed)
    ? payloadRecord?.failed
    : [];
  const failedByThreadId = new Map<string, string>();
  failedRaw.forEach((entry) => {
    const failedEntry = asRecord(entry);
    if (!failedEntry) {
      return;
    }
    const threadId = asString(failedEntry.threadId ?? failedEntry.thread_id).trim();
    if (!threadId || !requestedIdSet.has(threadId) || okIdSet.has(threadId)) {
      return;
    }
    const error = asString(failedEntry.error).trim() || "archive_failed";
    failedByThreadId.set(threadId, error);
  });
  requestedIds.forEach((threadId) => {
    if (okIdSet.has(threadId) || failedByThreadId.has(threadId)) {
      return;
    }
    failedByThreadId.set(threadId, "archive_failed");
  });

  const failed = Array.from(failedByThreadId.entries()).map(
    ([threadId, error]) => ({
      threadId,
      error,
    }),
  );
  return {
    allSucceeded: failed.length === 0,
    okIds,
    failed,
    total: requestedIds.length,
  };
}

function shouldFallbackToSingleArchive(errorMessage: string): boolean {
  const message = errorMessage.toLowerCase();
  const methodUnsupported =
    message.includes("unsupported method")
    || message.includes("method not found")
    || message.includes("missing method")
    || message.includes("unknown method");
  const threadIdsMismatch =
    message.includes("threadids")
    && (message.includes("missing") || message.includes("invalid"));
  return methodUnsupported || threadIdsMismatch;
}

=======
>>>>>>> origin/main
type UseThreadActionsOptions = {
  dispatch: Dispatch<ThreadAction>;
  itemsByThread: ThreadState["itemsByThread"];
  threadsByWorkspace: ThreadState["threadsByWorkspace"];
  activeThreadIdByWorkspace: ThreadState["activeThreadIdByWorkspace"];
  threadListCursorByWorkspace: ThreadState["threadListCursorByWorkspace"];
  threadStatusById: ThreadState["threadStatusById"];
  threadSortKey: ThreadListSortKey;
  onDebug?: (entry: DebugEntry) => void;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  getPersistedThreadDisplayName?: (
    workspaceId: string,
    threadId: string,
  ) => string | undefined;
  threadActivityRef: MutableRefObject<Record<string, Record<string, number>>>;
  loadedThreadsRef: MutableRefObject<Record<string, boolean>>;
  replaceOnResumeRef: MutableRefObject<Record<string, boolean>>;
  applyCollabThreadLinksFromThread: (
    threadId: string,
    thread: Record<string, unknown>,
  ) => void;
  updateThreadParent: (parentId: string, childIds: string[]) => void;
<<<<<<< HEAD
  markSubAgentThread?: (threadId: string) => void;
  recordThreadCreatedAt?: (threadId: string, createdAt: number) => void;
=======
  onSubagentThreadDetected: (workspaceId: string, threadId: string) => void;
>>>>>>> origin/main
};

export function useThreadActions({
  dispatch,
  itemsByThread,
  threadsByWorkspace,
  activeThreadIdByWorkspace,
  threadListCursorByWorkspace,
  threadStatusById,
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
}: UseThreadActionsOptions) {
  const resumeInFlightByThreadRef = useRef<Record<string, number>>({});

  const extractThreadId = useCallback((response: Record<string, any>) => {
    const thread = response.result?.thread ?? response.thread ?? null;
    return String(thread?.id ?? "");
  }, []);

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
        const threadId = extractThreadId(response);
        if (threadId) {
          dispatch({ type: "ensureThread", workspaceId, threadId });
          if (shouldActivate) {
            dispatch({ type: "setActiveThreadId", workspaceId, threadId });
          }
          loadedThreadsRef.current[threadId] = true;
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
    [dispatch, extractThreadId, loadedThreadsRef, onDebug],
  );

  const resumeThreadForWorkspace = useCallback(
    async (
      workspaceId: string,
      threadId: string,
      force = false,
      replaceLocal = false,
      skipLoadedItemsShortcut = false,
    ) => {
      if (!threadId) {
        return null;
      }
      if (!force && loadedThreadsRef.current[threadId]) {
        return threadId;
      }
      const status = threadStatusById[threadId];
      if (status?.isProcessing && loadedThreadsRef.current[threadId] && !force) {
        onDebug?.({
          id: `${Date.now()}-client-thread-resume-skipped`,
          timestamp: Date.now(),
          source: "client",
          label: "thread/resume skipped",
          payload: { workspaceId, threadId, reason: "active-turn" },
        });
        return threadId;
      }
      onDebug?.({
        id: `${Date.now()}-client-thread-resume`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/resume",
        payload: { workspaceId, threadId },
      });
      const inFlightCount =
        (resumeInFlightByThreadRef.current[threadId] ?? 0) + 1;
      resumeInFlightByThreadRef.current[threadId] = inFlightCount;
      if (inFlightCount === 1) {
        dispatch({ type: "setThreadResumeLoading", threadId, isLoading: true });
      }
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
          dispatch({ type: "ensureThread", workspaceId, threadId });
          applyCollabThreadLinksFromThread(threadId, thread);
          const sourceParentId = getParentThreadIdFromSource(thread.source);
          if (sourceParentId) {
            updateThreadParent(sourceParentId, [threadId]);
<<<<<<< HEAD
            markSubAgentThread?.(threadId);
=======
            onSubagentThreadDetected(workspaceId, threadId);
>>>>>>> origin/main
          }
          recordThreadCreatedAt?.(threadId, getThreadCreatedTimestamp(thread));
          const items = buildItemsFromThread(thread);
          const localItems = itemsByThread[threadId] ?? [];
          const shouldReplace =
            replaceLocal || replaceOnResumeRef.current[threadId] === true;
          if (shouldReplace) {
            replaceOnResumeRef.current[threadId] = false;
          }
          if (localItems.length > 0 && !shouldReplace && !skipLoadedItemsShortcut) {
            loadedThreadsRef.current[threadId] = true;
            return threadId;
          }
          const resumedActiveTurnId = getResumedActiveTurnId(thread);
          dispatch({
            type: "markProcessing",
            threadId,
            isProcessing: Boolean(resumedActiveTurnId),
            timestamp: Date.now(),
          });
          dispatch({
            type: "setActiveTurnId",
            threadId,
            turnId: resumedActiveTurnId,
          });
          dispatch({
            type: "markReviewing",
            threadId,
            isReviewing: isReviewingFromThread(thread),
          });
          const hasOverlap =
            items.length > 0 &&
            localItems.length > 0 &&
            items.some((item) => localItems.some((local) => local.id === item.id));
          const keepLocalWithoutMerge =
            localItems.length > 0 && !hasOverlap && !skipLoadedItemsShortcut;
          const mergedItems =
            items.length > 0
              ? shouldReplace
                ? items
                : keepLocalWithoutMerge
                  ? localItems
                  : mergeThreadItems(items, localItems)
              : localItems;
          if (mergedItems.length > 0) {
            dispatch({ type: "setThreadItems", threadId, items: mergedItems });
          }
          const preview = asString(thread?.preview ?? "");
          const customName = getCustomName(workspaceId, threadId);
          if (!customName && preview) {
            dispatch({
              type: "setThreadName",
              workspaceId,
              threadId,
              name: previewThreadName(preview, "New Agent"),
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
        loadedThreadsRef.current[threadId] = true;
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
      } finally {
        const nextCount = Math.max(
          0,
          (resumeInFlightByThreadRef.current[threadId] ?? 1) - 1,
        );
        if (nextCount === 0) {
          delete resumeInFlightByThreadRef.current[threadId];
          dispatch({ type: "setThreadResumeLoading", threadId, isLoading: false });
        } else {
          resumeInFlightByThreadRef.current[threadId] = nextCount;
        }
      }
    },
    [
      applyCollabThreadLinksFromThread,
      dispatch,
      getCustomName,
      itemsByThread,
      loadedThreadsRef,
      onDebug,
      replaceOnResumeRef,
      threadStatusById,
      updateThreadParent,
      markSubAgentThread,
      recordThreadCreatedAt,
    ],
  );

  const forkThreadForWorkspace = useCallback(
    async (workspaceId: string, threadId: string) => {
      if (!threadId) {
        return null;
      }
      onDebug?.({
        id: `${Date.now()}-client-thread-fork`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/fork",
        payload: { workspaceId, threadId },
      });
      try {
        const response = await forkThreadService(workspaceId, threadId);
        onDebug?.({
          id: `${Date.now()}-server-thread-fork`,
          timestamp: Date.now(),
          source: "server",
          label: "thread/fork response",
          payload: response,
        });
        const forkedThreadId = extractThreadId(response);
        if (!forkedThreadId) {
          return null;
        }
        dispatch({ type: "ensureThread", workspaceId, threadId: forkedThreadId });
        dispatch({
          type: "setActiveThreadId",
          workspaceId,
          threadId: forkedThreadId,
        });
        loadedThreadsRef.current[forkedThreadId] = false;
        await resumeThreadForWorkspace(workspaceId, forkedThreadId, true, true);
        return forkedThreadId;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-fork-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/fork error",
          payload: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
    [dispatch, extractThreadId, loadedThreadsRef, onDebug, resumeThreadForWorkspace],
  );

  const refreshThread = useCallback(
    async (workspaceId: string, threadId: string) => {
      if (!threadId) {
        return null;
      }
      replaceOnResumeRef.current[threadId] = true;
      return resumeThreadForWorkspace(workspaceId, threadId, true, true);
    },
    [replaceOnResumeRef, resumeThreadForWorkspace],
  );

  const loadOlderMessagesForThread = useCallback(
    async (workspaceId: string, threadId: string) => {
      if (!threadId) {
        return null;
      }
      return resumeThreadForWorkspace(workspaceId, threadId, true, false, true);
    },
    [resumeThreadForWorkspace],
  );

  const resetWorkspaceThreads = useCallback(
    (workspaceId: string) => {
      const threadIds = new Set<string>();
      const list = threadsByWorkspace[workspaceId] ?? [];
      list.forEach((thread) => threadIds.add(thread.id));
      const activeThread = activeThreadIdByWorkspace[workspaceId];
      if (activeThread) {
        threadIds.add(activeThread);
      }
      threadIds.forEach((threadId) => {
        loadedThreadsRef.current[threadId] = false;
      });
    },
    [activeThreadIdByWorkspace, loadedThreadsRef, threadsByWorkspace],
  );

  const listThreadsForWorkspace = useCallback(
    async (
      workspace: WorkspaceInfo,
      options?: {
        preserveState?: boolean;
        sortKey?: ThreadListSortKey;
      },
    ) => {
      const preserveState = options?.preserveState ?? false;
      const requestedSortKey = options?.sortKey ?? threadSortKey;
      const workspacePath = normalizeRootPath(workspace.path);
      if (!preserveState) {
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
      }
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
        const maxPagesWithoutMatch = hasKnownActivity
          ? THREAD_LIST_MAX_PAGES_WITH_ACTIVITY
          : THREAD_LIST_MAX_PAGES_WITHOUT_ACTIVITY;
        let pagesFetched = 0;
        let cursor: string | null = null;
        do {
          pagesFetched += 1;
          const response =
            (await listThreadsService(
              workspace.id,
              cursor,
              THREAD_LIST_PAGE_SIZE,
              requestedSortKey,
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
          if (pagesFetched >= THREAD_LIST_MAX_PAGES_WITH_ACTIVITY) {
            break;
          }
        } while (cursor && matchingThreads.length < THREAD_LIST_TARGET_COUNT);

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
          const sourceParentId = getParentThreadIdFromSource(thread.source);
          if (sourceParentId) {
            updateThreadParent(sourceParentId, [threadId]);
<<<<<<< HEAD
            markSubAgentThread?.(threadId);
=======
            onSubagentThreadDetected(workspace.id, threadId);
>>>>>>> origin/main
          }
          recordThreadCreatedAt?.(threadId, getThreadCreatedTimestamp(thread));
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
        if (requestedSortKey === "updated_at") {
          uniqueThreads.sort((a, b) => {
            const aId = String(a?.id ?? "");
            const bId = String(b?.id ?? "");
            const aCreated = getThreadTimestamp(a);
            const bCreated = getThreadTimestamp(b);
            const aActivity = Math.max(nextActivityByThread[aId] ?? 0, aCreated);
            const bActivity = Math.max(nextActivityByThread[bId] ?? 0, bCreated);
            return bActivity - aActivity;
          });
        } else {
          uniqueThreads.sort((a, b) => {
            const delta = getThreadCreatedTimestamp(b) - getThreadCreatedTimestamp(a);
            if (delta !== 0) {
              return delta;
            }
            const aId = String(a?.id ?? "");
            const bId = String(b?.id ?? "");
            return aId.localeCompare(bId);
          });
        }
        const summaries = uniqueThreads
          .slice(0, THREAD_LIST_TARGET_COUNT)
          .map((thread, index) => {
            const id = String(thread?.id ?? "");
            const name = resolveThreadDisplayName(
              thread,
              index,
              workspace.id,
              getCustomName,
              getPersistedThreadDisplayName,
            );
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
          sortKey: requestedSortKey,
        });
        dispatch({
          type: "setThreadListCursor",
          workspaceId: workspace.id,
          cursor,
        });
        const lastAgentUpdates = uniqueThreads
          .map((thread) => {
            const threadId = String(thread?.id ?? "");
            const preview = asString(thread?.preview ?? "").trim();
            if (!threadId || !preview) {
              return null;
            }
            return {
              threadId,
              text: preview,
              timestamp: getThreadTimestamp(thread),
            };
          })
          .filter(
            (
              entry,
            ): entry is { threadId: string; text: string; timestamp: number } =>
              Boolean(entry),
          );
        if (lastAgentUpdates.length > 0) {
          dispatch({
            type: "setLastAgentMessagesBulk",
            updates: lastAgentUpdates,
          });
        }
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-list-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/list error",
          payload: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (!preserveState) {
          dispatch({
            type: "setThreadListLoading",
            workspaceId: workspace.id,
            isLoading: false,
          });
        }
      }
    },
    [
      dispatch,
      getCustomName,
      getPersistedThreadDisplayName,
      onDebug,
      threadActivityRef,
      threadSortKey,
      updateThreadParent,
<<<<<<< HEAD
      markSubAgentThread,
      recordThreadCreatedAt,
=======
      onSubagentThreadDetected,
>>>>>>> origin/main
    ],
  );

  const loadOlderThreadsForWorkspace = useCallback(
    async (workspace: WorkspaceInfo) => {
      const requestedSortKey = threadSortKey;
      const nextCursor = threadListCursorByWorkspace[workspace.id] ?? null;
      if (!nextCursor) {
        return;
      }
      const workspacePath = normalizeRootPath(workspace.path);
      const existing = threadsByWorkspace[workspace.id] ?? [];
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
        const maxPagesWithoutMatch = THREAD_LIST_MAX_PAGES_OLDER;
        let pagesFetched = 0;
        let cursor: string | null = nextCursor;
        do {
          pagesFetched += 1;
          const response =
            (await listThreadsService(
              workspace.id,
              cursor,
              THREAD_LIST_PAGE_SIZE,
              requestedSortKey,
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
          if (pagesFetched >= THREAD_LIST_MAX_PAGES_OLDER) {
            break;
          }
        } while (cursor && matchingThreads.length < THREAD_LIST_TARGET_COUNT);

        const existingIds = new Set(existing.map((thread) => thread.id));
        const additions: ThreadSummary[] = [];
        matchingThreads.forEach((thread) => {
          const id = String(thread?.id ?? "");
          if (!id || existingIds.has(id)) {
            return;
          }
          const sourceParentId = getParentThreadIdFromSource(thread.source);
          if (sourceParentId) {
            updateThreadParent(sourceParentId, [id]);
            markSubAgentThread?.(id);
          }
          recordThreadCreatedAt?.(id, getThreadCreatedTimestamp(thread));
          const name = resolveThreadDisplayName(
            thread,
            existing.length + additions.length,
            workspace.id,
            getCustomName,
            getPersistedThreadDisplayName,
          );
          additions.push({ id, name, updatedAt: getThreadTimestamp(thread) });
          existingIds.add(id);
        });

        if (additions.length > 0) {
          dispatch({
            type: "setThreads",
            workspaceId: workspace.id,
            threads: [...existing, ...additions],
            sortKey: requestedSortKey,
          });
        }
        dispatch({
          type: "setThreadListCursor",
          workspaceId: workspace.id,
          cursor,
        });
        const lastAgentUpdates = matchingThreads
          .map((thread) => {
            const threadId = String(thread?.id ?? "");
            const preview = asString(thread?.preview ?? "").trim();
            if (!threadId || !preview) {
              return null;
            }
            return {
              threadId,
              text: preview,
              timestamp: getThreadTimestamp(thread),
            };
          })
          .filter(
            (
              entry,
            ): entry is { threadId: string; text: string; timestamp: number } =>
              Boolean(entry),
          );
        if (lastAgentUpdates.length > 0) {
          dispatch({
            type: "setLastAgentMessagesBulk",
            updates: lastAgentUpdates,
          });
        }
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
      dispatch,
      getCustomName,
      getPersistedThreadDisplayName,
      onDebug,
      threadListCursorByWorkspace,
      threadsByWorkspace,
      threadSortKey,
      updateThreadParent,
      markSubAgentThread,
      recordThreadCreatedAt,
    ],
  );

  const archiveThreads = useCallback(
    async (
      workspaceId: string,
      threadIds: string[],
    ): Promise<ThreadArchiveBatchResult> => {
      const normalizedThreadIds = Array.from(
        new Set(
          threadIds
            .map((threadId) => threadId.trim())
            .filter((threadId) => threadId.length > 0),
        ),
      );
      if (normalizedThreadIds.length === 0) {
        return {
          allSucceeded: true,
          okIds: [],
          failed: [],
          total: 0,
        };
      }
      try {
        const response = await archiveThreadsService(workspaceId, normalizedThreadIds);
        const result = normalizeArchiveThreadsResult(normalizedThreadIds, response);
        onDebug?.({
          id: `${Date.now()}-client-thread-archive-batch`,
          timestamp: Date.now(),
          source: result.allSucceeded ? "server" : "error",
          label: "thread/archive batch",
          payload: {
            workspaceId,
            total: result.total,
            okIds: result.okIds,
            failed: result.failed,
            allSucceeded: result.allSucceeded,
          },
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (shouldFallbackToSingleArchive(message)) {
          const okIds: string[] = [];
          const failed: Array<{ threadId: string; error: string }> = [];
          for (const threadId of normalizedThreadIds) {
            try {
              await archiveThreadService(workspaceId, threadId);
              okIds.push(threadId);
            } catch (singleError) {
              failed.push({
                threadId,
                error:
                  singleError instanceof Error
                    ? singleError.message
                    : String(singleError),
              });
            }
          }
          const result: ThreadArchiveBatchResult = {
            allSucceeded: failed.length === 0,
            okIds,
            failed,
            total: normalizedThreadIds.length,
          };
          onDebug?.({
            id: `${Date.now()}-client-thread-archive-batch-fallback`,
            timestamp: Date.now(),
            source: result.allSucceeded ? "server" : "error",
            label: "thread/archive batch fallback",
            payload: {
              workspaceId,
              reason: message,
              total: result.total,
              okIds: result.okIds,
              failed: result.failed,
              allSucceeded: result.allSucceeded,
            },
          });
          return result;
        }
        const result: ThreadArchiveBatchResult = {
          allSucceeded: false,
          okIds: [],
          failed: normalizedThreadIds.map((threadId) => ({
            threadId,
            error: message,
          })),
          total: normalizedThreadIds.length,
        };
        onDebug?.({
          id: `${Date.now()}-client-thread-archive-batch-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/archive batch error",
          payload: {
            workspaceId,
            total: result.total,
            failed: result.failed,
          },
        });
        return result;
      }
    },
    [onDebug],
  );

  const archiveThread = useCallback(
    async (workspaceId: string, threadId: string) => {
      const result = await archiveThreads(workspaceId, [threadId]);
      return result.allSucceeded;
    },
    [archiveThreads],
  );

  return {
    startThreadForWorkspace,
    forkThreadForWorkspace,
    resumeThreadForWorkspace,
    refreshThread,
    loadOlderMessagesForThread,
    resetWorkspaceThreads,
    listThreadsForWorkspace,
    loadOlderThreadsForWorkspace,
    archiveThreads,
    archiveThread,
  };
}
