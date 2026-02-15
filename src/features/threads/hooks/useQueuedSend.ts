import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QueueHealthEntry, QueuedMessage, WorkspaceInfo } from "../../../types";

const QUEUED_MESSAGES_STORAGE_KEY = "codexmonitor.queuedMessagesByThread";
const PROCESSING_STALE_MS = 90_000;
const TURN_START_STALE_MS = 30_000;
const MAX_AUTO_RETRY_PER_THREAD = 1;

type ThreadStatusSnapshot = {
  isProcessing: boolean;
  isReviewing: boolean;
  processingStartedAt: number | null;
  lastDurationMs: number | null;
};

type ThreadWorkspaceResolution = {
  workspace: WorkspaceInfo | null;
  workspaceId: string | null;
  resolved: boolean;
};

function isQueuedMessage(entry: unknown): entry is QueuedMessage {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  const candidate = entry as QueuedMessage;
  if (
    typeof candidate.id !== "string"
    || typeof candidate.text !== "string"
    || typeof candidate.createdAt !== "number"
  ) {
    return false;
  }
  if (
    candidate.workspaceId !== undefined
    && typeof candidate.workspaceId !== "string"
  ) {
    return false;
  }
  if (candidate.model !== undefined && candidate.model !== null && typeof candidate.model !== "string") {
    return false;
  }
  if (candidate.effort !== undefined && candidate.effort !== null && typeof candidate.effort !== "string") {
    return false;
  }
  if (
    candidate.collaborationMode !== undefined
    && candidate.collaborationMode !== null
    && typeof candidate.collaborationMode !== "object"
  ) {
    return false;
  }
  if (candidate.images === undefined) {
    return true;
  }
  return Array.isArray(candidate.images) && candidate.images.every((image) => typeof image === "string");
}

function sanitizeQueuedByThread(
  value: unknown,
): Record<string, QueuedMessage[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const result: Record<string, QueuedMessage[]> = {};
  const candidates = Object.entries(value as Record<string, unknown>);

  for (const [threadId, entries] of candidates) {
    if (!Array.isArray(entries)) {
      continue;
    }
    const queue = entries.filter(isQueuedMessage);
    if (queue.length > 0) {
      result[threadId] = queue;
    }
  }

  return result;
}

function loadQueuedMessagesByThread(): Record<string, QueuedMessage[]> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(QUEUED_MESSAGES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeQueuedByThread(parsed);
  } catch {
    return {};
  }
}

function persistQueuedMessagesByThread(
  queuedByThread: Record<string, QueuedMessage[]>,
): void {
  if (typeof window === "undefined") {
    return;
  }
  const sanitized = sanitizeQueuedByThread(queuedByThread);

  try {
    if (Object.keys(sanitized).length === 0) {
      window.localStorage.removeItem(QUEUED_MESSAGES_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      QUEUED_MESSAGES_STORAGE_KEY,
      JSON.stringify(sanitized),
    );
  } catch {
    // Best-effort persistence.
  }
}

type UseQueuedSendOptions = {
  activeThreadId: string | null;
  activeTurnId: string | null;
  isProcessing: boolean;
  isReviewing: boolean;
  threadStatusById?: Record<
    string,
    {
      isProcessing?: boolean;
      isReviewing?: boolean;
      processingStartedAt?: number | null;
      lastDurationMs?: number | null;
    }
  >;
  threadWorkspaceById?: Record<string, string>;
  workspacesById?: Map<string, WorkspaceInfo>;
  steerEnabled: boolean;
  appsEnabled: boolean;
  activeModel?: string | null;
  activeEffort?: string | null;
  activeCollaborationMode?: Record<string, unknown> | null;
  activeWorkspace: WorkspaceInfo | null;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { activate?: boolean },
  ) => Promise<string | null>;
  sendUserMessage: (
    text: string,
    images?: string[],
    options?: {
      forceSteer?: boolean;
      model?: string | null;
      effort?: string | null;
      collaborationMode?: Record<string, unknown> | null;
    },
  ) => Promise<void>;
  sendUserMessageToThread: (
    workspace: WorkspaceInfo,
    threadId: string,
    text: string,
    images?: string[],
    options?: {
      model?: string | null;
      effort?: string | null;
      collaborationMode?: Record<string, unknown> | null;
    },
  ) => Promise<void>;
  startFork: (text: string) => Promise<void>;
  startReview: (text: string) => Promise<void>;
  startResume: (text: string) => Promise<void>;
  startCompact: (text: string) => Promise<void>;
  startApps: (text: string) => Promise<void>;
  startMcp: (text: string) => Promise<void>;
  startStatus: (text: string) => Promise<void>;
  clearActiveImages: () => void;
  onRecoverStaleThread?: (threadId: string) => void;
};

type QueueMigrationResult = {
  migratedMessages: number;
  migratedThreads: number;
};

