import { useCallback, useEffect, useMemo, useState } from "react";
import type { QueuedMessage, WorkspaceInfo } from "../../../types";

type UseQueuedSendOptions = {
  activeThreadId: string | null;
  isProcessing: boolean;
  isReviewing: boolean;
  steerEnabled: boolean;
  activeWorkspace: WorkspaceInfo | null;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  sendUserMessage: (text: string, images?: string[]) => Promise<void>;
  startReview: (text: string) => Promise<void>;
  clearActiveImages: () => void;
};

type UseQueuedSendResult = {
  queuedByThread: Record<string, QueuedMessage[]>;
  activeQueue: QueuedMessage[];
  handleSend: (text: string, images?: string[]) => Promise<void>;
  queueMessage: (text: string, images?: string[]) => Promise<void>;
  removeQueuedMessage: (threadId: string, messageId: string) => void;
};

export function useQueuedSend({
  activeThreadId,
  isProcessing,
  isReviewing,
  steerEnabled,
  activeWorkspace,
  connectWorkspace,
  sendUserMessage,
  startReview,
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

  const handleSend = useCallback(
    async (text: string, images: string[] = []) => {
      const trimmed = text.trim();
      const shouldIgnoreImages = trimmed.startsWith("/review");
      const nextImages = shouldIgnoreImages ? [] : images;
      if (!trimmed && nextImages.length === 0) {
        return;
      }
      if (activeThreadId && isReviewing) {
        return;
      }
      if (isProcessing && activeThreadId && !steerEnabled) {
        const item: QueuedMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: trimmed,
          createdAt: Date.now(),
          images: nextImages,
        };
        enqueueMessage(activeThreadId, item);
        clearActiveImages();
        return;
      }
      if (activeWorkspace && !activeWorkspace.connected) {
        await connectWorkspace(activeWorkspace);
      }
      if (trimmed.startsWith("/review")) {
        await startReview(trimmed);
        clearActiveImages();
        return;
      }
      await sendUserMessage(trimmed, nextImages);
      clearActiveImages();
    },
    [
      activeThreadId,
      activeWorkspace,
      clearActiveImages,
      connectWorkspace,
      enqueueMessage,
      isProcessing,
      isReviewing,
      steerEnabled,
      sendUserMessage,
      startReview,
    ],
  );

  const queueMessage = useCallback(
    async (text: string, images: string[] = []) => {
      const trimmed = text.trim();
      const shouldIgnoreImages = trimmed.startsWith("/review");
      const nextImages = shouldIgnoreImages ? [] : images;
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
      };
      enqueueMessage(activeThreadId, item);
      clearActiveImages();
    },
    [activeThreadId, clearActiveImages, enqueueMessage, isReviewing],
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
        if (nextItem.text.trim().startsWith("/review")) {
          await startReview(nextItem.text);
        } else {
          await sendUserMessage(nextItem.text, nextItem.images ?? []);
        }
      } catch {
        setInFlightByThread((prev) => ({ ...prev, [threadId]: null }));
        setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
        prependQueuedMessage(threadId, nextItem);
      }
    })();
  }, [
    activeThreadId,
    inFlightByThread,
    isProcessing,
    isReviewing,
    prependQueuedMessage,
    queuedByThread,
    sendUserMessage,
    startReview,
  ]);

  return {
    queuedByThread,
    activeQueue,
    handleSend,
    queueMessage,
    removeQueuedMessage,
  };
}
