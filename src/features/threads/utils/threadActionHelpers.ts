import type {
  ConversationItem,
  ThreadListSortKey,
  ThreadSummary,
  WorkspaceInfo,
} from "@/types";
import {
  buildItemsFromThread,
  getThreadCreatedTimestamp,
  getThreadTimestamp,
  isReviewingFromThread,
  mergeThreadItems,
  previewThreadName,
} from "@utils/threadItems";
import { asString, normalizeRootPath } from "./threadNormalize";
import { getResumedTurnState } from "./threadRpc";

function isWithinWorkspaceRoot(path: string, workspaceRoot: string) {
  if (!path || !workspaceRoot) {
    return false;
  }
  return (
    path === workspaceRoot ||
    (path.length > workspaceRoot.length &&
      path.startsWith(workspaceRoot) &&
      path.charCodeAt(workspaceRoot.length) === 47)
  );
}

export type WorkspacePathLookup = {
  workspaceIdsByPath: Record<string, string[]>;
  workspacePathsSorted: string[];
};

type ThreadRecord = Record<string, unknown>;
type ThreadStatusLookup = Record<string, { isProcessing?: boolean } | undefined>;

export type ResumeHydrationPlan = {
  keepLocalProcessing: boolean;
  lastMessageText: string | null;
  lastMessageTimestamp: number | null;
  mergedItems: ConversationItem[];
  processingTimestamp: number;
  resumedActiveTurnId: string | null;
  shouldHydrate: boolean;
  shouldMarkProcessing: boolean;
  threadName: string | null;
  reviewing: boolean;
};

export type ThreadPreviewUpdate = {
  threadId: string;
  text: string;
  timestamp: number;
};

export type WorkspaceThreadListState = {
  didChangeActivity: boolean;
  nextActivityByThread: Record<string, number>;
  previewUpdates: ThreadPreviewUpdate[];
  summaries: ThreadSummary[];
  uniqueThreads: ThreadRecord[];
};

export function buildWorkspacePathLookup(
  workspaces: WorkspaceInfo[],
): WorkspacePathLookup {
  const workspaceIdsByPath: Record<string, string[]> = {};
  const workspacePathsSorted: string[] = [];
  workspaces.forEach((workspace) => {
    const workspacePath = normalizeRootPath(workspace.path);
    if (!workspacePath) {
      return;
    }
    if (!workspaceIdsByPath[workspacePath]) {
      workspaceIdsByPath[workspacePath] = [];
      workspacePathsSorted.push(workspacePath);
    }
    workspaceIdsByPath[workspacePath].push(workspace.id);
  });
  workspacePathsSorted.sort((a, b) => b.length - a.length);
  return { workspaceIdsByPath, workspacePathsSorted };
}

export function resolveWorkspaceIdForThreadPath(
  path: string,
  lookup: WorkspacePathLookup,
  allowedWorkspaceIds?: Set<string>,
) {
  const normalizedPath = normalizeRootPath(path);
  if (!normalizedPath) {
    return null;
  }
  const matchedWorkspacePath = lookup.workspacePathsSorted.find((workspacePath) =>
    isWithinWorkspaceRoot(normalizedPath, workspacePath),
  );
  if (!matchedWorkspacePath) {
    return null;
  }
  const workspaceIds = lookup.workspaceIdsByPath[matchedWorkspacePath] ?? [];
  if (!allowedWorkspaceIds) {
    return workspaceIds[0] ?? null;
  }
  return (
    workspaceIds.find((workspaceId) => allowedWorkspaceIds.has(workspaceId)) ??
    null
  );
}

export function getThreadListNextCursor(result: Record<string, unknown>) {
  if (typeof result.nextCursor === "string") {
    return result.nextCursor;
  }
  if (typeof result.next_cursor === "string") {
    return result.next_cursor;
  }
  return null;
}

export function buildResumeHydrationPlan({
  getCustomName,
  localActiveTurnId,
  localItems,
  localStatus,
  replaceLocal,
  thread,
  threadId,
  workspaceId,
}: {
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  localActiveTurnId: string | null;
  localItems: ConversationItem[];
  localStatus: { isProcessing?: boolean } | undefined;
  replaceLocal: boolean;
  thread: ThreadRecord;
  threadId: string;
  workspaceId: string;
}): ResumeHydrationPlan {
  const items = buildItemsFromThread(thread);
  if (localItems.length > 0 && !replaceLocal) {
    return {
      keepLocalProcessing: false,
      lastMessageText: null,
      lastMessageTimestamp: null,
      mergedItems: localItems,
      processingTimestamp: Date.now(),
      resumedActiveTurnId: null,
      shouldHydrate: false,
      shouldMarkProcessing: false,
      threadName: null,
      reviewing: false,
    };
  }

  const resumedTurnState = getResumedTurnState(thread);
  const keepLocalProcessing =
    (localStatus?.isProcessing ?? false) &&
    !resumedTurnState.activeTurnId &&
    !resumedTurnState.confidentNoActiveTurn;
  const resumedActiveTurnId = keepLocalProcessing
    ? localActiveTurnId
    : resumedTurnState.activeTurnId;
  const shouldMarkProcessing = keepLocalProcessing || Boolean(resumedActiveTurnId);
  const processingTimestamp = resumedTurnState.activeTurnStartedAtMs ?? Date.now();
  const localItemIds =
    items.length > 0 && localItems.length > 0
      ? new Set(localItems.map((local) => local.id))
      : null;
  const hasOverlap =
    localItemIds !== null && items.some((item) => localItemIds.has(item.id));
  const mergedItems =
    items.length > 0
      ? replaceLocal
        ? items
        : localItems.length > 0 && !hasOverlap
          ? localItems
          : mergeThreadItems(items, localItems)
      : localItems;
  const preview = asString(thread.preview ?? "");
  const customName = getCustomName(workspaceId, threadId);
  const threadName =
    !customName && preview ? previewThreadName(preview, "New Agent") : null;
  const lastAgentMessage = [...mergedItems]
    .reverse()
    .find(
      (item) => item.kind === "message" && item.role === "assistant",
    ) as ConversationItem | undefined;
  const lastMessageText =
    lastAgentMessage && lastAgentMessage.kind === "message"
      ? lastAgentMessage.text
      : preview;

  return {
    keepLocalProcessing,
    lastMessageText: lastMessageText || null,
    lastMessageTimestamp: lastMessageText ? getThreadTimestamp(thread) : null,
    mergedItems,
    processingTimestamp,
    resumedActiveTurnId,
    reviewing: isReviewingFromThread(thread),
    shouldHydrate: true,
    shouldMarkProcessing,
    threadName,
  };
}

