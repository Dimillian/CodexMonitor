import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject } from "react";
import type {
  ConversationItem,
  DebugEntry,
  ThreadListSortKey,
  ThreadSummary,
  WorkspaceInfo,
} from "@/types";
import {
  archiveThread as archiveThreadService,
  forkThread as forkThreadService,
  localThreadUsageSnapshot as localThreadUsageSnapshotService,
  listThreads as listThreadsService,
  resumeThread as resumeThreadService,
  startThread as startThreadService,
} from "@services/tauri";
import {
  buildItemsFromThread,
  getThreadCreatedTimestamp,
  getThreadTimestamp,
  isReviewingFromThread,
  mergeThreadItems,
  previewThreadName,
} from "@utils/threadItems";
import { extractThreadCodexMetadata } from "@threads/utils/threadCodexMetadata";
import {
  asString,
  normalizeTokenUsage,
  normalizeRootPath,
} from "@threads/utils/threadNormalize";
import {
  getParentThreadIdFromSource,
  getResumedTurnState,
} from "@threads/utils/threadRpc";
import { saveThreadActivity } from "@threads/utils/threadStorage";
import type { ThreadAction, ThreadState } from "./useThreadsReducer";

const THREAD_LIST_TARGET_COUNT = 20;
const THREAD_LIST_PAGE_SIZE = 100;
const THREAD_LIST_MAX_PAGES_OLDER = 6;
const THREAD_LIST_MAX_PAGES_DEFAULT = 6;
const THREAD_LIST_CURSOR_PAGE_START = "__codex_monitor_page_start__";

function getThreadListNextCursor(result: Record<string, unknown>): string | null {
  if (typeof result.nextCursor === "string") {
    return result.nextCursor;
  }
  if (typeof result.next_cursor === "string") {
    return result.next_cursor;
  }
  return null;
}

