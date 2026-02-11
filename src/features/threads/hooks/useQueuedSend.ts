import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppMention, QueuedMessage, WorkspaceInfo } from "@/types";

type UseQueuedSendOptions = {
  activeThreadId: string | null;
  activeTurnId: string | null;
  isProcessing: boolean;
  isReviewing: boolean;
  steerEnabled: boolean;
  appsEnabled: boolean;
  activeWorkspace: WorkspaceInfo | null;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { activate?: boolean },
  ) => Promise<string | null>;
  sendUserMessage: (
    text: string,
    images?: string[],
    appMentions?: AppMention[],
  ) => Promise<void>;
  sendUserMessageToThread: (
    workspace: WorkspaceInfo,
    threadId: string,
    text: string,
    images?: string[],
  ) => Promise<void>;
  startFork: (text: string) => Promise<void>;
  startReview: (text: string) => Promise<void>;
  startResume: (text: string) => Promise<void>;
  startCompact: (text: string) => Promise<void>;
  startApps: (text: string) => Promise<void>;
  startMcp: (text: string) => Promise<void>;
  startStatus: (text: string) => Promise<void>;
  clearActiveImages: () => void;
};

type UseQueuedSendResult = {
  queuedByThread: Record<string, QueuedMessage[]>;
  activeQueue: QueuedMessage[];
  handleSend: (
    text: string,
    images?: string[],
    appMentions?: AppMention[],
  ) => Promise<void>;
  queueMessage: (
    text: string,
    images?: string[],
    appMentions?: AppMention[],
  ) => Promise<void>;
  removeQueuedMessage: (threadId: string, messageId: string) => void;
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
  steerEnabled,
  appsEnabled,
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
}: UseQueuedSendOptions): UseQueuedSendResult {
  const [queuedByThread, setQueuedByThread] = useState<
    Record<string, QueuedMessage[]>
  >({});
  const [inFlightByThread, setInFlightByThread] = useState<
    Record<string, QueuedMessage | null>
  >({});
  const [hasStartedByThread, setHasStartedByThread] = useState<
    Record<string, boolean>
  >({});

  const activeQueue = useMemo(
    () => (activeThreadId ? queuedByThread[activeThreadId] ?? [] : []),
    [activeThreadId, queuedByThread],
  );

  const enqueueMessage = useCallback((threadId: string, item: QueuedMessage) => {
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: [...(prev[threadId] ?? []), item],
    }));
  }, []);

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

  const prependQueuedMessage = useCallback((threadId: string, item: QueuedMessage) => {
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: [item, ...(prev[threadId] ?? [])],
    }));
  }, []);

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
          await sendUserMessageToThread(activeWorkspace, threadId, rest, []);
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
    ],
  );

  const handleSend = useCallback(
    async (
      text: string,
      images: string[] = [],
      appMentions: AppMention[] = [],
    ) => {
      const trimmed = text.trim();
      const command = parseSlashCommand(trimmed, appsEnabled);
      const nextImages = command ? [] : images;
      const nextMentions = command ? [] : appMentions;
      if (!trimmed && nextImages.length === 0) {
        return;
      }
      if (activeThreadId && isReviewing) {
        return;
      }
      if (isProcessing && activeThreadId && (!steerEnabled || !activeTurnId)) {
        const item: QueuedMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: trimmed,
          createdAt: Date.now(),
          images: nextImages,
          ...(nextMentions.length > 0 ? { appMentions: nextMentions } : {}),
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
      if (nextMentions.length > 0) {
        await sendUserMessage(trimmed, nextImages, nextMentions);
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
      activeTurnId,
      isProcessing,
      isReviewing,
      steerEnabled,
      runSlashCommand,
      sendUserMessage,
    ],
  );

  const queueMessage = useCallback(
    async (
      text: string,
      images: string[] = [],
      appMentions: AppMention[] = [],
    ) => {
      const trimmed = text.trim();
      const command = parseSlashCommand(trimmed, appsEnabled);
      const nextImages = command ? [] : images;
      const nextMentions = command ? [] : appMentions;
      if (!trimmed && nextImages.length === 0) {
        return;
      }
      if (activeThreadId && isReviewing) {
        return;
      }
      if (!activeThreadId) {
        return;
      }
      const item: QueuedMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmed,
        createdAt: Date.now(),
        images: nextImages,
        ...(nextMentions.length > 0 ? { appMentions: nextMentions } : {}),
      };
      enqueueMessage(activeThreadId, item);
      clearActiveImages();
    },
    [activeThreadId, appsEnabled, clearActiveImages, enqueueMessage, isReviewing],
  );

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const inFlight = inFlightByThread[activeThreadId];
    if (!inFlight) {
      return;
    }
    if (isProcessing || isReviewing) {
      if (!hasStartedByThread[activeThreadId]) {
        setHasStartedByThread((prev) => ({
          ...prev,
          [activeThreadId]: true,
        }));
      }
      return;
    }
    if (hasStartedByThread[activeThreadId]) {
      setInFlightByThread((prev) => ({ ...prev, [activeThreadId]: null }));
      setHasStartedByThread((prev) => ({ ...prev, [activeThreadId]: false }));
    }
  }, [
    activeThreadId,
    hasStartedByThread,
    inFlightByThread,
    isProcessing,
    isReviewing,
  ]);

  useEffect(() => {
    if (!activeThreadId || isProcessing || isReviewing) {
      return;
    }
    if (inFlightByThread[activeThreadId]) {
      return;
    }
    const queue = queuedByThread[activeThreadId] ?? [];
    if (queue.length === 0) {
      return;
    }
    const threadId = activeThreadId;
    const nextItem = queue[0];
    setInFlightByThread((prev) => ({ ...prev, [threadId]: nextItem }));
    setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] ?? []).slice(1),
    }));
    (async () => {
      try {
        const trimmed = nextItem.text.trim();
        const command = parseSlashCommand(trimmed, appsEnabled);
        if (command) {
          await runSlashCommand(command, trimmed);
        } else {
          const queuedMentions = nextItem.appMentions ?? [];
          if (queuedMentions.length > 0) {
            await sendUserMessage(nextItem.text, nextItem.images ?? [], queuedMentions);
          } else {
            await sendUserMessage(nextItem.text, nextItem.images ?? []);
          }
        }
      } catch {
        setInFlightByThread((prev) => ({ ...prev, [threadId]: null }));
        setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
        prependQueuedMessage(threadId, nextItem);
      }
    })();
  }, [
    activeThreadId,
    appsEnabled,
    inFlightByThread,
    isProcessing,
    isReviewing,
    prependQueuedMessage,
    queuedByThread,
    runSlashCommand,
    sendUserMessage,
  ]);

  return {
    queuedByThread,
    activeQueue,
    handleSend,
    queueMessage,
    removeQueuedMessage,
  };
}