export function buildWorkspaceThreadListState({
  activeThreadId,
  activityByThread,
  buildThreadSummary,
  existingThreadIds,
  matchingThreads,
  requestedSortKey,
  threadListTargetCount,
  threadParentById,
  threadStatusById,
  workspaceId,
}: {
  activeThreadId: string | null | undefined;
  activityByThread: Record<string, number>;
  buildThreadSummary: (
    workspaceId: string,
    thread: ThreadRecord,
    fallbackIndex: number,
  ) => ThreadSummary | null;
  existingThreadIds: string[];
  matchingThreads: ThreadRecord[];
  requestedSortKey: ThreadListSortKey;
  threadListTargetCount: number;
  threadParentById: Record<string, string | undefined>;
  threadStatusById: ThreadStatusLookup;
  workspaceId: string;
}): WorkspaceThreadListState {
  const uniqueById = new Map<string, ThreadRecord>();
  matchingThreads.forEach((thread) => {
    const id = String(thread.id ?? "");
    if (id && !uniqueById.has(id)) {
      uniqueById.set(id, thread);
    }
  });

  const uniqueThreads = Array.from(uniqueById.values());
  const nextActivityByThread = { ...activityByThread };
  let didChangeActivity = false;
  uniqueThreads.forEach((thread) => {
    const threadId = String(thread.id ?? "");
    if (!threadId) {
      return;
    }
    const timestamp = getThreadTimestamp(thread);
    if (timestamp > (nextActivityByThread[threadId] ?? 0)) {
      nextActivityByThread[threadId] = timestamp;
      didChangeActivity = true;
    }
  });

  if (requestedSortKey === "updated_at") {
    uniqueThreads.sort((a, b) => {
      const aId = String(a.id ?? "");
      const bId = String(b.id ?? "");
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
      const aId = String(a.id ?? "");
      const bId = String(b.id ?? "");
      return aId.localeCompare(bId);
    });
  }

  const summaryById = new Map<string, ThreadSummary>();
  uniqueThreads.forEach((thread, index) => {
    const summary = buildThreadSummary(workspaceId, thread, index);
    if (!summary) {
      return;
    }
    summaryById.set(summary.id, summary);
  });

  const summaries = uniqueThreads
    .slice(0, threadListTargetCount)
    .map((thread) => summaryById.get(String(thread.id ?? "")) ?? null)
    .filter((entry): entry is ThreadSummary => Boolean(entry));
  const includedIds = new Set(summaries.map((thread) => thread.id));
  const appendFreshAnchor = (threadId: string | null | undefined) => {
    if (!threadId || includedIds.has(threadId)) {
      return;
    }
    const summary = summaryById.get(threadId);
    if (!summary) {
      return;
    }
    summaries.push(summary);
    includedIds.add(threadId);
  };

  appendFreshAnchor(activeThreadId);

  const workspaceThreadIds = new Set<string>([
    ...Array.from(summaryById.keys()),
    ...existingThreadIds,
  ]);
  if (activeThreadId) {
    workspaceThreadIds.add(activeThreadId);
  }
  workspaceThreadIds.forEach((threadId) => {
    if (threadStatusById[threadId]?.isProcessing) {
      appendFreshAnchor(threadId);
    }
  });

  const seedThreadIds = [...includedIds];
  seedThreadIds.forEach((threadId) => {
    const visited = new Set<string>([threadId]);
    let parentId = threadParentById[threadId];
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      appendFreshAnchor(parentId);
      parentId = threadParentById[parentId];
    }
  });

  const previewUpdates = uniqueThreads
    .map((thread) => {
      const threadId = String(thread.id ?? "");
      const text = asString(thread.preview ?? "").trim();
      if (!threadId || !text) {
        return null;
      }
      return {
        threadId,
        text,
        timestamp: getThreadTimestamp(thread),
      };
    })
    .filter((entry): entry is ThreadPreviewUpdate => Boolean(entry));

  return {
    didChangeActivity,
    nextActivityByThread,
    previewUpdates,
    summaries,
    uniqueThreads,
  };
}