type UseQueuedSendResult = {
  queuedByThread: Record<string, QueuedMessage[]>;
  activeQueue: QueuedMessage[];
  legacyQueueMessageCount: number;
  queueHealthEntries: QueueHealthEntry[];
  handleSend: (text: string, images?: string[]) => Promise<void>;
  queueMessage: (text: string, images?: string[]) => Promise<void>;
  queueMessageForThread: (
    threadId: string,
    text: string,
    images?: string[],
  ) => Promise<void>;
  removeQueuedMessage: (threadId: string, messageId: string) => void;
  steerQueuedMessage: (threadId: string, messageId: string) => Promise<boolean>;
  retryThreadQueue: (threadId: string) => void;
  clearThreadQueue: (threadId: string) => void;
  migrateLegacyQueueWorkspaceIds: () => QueueMigrationResult;
};

type SlashCommandKind =
  | "apps"
  | "compact"
  | "fork"
  | "mcp"
  | "new"
  | "resume"
  | "review"
  | "status";

function parseSlashCommand(text: string, appsEnabled: boolean): SlashCommandKind | null {
  if (appsEnabled && /^\/apps\b/i.test(text)) {
    return "apps";
  }
  if (/^\/fork\b/i.test(text)) {
    return "fork";
  }
  if (/^\/mcp\b/i.test(text)) {
    return "mcp";
  }
  if (/^\/review\b/i.test(text)) {
    return "review";
  }
  if (/^\/compact\b/i.test(text)) {
    return "compact";
  }
  if (/^\/new\b/i.test(text)) {
    return "new";
  }
  if (/^\/resume\b/i.test(text)) {
    return "resume";
  }
  if (/^\/status\b/i.test(text)) {
    return "status";
  }
  return null;
}