type ThreadUsageHydrationState = {
  inFlightRequestKeys: Set<string>;
  latestAppliedUpdatedAtByThread: Record<string, number>;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

type UseThreadActionsOptions = {
  dispatch: Dispatch<ThreadAction>;
  itemsByThread: ThreadState["itemsByThread"];
  threadsByWorkspace: ThreadState["threadsByWorkspace"];
  activeThreadIdByWorkspace: ThreadState["activeThreadIdByWorkspace"];
  activeTurnIdByThread: ThreadState["activeTurnIdByThread"];
  threadListCursorByWorkspace: ThreadState["threadListCursorByWorkspace"];
  threadStatusById: ThreadState["threadStatusById"];
  threadSortKey: ThreadListSortKey;
  onDebug?: (entry: DebugEntry) => void;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  threadActivityRef: MutableRefObject<Record<string, Record<string, number>>>;
  loadedThreadsRef: MutableRefObject<Record<string, boolean>>;
  replaceOnResumeRef: MutableRefObject<Record<string, boolean>>;
  applyCollabThreadLinksFromThread: (
    workspaceId: string,
    threadId: string,
    thread: Record<string, unknown>,
  ) => void;
  updateThreadParent: (parentId: string, childIds: string[]) => void;
  onSubagentThreadDetected: (workspaceId: string, threadId: string) => void;
  onThreadCodexMetadataDetected?: (
    workspaceId: string,
    threadId: string,
    metadata: { modelId: string | null; effort: string | null },
  ) => void;
};

export function useThreadActions({
  dispatch,
  itemsByThread,
  threadsByWorkspace,
  activeThreadIdByWorkspace,
  activeTurnIdByThread,
  threadListCursorByWorkspace,
  threadStatusById,
  threadSortKey,
  onDebug,
  getCustomName,
  threadActivityRef,
  loadedThreadsRef,
  replaceOnResumeRef,
  applyCollabThreadLinksFromThread,
  updateThreadParent,
  onSubagentThreadDetected,
  onThreadCodexMetadataDetected,
}: UseThreadActionsOptions) {
  const resumeInFlightByThreadRef = useRef<Record<string, number>>({});
  const threadUsageHydrationByWorkspaceRef = useRef<
    Record<string, ThreadUsageHydrationState>
  >({});
  const threadStatusByIdRef = useRef(threadStatusById);
  const activeTurnIdByThreadRef = useRef(activeTurnIdByThread);
  threadStatusByIdRef.current = threadStatusById;
  activeTurnIdByThreadRef.current = activeTurnIdByThread;

  const extractThreadId = useCallback((response: Record<string, any>) => {
    const thread = response.result?.thread ?? response.thread ?? null;
    return String(thread?.id ?? "");
  }, []);

  const hydrateThreadUsageForWorkspace = useCallback(
    async (workspace: WorkspaceInfo, threadIds: string[]) => {
      const uniqueThreadIds = Array.from(
        new Set(
          threadIds
            .map((threadId) => threadId.trim())
            .filter((threadId) => threadId.length > 0),
        ),
      );
      if (uniqueThreadIds.length === 0) {
        return;
      }

      const requestKey = [...uniqueThreadIds].sort().join("|");
      const currentState =
        threadUsageHydrationByWorkspaceRef.current[workspace.id] ?? {
          inFlightRequestKeys: new Set<string>(),
          latestAppliedUpdatedAtByThread: {},
        };
      if (currentState.inFlightRequestKeys.has(requestKey)) {
        return;
      }
      currentState.inFlightRequestKeys.add(requestKey);
      threadUsageHydrationByWorkspaceRef.current[workspace.id] = currentState;

      try {
        const snapshot = await localThreadUsageSnapshotService(
          uniqueThreadIds,
          workspace.path,
        );
        const snapshotRecord = toRecord(snapshot);
        if (!snapshotRecord) {
          return;
        }
        const updatedAtValue = snapshotRecord.updatedAt;
        const updatedAt =
          typeof updatedAtValue === "number" && Number.isFinite(updatedAtValue)
            ? updatedAtValue
            : null;
        const usageByThread = toRecord(snapshotRecord.usageByThread);
        if (!usageByThread) {
          return;
        }
        Object.entries(usageByThread).forEach(([threadId, tokenUsage]) => {
          const tokenUsageRecord = toRecord(tokenUsage);
          if (!threadId || !tokenUsageRecord) {
            return;
          }
          const latestAppliedForThread =
            currentState.latestAppliedUpdatedAtByThread[threadId] ?? 0;
          if (updatedAt !== null && updatedAt < latestAppliedForThread) {
            return;
          }
          dispatch({
            type: "setThreadTokenUsage",
            threadId,
            tokenUsage: normalizeTokenUsage(tokenUsageRecord),
          });
          if (updatedAt !== null) {
            currentState.latestAppliedUpdatedAtByThread[threadId] = Math.max(
              latestAppliedForThread,
              updatedAt,
            );
          }
        });
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-usage-hydrate-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/usage hydrate error",
          payload: error instanceof Error ? error.message : String(error),
        });
      } finally {
        currentState.inFlightRequestKeys.delete(requestKey);
      }
    },
    [dispatch, onDebug],
  );

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
    ) => {
      if (!threadId) {
        return null;
      }
      if (!force && loadedThreadsRef.current[threadId]) {
        return threadId;
      }
      const status = threadStatusByIdRef.current[threadId];
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
          const codexMetadata = extractThreadCodexMetadata(thread);
          if (codexMetadata.modelId || codexMetadata.effort) {
            onThreadCodexMetadataDetected?.(workspaceId, threadId, codexMetadata);
          }
          dispatch({ type: "ensureThread", workspaceId, threadId });
          applyCollabThreadLinksFromThread(workspaceId, threadId, thread);
          const rawTokenUsage =
            toRecord(thread.tokenUsage) ??
            toRecord(thread.token_usage) ??
            toRecord(result?.tokenUsage) ??
            toRecord(result?.token_usage);
          if (rawTokenUsage) {
            dispatch({
              type: "setThreadTokenUsage",
              threadId,
              tokenUsage: normalizeTokenUsage(rawTokenUsage),
            });
          }
          const sourceParentId = getParentThreadIdFromSource(thread.source);
          if (sourceParentId) {
            updateThreadParent(sourceParentId, [threadId]);
            onSubagentThreadDetected(workspaceId, threadId);
          }
          const items = buildItemsFromThread(thread);
          const localItems = itemsByThread[threadId] ?? [];
          const shouldReplace =
            replaceLocal || replaceOnResumeRef.current[threadId] === true;
          if (shouldReplace) {
            replaceOnResumeRef.current[threadId] = false;
          }
          if (localItems.length > 0 && !shouldReplace) {
            loadedThreadsRef.current[threadId] = true;
            return threadId;
          }
          const resumedTurnState = getResumedTurnState(thread);
          const localStatus = threadStatusByIdRef.current[threadId];
          const localActiveTurnId =
            activeTurnIdByThreadRef.current[threadId] ?? null;
          const keepLocalProcessing =
            (localStatus?.isProcessing ?? false) &&
            !resumedTurnState.activeTurnId &&
            !resumedTurnState.confidentNoActiveTurn;
          const resumedActiveTurnId = keepLocalProcessing
            ? localActiveTurnId
            : resumedTurnState.activeTurnId;
          const shouldMarkProcessing = keepLocalProcessing || Boolean(resumedActiveTurnId);
          const processingTimestamp =
            resumedTurnState.activeTurnStartedAtMs ?? Date.now();
          if (keepLocalProcessing) {
            onDebug?.({
              id: `${Date.now()}-client-thread-resume-keep-processing`,
              timestamp: Date.now(),
              source: "client",
              label: "thread/resume keep-processing",
              payload: { workspaceId, threadId },
            });
          }
          dispatch({
            type: "markProcessing",
            threadId,
            isProcessing: shouldMarkProcessing,
            timestamp: processingTimestamp,
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
          const mergedItems =
            items.length > 0
              ? shouldReplace
                ? items
                : localItems.length > 0 && !hasOverlap
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
      onSubagentThreadDetected,
      onThreadCodexMetadataDetected,
      replaceOnResumeRef,
      updateThreadParent,
    ],
  );

  const forkThreadForWorkspace = useCallback(
    async (
      workspaceId: string,
      threadId: string,
      options?: { activate?: boolean },
    ) => {
      if (!threadId) {
        return null;
      }
      const shouldActivate = options?.activate !== false;
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
        if (shouldActivate) {
          dispatch({
            type: "setActiveThreadId",
            workspaceId,
            threadId: forkedThreadId,
          });
        }
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
    [
      dispatch,
      extractThreadId,
      loadedThreadsRef,
      onDebug,
      resumeThreadForWorkspace,
    ],
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

  const buildThreadSummary = useCallback(
    (
      workspaceId: string,
      thread: Record<string, unknown>,
      fallbackIndex: number,
    ): ThreadSummary | null => {
      const id = String(thread?.id ?? "");
      if (!id) {
        return null;
      }
      const preview = asString(thread?.preview ?? "").trim();
      const customName = getCustomName(workspaceId, id);
      const fallbackName = `Agent ${fallbackIndex + 1}`;
      const name = customName
        ? customName
        : preview.length > 0
          ? preview.length > 38
            ? `${preview.slice(0, 38)}…`
            : preview
          : fallbackName;
      const metadata = extractThreadCodexMetadata(thread);
      return {
        id,
        name,
        updatedAt: getThreadTimestamp(thread),
        createdAt: getThreadCreatedTimestamp(thread),
        ...(metadata.modelId ? { modelId: metadata.modelId } : {}),
        ...(metadata.effort ? { effort: metadata.effort } : {}),
      };
    },
    [getCustomName],
  );

  const listThreadsForWorkspaces = useCallback(
    async (
      workspaces: WorkspaceInfo[],
      options?: {
        preserveState?: boolean;
        sortKey?: ThreadListSortKey;
        maxPages?: number;
      },
    ) => {
      const targets = workspaces.filter((workspace) => workspace.id);
      if (targets.length === 0) {
        return;
      }
      const preserveState = options?.preserveState ?? false;
      const requestedSortKey = options?.sortKey ?? threadSortKey;
      const maxPages = Math.max(1, options?.maxPages ?? THREAD_LIST_MAX_PAGES_DEFAULT);
      if (!preserveState) {
        targets.forEach((workspace) => {
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
        });
      }
      onDebug?.({
        id: `${Date.now()}-client-thread-list`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/list",
        payload: {
          workspaceIds: targets.map((workspace) => workspace.id),
          preserveState,
          maxPages,
        },
      });
      try {
        const requester = targets.find((workspace) => workspace.connected) ?? targets[0];
        const matchingThreadsByWorkspace: Record<string, Record<string, unknown>[]> = {};
        const workspaceIdsByPath: Record<string, string[]> = {};
        const uniqueThreadIdsByWorkspace: Record<string, Set<string>> = {};
        const resumeCursorByWorkspace: Record<string, string | null> = {};
        targets.forEach((workspace) => {
          matchingThreadsByWorkspace[workspace.id] = [];
          uniqueThreadIdsByWorkspace[workspace.id] = new Set<string>();
          resumeCursorByWorkspace[workspace.id] = null;
          const workspacePath = normalizeRootPath(workspace.path);
          if (!workspacePath) {
            return;
          }
          if (!workspaceIdsByPath[workspacePath]) {
            workspaceIdsByPath[workspacePath] = [];
          }
          workspaceIdsByPath[workspacePath].push(workspace.id);
        });
        let pagesFetched = 0;
        let cursor: string | null = null;
        do {
          const pageCursor = cursor;
          pagesFetched += 1;
          const response =
            (await listThreadsService(
              requester.id,
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
          const nextCursor = getThreadListNextCursor(result);
          data.forEach((thread) => {
            const path = normalizeRootPath(String(thread?.cwd ?? ""));
            const workspaceIds = workspaceIdsByPath[path] ?? [];
            workspaceIds.forEach((workspaceId) => {
              matchingThreadsByWorkspace[workspaceId]?.push(thread);
              const threadId = String(thread?.id ?? "");
              if (!threadId) {
                return;
              }
              const uniqueThreadIds = uniqueThreadIdsByWorkspace[workspaceId];
              if (!uniqueThreadIds || uniqueThreadIds.has(threadId)) {
                return;
              }
              uniqueThreadIds.add(threadId);
              if (
                uniqueThreadIds.size > THREAD_LIST_TARGET_COUNT &&
                resumeCursorByWorkspace[workspaceId] === null
              ) {
                resumeCursorByWorkspace[workspaceId] =
                  pageCursor ?? THREAD_LIST_CURSOR_PAGE_START;
              }
            });
          });
          cursor = nextCursor;
          if (pagesFetched >= maxPages) {
            break;
          }
        } while (cursor);

        const nextThreadActivity = { ...threadActivityRef.current };
        let didChangeAnyActivity = false;
        targets.forEach((workspace) => {
          const matchingThreads = matchingThreadsByWorkspace[workspace.id] ?? [];
          const uniqueById = new Map<string, Record<string, unknown>>();
          matchingThreads.forEach((thread) => {
            const id = String(thread?.id ?? "");
            if (id && !uniqueById.has(id)) {
              uniqueById.set(id, thread);
            }
          });
          const uniqueThreads = Array.from(uniqueById.values());
          const activityByThread = nextThreadActivity[workspace.id] ?? {};
          const nextActivityByThread = { ...activityByThread };
          let didChangeActivity = false;
          uniqueThreads.forEach((thread) => {
            const threadId = String(thread?.id ?? "");
            if (!threadId) {
              return;
            }
            const codexMetadata = extractThreadCodexMetadata(thread);
            if (codexMetadata.modelId || codexMetadata.effort) {
              onThreadCodexMetadataDetected?.(workspace.id, threadId, codexMetadata);
            }
            const sourceParentId = getParentThreadIdFromSource(thread.source);
            if (sourceParentId) {
              updateThreadParent(sourceParentId, [threadId]);
              onSubagentThreadDetected(workspace.id, threadId);
            }
            const timestamp = getThreadTimestamp(thread);
            if (timestamp > (nextActivityByThread[threadId] ?? 0)) {
              nextActivityByThread[threadId] = timestamp;
              didChangeActivity = true;
            }
          });
          if (didChangeActivity) {
            nextThreadActivity[workspace.id] = nextActivityByThread;
            didChangeAnyActivity = true;
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
              const delta =
                getThreadCreatedTimestamp(b) - getThreadCreatedTimestamp(a);
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
            .map((thread, index) => buildThreadSummary(workspace.id, thread, index))
            .filter((entry): entry is ThreadSummary => Boolean(entry));
          dispatch({
            type: "setThreads",
            workspaceId: workspace.id,
            threads: summaries,
            sortKey: requestedSortKey,
          });
          dispatch({
            type: "setThreadListCursor",
            workspaceId: workspace.id,
            cursor: resumeCursorByWorkspace[workspace.id] ?? cursor,
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
          void hydrateThreadUsageForWorkspace(
            workspace,
            summaries.map((summary) => summary.id),
          );
        });
        if (didChangeAnyActivity) {
          threadActivityRef.current = nextThreadActivity;
          saveThreadActivity(nextThreadActivity);
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
          targets.forEach((workspace) => {
            dispatch({
              type: "setThreadListLoading",
              workspaceId: workspace.id,
              isLoading: false,
            });
          });
        }
      }
    },
    [
      buildThreadSummary,
      dispatch,
      hydrateThreadUsageForWorkspace,
      onDebug,
      onSubagentThreadDetected,
      onThreadCodexMetadataDetected,
      threadActivityRef,
      threadSortKey,
      updateThreadParent,
    ],
  );

  const listThreadsForWorkspace = useCallback(
    async (
      workspace: WorkspaceInfo,
      options?: {
        preserveState?: boolean;
        sortKey?: ThreadListSortKey;
        maxPages?: number;
      },
    ) => {
      await listThreadsForWorkspaces([workspace], options);
    },
    [listThreadsForWorkspaces],
  );

  const loadOlderThreadsForWorkspace = useCallback(
    async (workspace: WorkspaceInfo) => {
      const requestedSortKey = threadSortKey;
      const cursorValue = threadListCursorByWorkspace[workspace.id] ?? null;
      if (!cursorValue) {
        return;
      }
      const nextCursor =
        cursorValue === THREAD_LIST_CURSOR_PAGE_START ? null : cursorValue;
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
        payload: { workspaceId: workspace.id, cursor: cursorValue },
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
          const next = getThreadListNextCursor(result);
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
          const codexMetadata = extractThreadCodexMetadata(thread);
          if (codexMetadata.modelId || codexMetadata.effort) {
            onThreadCodexMetadataDetected?.(workspace.id, id, codexMetadata);
          }
          const sourceParentId = getParentThreadIdFromSource(thread.source);
          if (sourceParentId) {
            updateThreadParent(sourceParentId, [id]);
          }
          const summary = buildThreadSummary(
            workspace.id,
            thread,
            existing.length + additions.length,
          );
          if (!summary) {
            return;
          }
          additions.push(summary);
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
        void hydrateThreadUsageForWorkspace(
          workspace,
          additions.map((thread) => thread.id),
        );
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
      buildThreadSummary,
      dispatch,
      hydrateThreadUsageForWorkspace,
      onDebug,
      threadListCursorByWorkspace,
      threadsByWorkspace,
      threadSortKey,
      updateThreadParent,
      onThreadCodexMetadataDetected,
    ],
  );

  const archiveThread = useCallback(
    async (workspaceId: string, threadId: string) => {
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
    },
    [onDebug],
  );

  return {
    startThreadForWorkspace,
    forkThreadForWorkspace,
    resumeThreadForWorkspace,
    refreshThread,
    resetWorkspaceThreads,
    listThreadsForWorkspaces,
    listThreadsForWorkspace,
    loadOlderThreadsForWorkspace,
    archiveThread,
  };
}
