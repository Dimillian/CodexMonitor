import type { ThreadSummary } from "@/types";
import type { ThreadAction, ThreadState } from "../useThreadsReducer";
import { prefersUpdatedSort } from "./common";

type ThreadStatus = ThreadState["threadStatusById"][string];

function statusEquals(previous: ThreadStatus, nextStatus: ThreadStatus) {
  return (
    previous.isProcessing === nextStatus.isProcessing &&
    previous.hasUnread === nextStatus.hasUnread &&
    previous.isReviewing === nextStatus.isReviewing &&
    previous.processingStartedAt === nextStatus.processingStartedAt &&
    previous.lastDurationMs === nextStatus.lastDurationMs
  );
}

export function reduceThreadLifecycle(
  state: ThreadState,
  action: ThreadAction,
): ThreadState {
  switch (action.type) {
    case "setActiveThreadId":
      return {
        ...state,
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]: action.threadId,
        },
        threadStatusById: action.threadId
          ? {
              ...state.threadStatusById,
              [action.threadId]: {
                isProcessing:
                  state.threadStatusById[action.threadId]?.isProcessing ?? false,
                hasUnread: false,
                isReviewing:
                  state.threadStatusById[action.threadId]?.isReviewing ?? false,
                processingStartedAt:
                  state.threadStatusById[action.threadId]?.processingStartedAt ??
                  null,
                lastDurationMs:
                  state.threadStatusById[action.threadId]?.lastDurationMs ?? null,
              },
            }
          : state.threadStatusById,
      };
    case "ensureThread": {
      const hidden =
        state.hiddenThreadIdsByWorkspace[action.workspaceId]?.[action.threadId] ??
        false;
      if (hidden) {
        return state;
      }
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      if (list.some((thread) => thread.id === action.threadId)) {
        return state;
      }
      const thread: ThreadSummary = {
        id: action.threadId,
        name: "New Agent",
        updatedAt: 0,
      };
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: [thread, ...list],
        },
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: {
            isProcessing: false,
            hasUnread: false,
            isReviewing: false,
            processingStartedAt: null,
            lastDurationMs: null,
          },
        },
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]:
            state.activeThreadIdByWorkspace[action.workspaceId] ?? action.threadId,
        },
      };
    }
    case "hideThread": {
      const hiddenForWorkspace =
        state.hiddenThreadIdsByWorkspace[action.workspaceId] ?? {};
      if (hiddenForWorkspace[action.threadId]) {
        return state;
      }

      const nextHiddenForWorkspace = {
        ...hiddenForWorkspace,
        [action.threadId]: true as const,
      };

      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      const filtered = list.filter((thread) => thread.id !== action.threadId);
      const nextActive =
        state.activeThreadIdByWorkspace[action.workspaceId] === action.threadId
          ? filtered[0]?.id ?? null
          : state.activeThreadIdByWorkspace[action.workspaceId] ?? null;

      return {
        ...state,
        hiddenThreadIdsByWorkspace: {
          ...state.hiddenThreadIdsByWorkspace,
          [action.workspaceId]: nextHiddenForWorkspace,
        },
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: filtered,
        },
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]: nextActive,
        },
      };
    }
    case "removeThread": {
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      const filtered = list.filter((thread) => thread.id !== action.threadId);
      const nextActive =
        state.activeThreadIdByWorkspace[action.workspaceId] === action.threadId
          ? filtered[0]?.id ?? null
          : state.activeThreadIdByWorkspace[action.workspaceId] ?? null;
      const { [action.threadId]: _, ...restItems } = state.itemsByThread;
      const { [action.threadId]: __, ...restStatus } = state.threadStatusById;
      const { [action.threadId]: ___, ...restTurns } = state.activeTurnIdByThread;
      const { [action.threadId]: ____, ...restDiffs } = state.turnDiffByThread;
      const { [action.threadId]: _____, ...restPlans } = state.planByThread;
      const { [action.threadId]: ______, ...restParents } = state.threadParentById;
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: filtered,
        },
        itemsByThread: restItems,
        threadStatusById: restStatus,
        activeTurnIdByThread: restTurns,
        turnDiffByThread: restDiffs,
        planByThread: restPlans,
        threadParentById: restParents,
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]: nextActive,
        },
      };
    }
    case "setThreadParent": {
      if (!action.parentId || action.parentId === action.threadId) {
        return state;
      }
      if (state.threadParentById[action.threadId] === action.parentId) {
        return state;
      }
      return {
        ...state,
        threadParentById: {
          ...state.threadParentById,
          [action.threadId]: action.parentId,
        },
      };
    }
    case "markProcessing": {
      const previous = state.threadStatusById[action.threadId];
      const wasProcessing = previous?.isProcessing ?? false;
      const startedAt = previous?.processingStartedAt ?? null;
      const lastDurationMs = previous?.lastDurationMs ?? null;
      const hasUnread = previous?.hasUnread ?? false;
      const isReviewing = previous?.isReviewing ?? false;
      if (action.isProcessing) {
        const nextStartedAt =
          wasProcessing && startedAt ? startedAt : action.timestamp;
        const nextStatus: ThreadStatus = {
          isProcessing: true,
          hasUnread,
          isReviewing,
          processingStartedAt: nextStartedAt,
          lastDurationMs,
        };
        if (previous && statusEquals(previous, nextStatus)) {
          return state;
        }
        return {
          ...state,
          threadStatusById: {
            ...state.threadStatusById,
            [action.threadId]: nextStatus,
          },
        };
      }
      const nextDuration =
        wasProcessing && startedAt
          ? Math.max(0, action.timestamp - startedAt)
          : lastDurationMs ?? null;
      const nextStatus: ThreadStatus = {
        isProcessing: false,
        hasUnread,
        isReviewing,
        processingStartedAt: null,
        lastDurationMs: nextDuration,
      };
      if (previous && statusEquals(previous, nextStatus)) {
        return state;
      }
      return {
        ...state,
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: nextStatus,
        },
      };
    }
    case "setActiveTurnId":
      return {
        ...state,
        activeTurnIdByThread: {
          ...state.activeTurnIdByThread,
          [action.threadId]: action.turnId,
        },
      };
    case "markReviewing": {
      const previous = state.threadStatusById[action.threadId];
      const nextStatus: ThreadStatus = {
        isProcessing: previous?.isProcessing ?? false,
        hasUnread: previous?.hasUnread ?? false,
        isReviewing: action.isReviewing,
        processingStartedAt: previous?.processingStartedAt ?? null,
        lastDurationMs: previous?.lastDurationMs ?? null,
      };
      if (previous && statusEquals(previous, nextStatus)) {
        return state;
      }
      return {
        ...state,
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: nextStatus,
        },
      };
    }
    case "markUnread": {
      const previous = state.threadStatusById[action.threadId];
      const nextStatus: ThreadStatus = {
        isProcessing: previous?.isProcessing ?? false,
        hasUnread: action.hasUnread,
        isReviewing: previous?.isReviewing ?? false,
        processingStartedAt: previous?.processingStartedAt ?? null,
        lastDurationMs: previous?.lastDurationMs ?? null,
      };
      if (previous && statusEquals(previous, nextStatus)) {
        return state;
      }
      return {
        ...state,
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: nextStatus,
        },
      };
    }
    case "setThreadName": {
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      const next = list.map((thread) =>
        thread.id === action.threadId ? { ...thread, name: action.name } : thread,
      );
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: next,
        },
      };
    }
    case "setThreadTimestamp": {
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      if (!list.length) {
        return state;
      }
      let didChange = false;
      const next = list.map((thread) => {
        if (thread.id !== action.threadId) {
          return thread;
        }
        const current = thread.updatedAt ?? 0;
        if (current >= action.timestamp) {
          return thread;
        }
        didChange = true;
        return { ...thread, updatedAt: action.timestamp };
      });
      if (!didChange) {
        return state;
      }
      const sorted = prefersUpdatedSort(state, action.workspaceId)
        ? [
            ...next.filter((thread) => thread.id === action.threadId),
            ...next.filter((thread) => thread.id !== action.threadId),
          ]
        : next;
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: sorted,
        },
      };
    }
    case "setThreads": {
      const hidden = state.hiddenThreadIdsByWorkspace[action.workspaceId] ?? {};
      const visibleThreads = action.threads.filter((thread) => !hidden[thread.id]);
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: visibleThreads,
        },
        threadSortKeyByWorkspace: {
          ...state.threadSortKeyByWorkspace,
          [action.workspaceId]: action.sortKey,
        },
      };
    }
    case "setThreadListLoading":
      return {
        ...state,
        threadListLoadingByWorkspace: {
          ...state.threadListLoadingByWorkspace,
          [action.workspaceId]: action.isLoading,
        },
      };
    case "setThreadResumeLoading":
      return {
        ...state,
        threadResumeLoadingById: {
          ...state.threadResumeLoadingById,
          [action.threadId]: action.isLoading,
        },
      };
    case "setThreadListPaging":
      return {
        ...state,
        threadListPagingByWorkspace: {
          ...state.threadListPagingByWorkspace,
          [action.workspaceId]: action.isLoading,
        },
      };
    case "setThreadListCursor":
      return {
        ...state,
        threadListCursorByWorkspace: {
          ...state.threadListCursorByWorkspace,
          [action.workspaceId]: action.cursor,
        },
      };
    default:
      return state;
  }
}
