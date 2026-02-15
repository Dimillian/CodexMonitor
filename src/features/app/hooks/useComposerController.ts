import { useCallback, useMemo, useState } from "react";
import type { QueuedMessage, WorkspaceInfo } from "../../../types";
import { useComposerImages } from "../../composer/hooks/useComposerImages";
import { useQueuedSend } from "../../threads/hooks/useQueuedSend";

export function useComposerController({
  activeThreadId,
  activeTurnId,
  activeWorkspaceId,
  activeWorkspace,
  isProcessing,
  isReviewing,
<<<<<<< HEAD
  threadStatusById,
  threadWorkspaceById,
  workspacesById,
=======
  queueFlushPaused = false,
>>>>>>> origin/main
  steerEnabled,
  appsEnabled,
  activeModel,
  activeEffort,
  activeCollaborationMode,
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
  onRecoverStaleThread,
}: {
  activeThreadId: string | null;
  activeTurnId: string | null;
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceInfo | null;
  isProcessing: boolean;
  isReviewing: boolean;
<<<<<<< HEAD
  threadStatusById: Record<
    string,
    {
      isProcessing?: boolean;
      isReviewing?: boolean;
      processingStartedAt?: number | null;
      lastDurationMs?: number | null;
    }
  >;
  threadWorkspaceById: Record<string, string>;
  workspacesById: Map<string, WorkspaceInfo>;
=======
  queueFlushPaused?: boolean;
>>>>>>> origin/main
  steerEnabled: boolean;
  appsEnabled: boolean;
  activeModel: string | null;
  activeEffort: string | null;
  activeCollaborationMode: Record<string, unknown> | null;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { activate?: boolean },
  ) => Promise<string | null>;
  sendUserMessage: (
    text: string,
    images?: string[],
<<<<<<< HEAD
    options?: {
      forceSteer?: boolean;
      model?: string | null;
      effort?: string | null;
      collaborationMode?: Record<string, unknown> | null;
    },
=======
    appMentions?: AppMention[],
>>>>>>> origin/main
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
  onRecoverStaleThread?: (threadId: string) => void;
}) {
  const [composerDraftsByThread, setComposerDraftsByThread] = useState<
    Record<string, string>
  >({});
  const [prefillDraft, setPrefillDraft] = useState<QueuedMessage | null>(null);
  const [composerInsert, setComposerInsert] = useState<QueuedMessage | null>(
    null,
  );

  const {
    activeImages,
    attachImages,
    pickImages,
    removeImage,
    clearActiveImages,
    setImagesForThread,
    removeImagesForThread,
  } = useComposerImages({ activeThreadId, activeWorkspaceId });

  const {
    activeQueue,
    legacyQueueMessageCount,
    queueHealthEntries,
    handleSend,
    queueMessage,
    queueMessageForThread,
    removeQueuedMessage,
    steerQueuedMessage,
    retryThreadQueue,
    migrateLegacyQueueWorkspaceIds,
  } = useQueuedSend({
    activeThreadId,
    activeTurnId,
    isProcessing,
    isReviewing,
<<<<<<< HEAD
    threadStatusById,
    threadWorkspaceById,
    workspacesById,
=======
    queueFlushPaused,
>>>>>>> origin/main
    steerEnabled,
    appsEnabled,
    activeModel,
    activeEffort,
    activeCollaborationMode,
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
  });

  const activeDraft = useMemo(
    () =>
      activeThreadId ? composerDraftsByThread[activeThreadId] ?? "" : "",
    [activeThreadId, composerDraftsByThread],
  );

  const handleDraftChange = useCallback(
    (next: string) => {
      if (!activeThreadId) {
        return;
      }
      setComposerDraftsByThread((prev) => ({
        ...prev,
        [activeThreadId]: next,
      }));
    },
    [activeThreadId],
  );

  const handleSendPrompt = useCallback(
    (text: string) => {
      if (!text.trim()) {
        return;
      }
      void handleSend(text, []);
    },
    [handleSend],
  );

  const handleEditQueued = useCallback(
    (item: QueuedMessage) => {
      if (!activeThreadId) {
        return;
      }
      removeQueuedMessage(activeThreadId, item.id);
      setImagesForThread(activeThreadId, item.images ?? []);
      setPrefillDraft(item);
    },
    [activeThreadId, removeQueuedMessage, setImagesForThread],
  );

  const handleDeleteQueued = useCallback(
    (id: string) => {
      if (!activeThreadId) {
        return;
      }
      removeQueuedMessage(activeThreadId, id);
    },
    [activeThreadId, removeQueuedMessage],
  );

  const handleSteerQueued = useCallback(
    async (id: string) => {
      if (!activeThreadId) {
        return false;
      }
      return steerQueuedMessage(activeThreadId, id);
    },
    [activeThreadId, steerQueuedMessage],
  );

  const clearDraftForThread = useCallback((threadId: string) => {
    setComposerDraftsByThread((prev) => {
      if (!(threadId in prev)) {
        return prev;
      }
      const { [threadId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  return {
    activeImages,
    attachImages,
    pickImages,
    removeImage,
    clearActiveImages,
    setImagesForThread,
    removeImagesForThread,
    activeQueue,
    legacyQueueMessageCount,
    queueHealthEntries,
    handleSend,
    queueMessage,
    queueMessageForThread,
    removeQueuedMessage,
    retryQueuedThread: retryThreadQueue,
    migrateLegacyQueueWorkspaceIds,
    prefillDraft,
    setPrefillDraft,
    composerInsert,
    setComposerInsert,
    activeDraft,
    handleDraftChange,
    handleSendPrompt,
    handleEditQueued,
    handleDeleteQueued,
    handleSteerQueued,
    clearDraftForThread,
  };
}