export function useQueuedSend({
  activeThreadId,
  activeTurnId,
  isProcessing,
  isReviewing,
  threadStatusById,
  threadWorkspaceById,
  workspacesById,
  steerEnabled,
  appsEnabled,
  activeModel = null,
  activeEffort = null,
  activeCollaborationMode = null,
  activeWorkspace,
  connectWorkspace,
  startThreadForWorkspace,
  sendUserMessage,
  sendUserMessageToThread,
  startFork,
  startReview,
  startResume,
  startCompact,
  startApps,
  startMcp,
  startStatus,
  clearActiveImages,
  onRecoverStaleThread,
}: UseQueuedSendOptions): UseQueuedSendResult {
  const [queuedByThread, setQueuedByThread] = useState<
    Record<string, QueuedMessage[]>
  >(() => loadQueuedMessagesByThread());
  const [inFlightByThread, setInFlightByThread] = useState<
    Record<string, QueuedMessage | null>
  >({});
  const [inFlightSinceByThread, setInFlightSinceByThread] = useState<
    Record<string, number | null>
  >({});
  const [hasStartedByThread, setHasStartedByThread] = useState<
    Record<string, boolean>
  >({});
  const [lastFailureByThread, setLastFailureByThread] = useState<
    Record<string, string | null>
  >({});
  const [lastFailureAtByThread, setLastFailureAtByThread] = useState<
    Record<string, number | null>
  >({});
  const [failureCountByThread, setFailureCountByThread] = useState<
    Record<string, number>
  >({});
  const lastWorkspaceIdByThreadRef = useRef<Record<string, string>>({});

  const activeQueue = useMemo(
    () => (activeThreadId ? queuedByThread[activeThreadId] ?? [] : []),
    [activeThreadId, queuedByThread],
  );

  const legacyQueueMessageCount = useMemo(
    () =>
      Object.values(queuedByThread).reduce((count, queue) => {
        return (
          count
          + queue.reduce(
            (acc, item) => acc + (item.workspaceId ? 0 : 1),
            0,
          )
        );
      }, 0),
    [queuedByThread],
  );

  const getThreadStatus = useCallback(
    (threadId: string): ThreadStatusSnapshot => {
      const status = threadStatusById?.[threadId];
      if (threadId === activeThreadId) {
        return {
          isProcessing: isProcessing || Boolean(activeTurnId),
          isReviewing,
          processingStartedAt: status?.processingStartedAt ?? null,
          lastDurationMs: status?.lastDurationMs ?? null,
        };
      }
      return {
        isProcessing: Boolean(status?.isProcessing),
        isReviewing: Boolean(status?.isReviewing),
        processingStartedAt: status?.processingStartedAt ?? null,
        lastDurationMs: status?.lastDurationMs ?? null,
      };
    },
    [activeThreadId, activeTurnId, isProcessing, isReviewing, threadStatusById],
  );

  const resolveWorkspaceForThread = useCallback(
    (threadId: string): ThreadWorkspaceResolution => {
      if (threadId === activeThreadId) {
        return {
          workspace: activeWorkspace,
          workspaceId: activeWorkspace?.id ?? null,
          resolved: Boolean(activeWorkspace),
        };
      }

      const mappedWorkspaceId =
        threadWorkspaceById?.[threadId]
        ?? lastWorkspaceIdByThreadRef.current[threadId];
      const queuedWorkspaceId = (queuedByThread[threadId] ?? []).find(
        (entry) => typeof entry.workspaceId === "string" && entry.workspaceId.length > 0,
      )?.workspaceId;
      const workspaceId = mappedWorkspaceId ?? queuedWorkspaceId ?? null;

      if (!workspaceId) {
        return {
          workspace: null,
          workspaceId: null,
          resolved: false,
        };
      }

      const workspace = workspacesById?.get(workspaceId) ?? null;
      return {
        workspace,
        workspaceId,
        resolved: Boolean(workspace),
      };
    },
    [activeThreadId, activeWorkspace, queuedByThread, threadWorkspaceById, workspacesById],
  );

  const globallyBlockedThreadIds = useMemo(() => {
    const now = Date.now();
    const threadIds = new Set<string>([
      ...Object.keys(queuedByThread),
      ...Object.keys(inFlightByThread),
      ...Object.keys(threadStatusById ?? {}),
      ...(activeThreadId ? [activeThreadId] : []),
    ]);

    const blockedThreadIds = new Set<string>();

    threadIds.forEach((threadId) => {
      const status = getThreadStatus(threadId);
      if (status.isReviewing) {
        blockedThreadIds.add(threadId);
        return;
      }

      if (status.isProcessing) {
        const startedAt = status.processingStartedAt;
        const processingAge = startedAt ? Math.max(0, now - startedAt) : 0;
        const isProcessingStale = Boolean(startedAt && processingAge >= PROCESSING_STALE_MS);
        if (!isProcessingStale) {
          blockedThreadIds.add(threadId);
          return;
        }
      }

      const inFlightItem = inFlightByThread[threadId];
      if (!inFlightItem) {
        return;
      }

      const inFlightSince = inFlightSinceByThread[threadId] ?? inFlightItem.createdAt;
      const pendingMs = Math.max(0, now - inFlightSince);
      const isAwaitingTurnStart = !hasStartedByThread[threadId];
      const isAwaitingTurnStartStale = isAwaitingTurnStart && pendingMs >= TURN_START_STALE_MS;

      if (!isAwaitingTurnStartStale) {
        blockedThreadIds.add(threadId);
      }
    });

    return blockedThreadIds;
  }, [
    activeThreadId,
    getThreadStatus,
    hasStartedByThread,
    inFlightByThread,
    inFlightSinceByThread,
    queuedByThread,
    threadStatusById,
  ]);

  const queueHealthEntries = useMemo<QueueHealthEntry[]>(() => {
    const now = Date.now();
    const threadIds = new Set<string>([
      ...Object.keys(queuedByThread),
      ...Object.keys(inFlightByThread),
      ...Object.keys(lastFailureByThread),
      ...Object.keys(lastFailureAtByThread),
      ...Object.keys(threadStatusById ?? {}),
    ]);

    const entries: QueueHealthEntry[] = [];

    threadIds.forEach((threadId) => {
      const queue = queuedByThread[threadId] ?? [];
      const queueLength = queue.length;
      const inFlight = Boolean(inFlightByThread[threadId]);
      const lastFailureReason = lastFailureByThread[threadId] ?? null;
      const lastFailureAt = lastFailureAtByThread[threadId] ?? null;
      const status = getThreadStatus(threadId);
      const hasQueueArtifacts =
        queueLength > 0 || inFlight || Boolean(lastFailureReason) || Boolean(lastFailureAt);
      const isStatusOnlyEntry = !hasQueueArtifacts;
      const isProcessingStatusOnlyStale =
        isStatusOnlyEntry
        && status.isProcessing
        && Boolean(status.processingStartedAt)
        && now - (status.processingStartedAt ?? 0) >= PROCESSING_STALE_MS;

      if (isStatusOnlyEntry && threadId !== activeThreadId) {
        return;
      }

      if (isProcessingStatusOnlyStale && threadId !== activeThreadId) {
        return;
      }

      if (isStatusOnlyEntry && !status.isProcessing && !status.isReviewing) {
        return;
      }

      const head = queue[0];
      const command = head ? parseSlashCommand(head.text.trim(), appsEnabled) : null;
      const workspaceResolution = resolveWorkspaceForThread(threadId);

      let blockedReason: QueueHealthEntry["blockedReason"] = null;
      if (status.isReviewing) {
        blockedReason = "reviewing";
      } else if (status.isProcessing) {
        blockedReason = "processing";
      } else if (inFlight && !hasStartedByThread[threadId]) {
        blockedReason = "awaiting_turn_start_event";
      } else if (queueLength > 0 && !workspaceResolution.resolved) {
        blockedReason = "workspace_unresolved";
      } else if (queueLength > 0 && command && threadId !== activeThreadId) {
        blockedReason = "command_requires_active_thread";
      }

      const blockedByOtherThread =
        threadId !== activeThreadId
        &&
        globallyBlockedThreadIds.size > 0
        && !(globallyBlockedThreadIds.size === 1 && globallyBlockedThreadIds.has(threadId));

      if (!blockedReason && queueLength > 0 && blockedByOtherThread) {
        blockedReason = "global_processing";
      }

      let blockedForMs: number | null = null;
      if (blockedReason === "processing" && status.processingStartedAt) {
        blockedForMs = Math.max(0, now - status.processingStartedAt);
      } else if (blockedReason === "awaiting_turn_start_event") {
        const inFlightSince = inFlightSinceByThread[threadId] ?? inFlightByThread[threadId]?.createdAt ?? null;
        blockedForMs = inFlightSince ? Math.max(0, now - inFlightSince) : null;
      }

      const isStale =
        (blockedReason === "processing" && blockedForMs !== null && blockedForMs >= PROCESSING_STALE_MS)
        || (blockedReason === "awaiting_turn_start_event" && blockedForMs !== null && blockedForMs >= TURN_START_STALE_MS);

      const lastStatusUpdatedAt = blockedReason === "processing"
        ? status.processingStartedAt
        : blockedReason === "awaiting_turn_start_event"
          ? inFlightSinceByThread[threadId] ?? null
          : queue[0]?.createdAt ?? null;

      entries.push({
        threadId,
        queueLength,
        inFlight,
        blockedReason,
        lastFailureReason,
        isStale,
        blockedForMs,
        lastStatusUpdatedAt,
        lastFailureAt,
        workspaceId: workspaceResolution.workspaceId,
        workspaceResolved: workspaceResolution.resolved,
      });
    });

    entries.sort((left, right) => {
      if (left.threadId === activeThreadId) {
        return -1;
      }
      if (right.threadId === activeThreadId) {
        return 1;
      }
      if (left.isStale !== right.isStale) {
        return left.isStale ? -1 : 1;
      }
      const leftScore = left.queueLength + (left.inFlight ? 1 : 0);
      const rightScore = right.queueLength + (right.inFlight ? 1 : 0);
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }
      return left.threadId.localeCompare(right.threadId);
    });

    return entries;
  }, [
    activeThreadId,
    appsEnabled,
    getThreadStatus,
    globallyBlockedThreadIds,
    hasStartedByThread,
    inFlightByThread,
    inFlightSinceByThread,
    lastFailureAtByThread,
    lastFailureByThread,
    queuedByThread,
    resolveWorkspaceForThread,
    threadStatusById,
  ]);

  useEffect(() => {
    persistQueuedMessagesByThread(queuedByThread);
  }, [queuedByThread]);

  useEffect(() => {
    if (!threadWorkspaceById) {
      return;
    }
    lastWorkspaceIdByThreadRef.current = {
      ...lastWorkspaceIdByThreadRef.current,
      ...threadWorkspaceById,
    };
  }, [threadWorkspaceById]);

  const enqueueMessage = useCallback((threadId: string, item: QueuedMessage) => {
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: [...(prev[threadId] ?? []), item],
    }));
  }, []);

  const migrateLegacyQueueWorkspaceIds = useCallback((): QueueMigrationResult => {
    if (Object.keys(queuedByThread).length === 0) {
      return { migratedMessages: 0, migratedThreads: 0 };
    }

    let migratedMessages = 0;
    let migratedThreads = 0;
    let changed = false;

    const nextByThread = Object.entries(queuedByThread).reduce<
      Record<string, QueuedMessage[]>
    >((next, [threadId, queue]) => {
      if (queue.length === 0) {
        next[threadId] = queue;
        return next;
      }

      const mappedWorkspaceId =
        threadWorkspaceById?.[threadId]
        ?? lastWorkspaceIdByThreadRef.current[threadId]
        ?? (threadId === activeThreadId ? activeWorkspace?.id : undefined)
        ?? queue.find((item) => Boolean(item.workspaceId))?.workspaceId;

      if (mappedWorkspaceId) {
        lastWorkspaceIdByThreadRef.current[threadId] = mappedWorkspaceId;
      }

      let threadChanged = false;
      next[threadId] = queue.map((item) => {
        if (item.workspaceId || !mappedWorkspaceId) {
          return item;
        }
        migratedMessages += 1;
        threadChanged = true;
        changed = true;
        return {
          ...item,
          workspaceId: mappedWorkspaceId,
        };
      });

      if (threadChanged) {
        migratedThreads += 1;
      }

      return next;
    }, {});

    if (changed) {
      setQueuedByThread(nextByThread);
    }

    return { migratedMessages, migratedThreads };
  }, [activeThreadId, activeWorkspace, queuedByThread, threadWorkspaceById]);

  const removeQueuedMessage = useCallback(
    (threadId: string, messageId: string) => {
      setQueuedByThread((prev) => ({
        ...prev,
        [threadId]: (prev[threadId] ?? []).filter(
          (entry) => entry.id !== messageId,
        ),
      }));
    },
    [],
  );

  useEffect(() => {
    if (legacyQueueMessageCount === 0) {
      return;
    }
    migrateLegacyQueueWorkspaceIds();
  }, [legacyQueueMessageCount, migrateLegacyQueueWorkspaceIds]);

  const prependQueuedMessage = useCallback((threadId: string, item: QueuedMessage) => {
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: [item, ...(prev[threadId] ?? [])],
    }));
  }, []);

  const retryThreadQueue = useCallback(
    (threadId: string) => {
      const inFlight = inFlightByThread[threadId];
      if (inFlight) {
        setQueuedByThread((prev) => {
          const existing = prev[threadId] ?? [];
          if (existing.some((entry) => entry.id === inFlight.id)) {
            return prev;
          }
          return {
            ...prev,
            [threadId]: [inFlight, ...existing],
          };
        });
      }
      setInFlightByThread((prev) => ({ ...prev, [threadId]: null }));
      setInFlightSinceByThread((prev) => ({ ...prev, [threadId]: null }));
      setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
      setLastFailureByThread((prev) => ({ ...prev, [threadId]: null }));
      setLastFailureAtByThread((prev) => ({ ...prev, [threadId]: null }));
      setFailureCountByThread((prev) => ({ ...prev, [threadId]: 0 }));
      onRecoverStaleThread?.(threadId);
    },
    [inFlightByThread, onRecoverStaleThread],
  );

  const clearThreadQueue = useCallback((threadId: string) => {
    setQueuedByThread((prev) => {
      const { [threadId]: _removed, ...rest } = prev;
      return rest;
    });
    setInFlightByThread((prev) => ({ ...prev, [threadId]: null }));
    setInFlightSinceByThread((prev) => ({ ...prev, [threadId]: null }));
    setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
    setLastFailureByThread((prev) => ({ ...prev, [threadId]: null }));
    setLastFailureAtByThread((prev) => ({ ...prev, [threadId]: null }));
    setFailureCountByThread((prev) => ({ ...prev, [threadId]: 0 }));
    onRecoverStaleThread?.(threadId);
  }, [onRecoverStaleThread]);

  const runSlashCommand = useCallback(
    async (command: SlashCommandKind, trimmed: string) => {
      if (command === "fork") {
        await startFork(trimmed);
        return;
      }
      if (command === "review") {
        await startReview(trimmed);
        return;
      }
      if (command === "resume") {
        await startResume(trimmed);
        return;
      }
      if (command === "compact") {
        await startCompact(trimmed);
        return;
      }
      if (command === "apps") {
        await startApps(trimmed);
        return;
      }
      if (command === "mcp") {
        await startMcp(trimmed);
        return;
      }
      if (command === "status") {
        await startStatus(trimmed);
        return;
      }
      if (command === "new" && activeWorkspace) {
        const threadId = await startThreadForWorkspace(activeWorkspace.id);
        const rest = trimmed.replace(/^\/new\b/i, "").trim();
        if (threadId && rest) {
          const nextModel = activeModel;
          const nextEffort = activeEffort;
          const nextCollaborationMode = activeCollaborationMode;
          const nextOptions =
            nextModel !== null ||
            nextEffort !== null ||
            nextCollaborationMode !== null
              ? {
                  model: nextModel,
                  effort: nextEffort,
                  collaborationMode: nextCollaborationMode,
                }
              : undefined;
          if (nextOptions) {
            await sendUserMessageToThread(activeWorkspace, threadId, rest, [], nextOptions);
          } else {
            await sendUserMessageToThread(activeWorkspace, threadId, rest, []);
          }
        }
      }
    },
    [
      activeWorkspace,
      sendUserMessageToThread,
      startFork,
      startReview,
      startResume,
      startCompact,
      startApps,
      startMcp,
      startStatus,
      startThreadForWorkspace,
      activeModel,
      activeEffort,
      activeCollaborationMode,
    ],
  );

  const handleSend = useCallback(
    async (text: string, images: string[] = []) => {
      const trimmed = text.trim();
      const command = parseSlashCommand(trimmed, appsEnabled);
      const nextImages = command ? [] : images;
      if (!trimmed && nextImages.length === 0) {
        return;
      }
      if (activeThreadId && isReviewing) {
        return;
      }
      const isBusy = isProcessing || Boolean(activeTurnId);
      if (isBusy && activeThreadId) {
        const item: QueuedMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: trimmed,
          createdAt: Date.now(),
          images: nextImages,
          workspaceId: activeWorkspace?.id,
          model: activeModel,
          effort: activeEffort,
          collaborationMode: activeCollaborationMode,
        };
        enqueueMessage(activeThreadId, item);
        clearActiveImages();
        return;
      }
      if (activeWorkspace && !activeWorkspace.connected) {
        await connectWorkspace(activeWorkspace);
      }
      if (command) {
        await runSlashCommand(command, trimmed);
        clearActiveImages();
        return;
      }
      const nextModel = activeModel;
      const nextEffort = activeEffort;
      const nextCollaborationMode = activeCollaborationMode;
      const nextOptions =
        nextModel !== null ||
        nextEffort !== null ||
        nextCollaborationMode !== null
          ? {
              model: nextModel,
              effort: nextEffort,
              collaborationMode: nextCollaborationMode,
            }
          : undefined;
      if (nextOptions) {
        await sendUserMessage(trimmed, nextImages, nextOptions);
      } else {
        await sendUserMessage(trimmed, nextImages);
      }
      clearActiveImages();
    },
    [
      activeThreadId,
      appsEnabled,
      activeWorkspace,
      clearActiveImages,
      connectWorkspace,
      enqueueMessage,
      isProcessing,
      isReviewing,
      activeModel,
      activeEffort,
      activeCollaborationMode,
      runSlashCommand,
      sendUserMessage,
      activeTurnId,
    ],
  );

  const queueMessageForThread = useCallback(
    async (threadId: string, text: string, images: string[] = []) => {
      const trimmed = text.trim();
      const command = parseSlashCommand(trimmed, appsEnabled);
      const nextImages = command ? [] : images;
      if (!trimmed && nextImages.length === 0) {
        return;
      }
      if (!threadId) {
        return;
      }
      const status = getThreadStatus(threadId);
      if (status.isReviewing) {
        return;
      }
      const workspaceResolution = resolveWorkspaceForThread(threadId);
      if (threadId !== activeThreadId && !workspaceResolution.resolved) {
        return;
      }
      const item: QueuedMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmed,
        createdAt: Date.now(),
        images: nextImages,
        workspaceId:
          workspaceResolution.workspaceId
          ?? (threadId === activeThreadId ? activeWorkspace?.id : undefined),
        model: activeModel,
        effort: activeEffort,
        collaborationMode: activeCollaborationMode,
      };
      enqueueMessage(threadId, item);
      if (threadId === activeThreadId) {
        clearActiveImages();
      }
    },
    [
      activeThreadId,
      activeWorkspace,
      appsEnabled,
      clearActiveImages,
      enqueueMessage,
      activeModel,
      activeEffort,
      activeCollaborationMode,
      getThreadStatus,
      resolveWorkspaceForThread,
    ],
  );

  const queueMessage = useCallback(
    async (text: string, images: string[] = []) => {
      if (!activeThreadId) {
        return;
      }
      await queueMessageForThread(activeThreadId, text, images);
    },
    [activeThreadId, queueMessageForThread],
  );

  const steerQueuedMessage = useCallback(
    async (threadId: string, messageId: string): Promise<boolean> => {
      if (!threadId || !messageId) {
        return false;
      }
      if (!steerEnabled) {
        return false;
      }

      const canSteerNow =
        threadId === activeThreadId;
      if (!canSteerNow) {
        return false;
      }

      const queue = queuedByThread[threadId] ?? [];
      const targetItem = queue.find((item) => item.id === messageId);
      if (!targetItem) {
        return false;
      }

      if (parseSlashCommand(targetItem.text.trim(), appsEnabled)) {
        return false;
      }

      setQueuedByThread((prev) => ({
        ...prev,
        [threadId]: (prev[threadId] ?? []).filter((item) => item.id !== messageId),
      }));

      try {
        if (activeWorkspace && !activeWorkspace.connected) {
          await connectWorkspace(activeWorkspace);
        }
        const nextModel = targetItem.model ?? activeModel;
        const nextEffort = targetItem.effort ?? activeEffort;
        const nextCollaborationMode =
          targetItem.collaborationMode ?? activeCollaborationMode;
        const steerOptions = {
          forceSteer: true as const,
          ...(nextModel !== null ? { model: nextModel } : {}),
          ...(nextEffort !== null ? { effort: nextEffort } : {}),
          ...(nextCollaborationMode !== null
            ? { collaborationMode: nextCollaborationMode }
            : {}),
        };
        await sendUserMessage(targetItem.text, targetItem.images ?? [], {
          ...steerOptions,
        });
        return true;
      } catch {
        prependQueuedMessage(threadId, targetItem);
        return false;
      }
    },
    [
      activeThreadId,
      activeWorkspace,
      appsEnabled,
      connectWorkspace,
      prependQueuedMessage,
      queuedByThread,
      sendUserMessage,
      steerEnabled,
      activeModel,
      activeEffort,
      activeCollaborationMode,
    ],
  );

  useEffect(() => {
    const inFlightEntries = Object.entries(inFlightByThread).filter(([, item]) =>
      Boolean(item),
    ) as Array<[string, QueuedMessage]>;
    if (inFlightEntries.length === 0) {
      return;
    }

    const now = Date.now();
    const startedUpdates: Record<string, boolean> = {};
    const clearThreadIds: string[] = [];
    const staleRecoverThreadIds: string[] = [];
    const requeueItems: Array<[string, QueuedMessage]> = [];

    for (const [threadId, item] of inFlightEntries) {
      const status = getThreadStatus(threadId);
      if (status.isProcessing) {
        const startedAt = status.processingStartedAt;
        const processingAge = startedAt ? Math.max(0, now - startedAt) : 0;
        const isProcessingStale = Boolean(startedAt && processingAge >= PROCESSING_STALE_MS);
        if (isProcessingStale && threadId !== activeThreadId) {
          clearThreadIds.push(threadId);
          staleRecoverThreadIds.push(threadId);
          continue;
        }
      }

      if (status.isProcessing || status.isReviewing) {
        if (!hasStartedByThread[threadId]) {
          startedUpdates[threadId] = true;
        }
        continue;
      }

      if (hasStartedByThread[threadId]) {
        clearThreadIds.push(threadId);
        continue;
      }

      const inFlightSince = inFlightSinceByThread[threadId] ?? item.createdAt;
      const pendingMs = Math.max(0, now - inFlightSince);
      if (pendingMs >= TURN_START_STALE_MS) {
        clearThreadIds.push(threadId);
        staleRecoverThreadIds.push(threadId);
        requeueItems.push([threadId, item]);
      }
    }

    if (Object.keys(startedUpdates).length > 0) {
      setHasStartedByThread((prev) => ({
        ...prev,
        ...startedUpdates,
      }));
    }

    if (clearThreadIds.length > 0) {
      setInFlightByThread((prev) => {
        const next = { ...prev };
        clearThreadIds.forEach((threadId) => {
          next[threadId] = null;
        });
        return next;
      });
      setInFlightSinceByThread((prev) => {
        const next = { ...prev };
        clearThreadIds.forEach((threadId) => {
          next[threadId] = null;
        });
        return next;
      });
      setHasStartedByThread((prev) => {
        const next = { ...prev };
        clearThreadIds.forEach((threadId) => {
          next[threadId] = false;
        });
        return next;
      });
    }

    if (requeueItems.length > 0) {
      setQueuedByThread((prev) => {
        const next = { ...prev };
        requeueItems.forEach(([threadId, item]) => {
          const existing = next[threadId] ?? [];
          if (existing.some((entry) => entry.id === item.id)) {
            return;
          }
          next[threadId] = [item, ...existing];
        });
        return next;
      });
    }

    if (staleRecoverThreadIds.length > 0) {
      const recoveredThreadIds = Array.from(new Set(staleRecoverThreadIds));
      const recoveredAt = Date.now();
      setLastFailureByThread((prev) => {
        const next = { ...prev };
        recoveredThreadIds.forEach((threadId) => {
          next[threadId] = "队列状态超时，已自动恢复流转";
        });
        return next;
      });
      setLastFailureAtByThread((prev) => {
        const next = { ...prev };
        recoveredThreadIds.forEach((threadId) => {
          next[threadId] = recoveredAt;
        });
        return next;
      });
      if (onRecoverStaleThread) {
        recoveredThreadIds.forEach((threadId) => {
          onRecoverStaleThread(threadId);
        });
      }
    }
  }, [
    activeThreadId,
    getThreadStatus,
    hasStartedByThread,
    inFlightByThread,
    inFlightSinceByThread,
    onRecoverStaleThread,
  ]);

  useEffect(() => {
    const queuedThreadIds = Object.entries(queuedByThread)
      .filter(([, queue]) => queue.length > 0)
      .map(([threadId]) => threadId);
    if (queuedThreadIds.length === 0) {
      return;
    }

    const hasGlobalBusyBlock =
      globallyBlockedThreadIds.size > 0
      && queuedThreadIds.some(
        (threadId) => !(globallyBlockedThreadIds.size === 1 && globallyBlockedThreadIds.has(threadId)),
      );

    const orderedThreadIds =
      activeThreadId && queuedThreadIds.includes(activeThreadId)
        ? [activeThreadId, ...queuedThreadIds.filter((threadId) => threadId !== activeThreadId)]
        : queuedThreadIds;

    const dispatchableThread = orderedThreadIds.find((candidateThreadId) => {
      if (inFlightByThread[candidateThreadId]) {
        return false;
      }

      const status = getThreadStatus(candidateThreadId);
      if (status.isReviewing) {
        return false;
      }

      if (status.isProcessing) {
        if (candidateThreadId === activeThreadId) {
          return false;
        }
        const startedAt = status.processingStartedAt;
        const processingAge = startedAt ? Date.now() - startedAt : 0;
        const isProcessingStale = Boolean(startedAt && processingAge >= PROCESSING_STALE_MS);
        if (!isProcessingStale) {
          return false;
        }
      }

      const workspaceResolution = resolveWorkspaceForThread(candidateThreadId);
      if (!workspaceResolution.resolved || !workspaceResolution.workspace) {
        return false;
      }

      const queue = queuedByThread[candidateThreadId] ?? [];
      if (queue.length === 0) {
        return false;
      }

      if (
        hasGlobalBusyBlock
        && candidateThreadId !== activeThreadId
      ) {
        return false;
      }

      const autoRetryCount = failureCountByThread[candidateThreadId] ?? 0;
      if (autoRetryCount > MAX_AUTO_RETRY_PER_THREAD) {
        return false;
      }

      const head = queue[0];
      if (!head) {
        return false;
      }

      const command = parseSlashCommand(head.text.trim(), appsEnabled);
      if (command && candidateThreadId !== activeThreadId) {
        return false;
      }

      return true;
    });

    if (!dispatchableThread) {
      return;
    }

    const threadId = dispatchableThread;
    const workspaceResolution = resolveWorkspaceForThread(threadId);
    if (!workspaceResolution.workspace) {
      return;
    }
    const targetWorkspace = workspaceResolution.workspace;

    const queue = queuedByThread[threadId] ?? [];
    if (queue.length === 0) {
      return;
    }

    const nextItem = queue[0];
    const inFlightSince = Date.now();
    setInFlightByThread((prev) => ({ ...prev, [threadId]: nextItem }));
    setInFlightSinceByThread((prev) => ({ ...prev, [threadId]: inFlightSince }));
    setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] ?? []).slice(1),
    }));

    (async () => {
      try {
        if (!targetWorkspace.connected) {
          await connectWorkspace(targetWorkspace);
        }
        const trimmed = nextItem.text.trim();
        const command = parseSlashCommand(trimmed, appsEnabled);
        if (command) {
          await runSlashCommand(command, trimmed);
          if (command === "status" || command === "mcp" || command === "apps" || command === "new") {
            setHasStartedByThread((prev) => ({ ...prev, [threadId]: true }));
          }
        } else if (threadId === activeThreadId) {
          const nextModel = nextItem.model ?? activeModel;
          const nextEffort = nextItem.effort ?? activeEffort;
          const nextCollaborationMode =
            nextItem.collaborationMode ?? activeCollaborationMode;
          const nextOptions =
            nextModel !== null ||
            nextEffort !== null ||
            nextCollaborationMode !== null
              ? {
                  model: nextModel,
                  effort: nextEffort,
                  collaborationMode: nextCollaborationMode,
                }
              : undefined;
          if (nextOptions) {
            await sendUserMessage(nextItem.text, nextItem.images ?? [], nextOptions);
          } else {
            await sendUserMessage(nextItem.text, nextItem.images ?? []);
          }
        } else {
          const nextModel = nextItem.model ?? activeModel;
          const nextEffort = nextItem.effort ?? activeEffort;
          const nextCollaborationMode =
            nextItem.collaborationMode ?? activeCollaborationMode;
          const nextOptions =
            nextModel !== null ||
            nextEffort !== null ||
            nextCollaborationMode !== null
              ? {
                  model: nextModel,
                  effort: nextEffort,
                  collaborationMode: nextCollaborationMode,
                }
              : undefined;
          if (nextOptions) {
            await sendUserMessageToThread(
              targetWorkspace,
              threadId,
              nextItem.text,
              nextItem.images ?? [],
              nextOptions,
            );
          } else {
            await sendUserMessageToThread(
              targetWorkspace,
              threadId,
              nextItem.text,
              nextItem.images ?? [],
            );
          }
        }
        setLastFailureByThread((prev) => ({ ...prev, [threadId]: null }));
        setLastFailureAtByThread((prev) => ({ ...prev, [threadId]: null }));
        setFailureCountByThread((prev) => ({ ...prev, [threadId]: 0 }));
      } catch (error) {
        const failureReason =
          error instanceof Error ? error.message : String(error);
        const failureAt = Date.now();
        setLastFailureByThread((prev) => ({
          ...prev,
          [threadId]: failureReason || "Queue dispatch failed",
        }));
        setLastFailureAtByThread((prev) => ({
          ...prev,
          [threadId]: failureAt,
        }));
        setFailureCountByThread((prev) => ({
          ...prev,
          [threadId]: (prev[threadId] ?? 0) + 1,
        }));
        setInFlightByThread((prev) => ({ ...prev, [threadId]: null }));
        setInFlightSinceByThread((prev) => ({ ...prev, [threadId]: null }));
        setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
        prependQueuedMessage(threadId, nextItem);
      }
    })();
  }, [
    activeThreadId,
    appsEnabled,
    connectWorkspace,
    failureCountByThread,
    getThreadStatus,
    globallyBlockedThreadIds,
    inFlightByThread,
    prependQueuedMessage,
    queuedByThread,
    resolveWorkspaceForThread,
    runSlashCommand,
    sendUserMessage,
    sendUserMessageToThread,
    activeModel,
    activeEffort,
    activeCollaborationMode,
  ]);

  return {
    queuedByThread,
    activeQueue,
    legacyQueueMessageCount,
    queueHealthEntries,
    handleSend,
    queueMessage,
    queueMessageForThread,
    removeQueuedMessage,
    steerQueuedMessage,
    retryThreadQueue,
    clearThreadQueue,
    migrateLegacyQueueWorkspaceIds,
  };
}
