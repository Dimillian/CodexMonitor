import { useMemo, type RefObject } from "react";
import type {
  AppSettings,
  ConversationItem,
  DebugEntry,
  ModelOption,
  RequestUserInputRequest,
  ServiceTier,
  ThreadSummary,
  WorkspaceInfo,
} from "@/types";
import { computePlanFollowupState } from "@/features/messages/utils/messageRenderUtils";
import { useComposerController } from "@app/hooks/useComposerController";
import { useComposerInsert } from "@app/hooks/useComposerInsert";
import { useWorkspaceFileListing } from "@app/hooks/useWorkspaceFileListing";
import { useWorkspaceAgentMd } from "@/features/workspaces/hooks/useWorkspaceAgentMd";
import { useWorkspaceHome } from "@/features/workspaces/hooks/useWorkspaceHome";

const RECENT_THREAD_LIMIT = 8;

type UseMainAppComposerWorkspaceStateArgs = {
  view: {
    centerMode: "chat" | "diff";
    isCompact: boolean;
    isTablet: boolean;
    activeTab: "home" | "projects" | "opencode" | "git" | "log";
    tabletTab: "opencode" | "git" | "log";
    filePanelMode: "git" | "files" | "prompts";
    rightPanelCollapsed: boolean;
  };
  workspace: {
    activeWorkspace: WorkspaceInfo | null;
    activeWorkspaceId: string | null;
    isNewAgentDraftMode: boolean;
    startingDraftThreadWorkspaceId: string | null;
    threadsByWorkspace: Record<string, ThreadSummary[]>;
  };
  thread: {
    activeThreadId: string | null;
    activeItems: ConversationItem[];
    activeTurnIdByThread: Record<string, string | null | undefined>;
    threadStatusById: Record<
      string,
      {
        isProcessing: boolean;
        isReviewing: boolean;
      }
    >;
    userInputRequests: RequestUserInputRequest[];
  };
  settings: Pick<
    AppSettings,
    | "steerEnabled"
    | "followUpMessageBehavior"
    | "experimentalAppsEnabled"
    | "pauseQueuedMessagesWhenResponseRequired"
  >;
  models: {
    models: ModelOption[];
    selectedModelId: string | null;
    resolvedEffort: string | null;
    selectedServiceTier: ServiceTier | null | undefined;
    collaborationModePayload: Record<string, unknown> | null;
  };
  refs: {
    composerInputRef: RefObject<HTMLTextAreaElement | null>;
    workspaceHomeTextareaRef: RefObject<HTMLTextAreaElement | null>;
  };
  actions: {
    addWorktreeAgent: Parameters<typeof useWorkspaceHome>[0]["addWorktreeAgent"];
    connectWorkspace: Parameters<typeof useComposerController>[0]["connectWorkspace"] &
      Parameters<typeof useWorkspaceHome>[0]["connectWorkspace"];
    startThreadForWorkspace: Parameters<typeof useComposerController>[0]["startThreadForWorkspace"] &
      Parameters<typeof useWorkspaceHome>[0]["startThreadForWorkspace"];
    sendUserMessage: Parameters<typeof useComposerController>[0]["sendUserMessage"];
    sendUserMessageToThread: Parameters<typeof useComposerController>[0]["sendUserMessageToThread"] &
      Parameters<typeof useWorkspaceHome>[0]["sendUserMessageToThread"];
    seedThreadOpenCodeParams: NonNullable<
      Parameters<typeof useWorkspaceHome>[0]["seedThreadOpenCodeParams"]
    >;
    startFork: Parameters<typeof useComposerController>[0]["startFork"];
    startReview: Parameters<typeof useComposerController>[0]["startReview"];
    startResume: Parameters<typeof useComposerController>[0]["startResume"];
    startCompact: Parameters<typeof useComposerController>[0]["startCompact"];
    startApps: Parameters<typeof useComposerController>[0]["startApps"];
    startMcp: Parameters<typeof useComposerController>[0]["startMcp"];
    startFast: Parameters<typeof useComposerController>[0]["startFast"];
    startStatus: Parameters<typeof useComposerController>[0]["startStatus"];
    handleWorktreeCreated?: Parameters<typeof useWorkspaceHome>[0]["onWorktreeCreated"];
    addDebugEntry: (entry: DebugEntry) => void;
  };
};

export function useMainAppComposerWorkspaceState({
  view,
  workspace,
  thread,
  settings,
  models,
  refs,
  actions,
}: UseMainAppComposerWorkspaceStateArgs) {
  const {
    centerMode,
    isCompact,
    isTablet,
    activeTab,
    tabletTab,
    filePanelMode,
    rightPanelCollapsed,
  } = view;
  const {
    activeWorkspace,
    activeWorkspaceId,
    isNewAgentDraftMode,
    startingDraftThreadWorkspaceId,
    threadsByWorkspace,
  } = workspace;
  const {
    activeThreadId,
    activeItems,
    activeTurnIdByThread,
    threadStatusById,
    userInputRequests,
  } = thread;
  const {
    models: modelOptions,
    selectedModelId,
    resolvedEffort,
    selectedServiceTier,
    collaborationModePayload,
  } = models;
  const { composerInputRef, workspaceHomeTextareaRef } = refs;
  const {
    addWorktreeAgent,
    connectWorkspace,
    startThreadForWorkspace,
    sendUserMessage,
    sendUserMessageToThread,
    seedThreadOpenCodeParams,
    startFork,
    startReview,
    startResume,
    startCompact,
    startApps,
    startMcp,
    startFast,
    startStatus,
    handleWorktreeCreated,
    addDebugEntry,
  } = actions;
  const showWorkspaceHome = Boolean(
    activeWorkspace && !activeThreadId && !isNewAgentDraftMode,
  );
  const showComposer =
    (!isCompact
      ? centerMode === "chat" || centerMode === "diff"
      : (isTablet ? tabletTab : activeTab) === "opencode") && !showWorkspaceHome;

  const { files, isLoading: isFilesLoading, setFileAutocompleteActive } =
    useWorkspaceFileListing({
      activeWorkspace,
      activeWorkspaceId,
      filePanelMode,
      isCompact,
      isTablet,
      activeTab,
      tabletTab,
      rightPanelCollapsed,
      hasComposerSurface: showComposer || showWorkspaceHome,
      onDebug: addDebugEntry,
    });

  const canInterrupt = activeThreadId
    ? threadStatusById[activeThreadId]?.isProcessing ?? false
    : false;
  const isStartingDraftThread =
    Boolean(activeWorkspaceId) && startingDraftThreadWorkspaceId === activeWorkspaceId;
  const isProcessing =
    (activeThreadId ? threadStatusById[activeThreadId]?.isProcessing ?? false : false) ||
    isStartingDraftThread;
  const isReviewing = activeThreadId
    ? threadStatusById[activeThreadId]?.isReviewing ?? false
    : false;
  const activeTurnId = activeThreadId ? activeTurnIdByThread[activeThreadId] ?? null : null;
  const steerAvailable = settings.steerEnabled && Boolean(activeTurnId);
  const hasUserInputRequestForActiveThread = Boolean(
    activeThreadId &&
      userInputRequests.some(
        (request) =>
          request.params.thread_id === activeThreadId &&
          (!activeWorkspaceId || request.workspace_id === activeWorkspaceId),
      ),
  );

  const isPlanReadyAwaitingResponse = useMemo(
    () =>
      computePlanFollowupState({
        threadId: activeThreadId,
        items: activeItems,
        isThinking: isProcessing,
        hasVisibleUserInputRequest: hasUserInputRequestForActiveThread,
      }).shouldShow,
    [
      activeItems,
      activeThreadId,
      hasUserInputRequestForActiveThread,
      isProcessing,
    ],
  );

  const queueFlushPaused = Boolean(
    settings.pauseQueuedMessagesWhenResponseRequired &&
      activeThreadId &&
      (hasUserInputRequestForActiveThread || isPlanReadyAwaitingResponse),
  );

  const queuePausedReason =
    queueFlushPaused && hasUserInputRequestForActiveThread
      ? "Paused — waiting for your answers."
      : queueFlushPaused && isPlanReadyAwaitingResponse
        ? "Paused — waiting for plan accept/changes."
        : null;

  const composerState = useComposerController({
    activeThreadId,
    activeTurnId,
    activeWorkspaceId,
    activeWorkspace,
    isProcessing,
    isReviewing,
    queueFlushPaused,
    steerEnabled: settings.steerEnabled,
    followUpMessageBehavior: settings.followUpMessageBehavior,
    appsEnabled: settings.experimentalAppsEnabled,
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
    startFast,
    startStatus,
  });

  const workspaceHomeState = useWorkspaceHome({
    activeWorkspace,
    models: modelOptions,
    selectedModelId,
    effort: resolvedEffort,
    serviceTier: selectedServiceTier,
    collaborationMode: collaborationModePayload,
    seedThreadOpenCodeParams,
    addWorktreeAgent,
    connectWorkspace,
    startThreadForWorkspace,
    sendUserMessageToThread,
    onWorktreeCreated: handleWorktreeCreated,
  });

  const canInsertComposerText = showWorkspaceHome
    ? Boolean(activeWorkspace)
    : Boolean(activeThreadId);
  const handleInsertComposerText = useComposerInsert({
    isEnabled: canInsertComposerText,
    draftText: showWorkspaceHome ? workspaceHomeState.draft : composerState.activeDraft,
    onDraftChange: showWorkspaceHome
      ? workspaceHomeState.setDraft
      : composerState.handleDraftChange,
    textareaRef: showWorkspaceHome ? workspaceHomeTextareaRef : composerInputRef,
  });

  const { recentThreadInstances, recentThreadsUpdatedAt } = useMemo(() => {
    if (!activeWorkspaceId) {
      return { recentThreadInstances: [], recentThreadsUpdatedAt: null };
    }
    const threads = threadsByWorkspace[activeWorkspaceId] ?? [];
    if (threads.length === 0) {
      return { recentThreadInstances: [], recentThreadsUpdatedAt: null };
    }
    const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
    const slice = sorted.slice(0, RECENT_THREAD_LIMIT);
    const updatedAt = slice.reduce(
      (max, thread) => (thread.updatedAt > max ? thread.updatedAt : max),
      0,
    );
    const instances = slice.map((thread, index) => ({
      id: `recent-${thread.id}`,
      workspaceId: activeWorkspaceId,
      threadId: thread.id,
      modelId: null,
      modelLabel: thread.name?.trim() || "Untitled thread",
      sequence: index + 1,
    }));
    return {
      recentThreadInstances: instances,
      recentThreadsUpdatedAt: updatedAt > 0 ? updatedAt : null,
    };
  }, [activeWorkspaceId, threadsByWorkspace]);

  const agentMdState = useWorkspaceAgentMd({
    activeWorkspace,
    onDebug: addDebugEntry,
  });

  return {
    showWorkspaceHome,
    showComposer,
    files,
    isFilesLoading,
    setFileAutocompleteActive,
    canInterrupt,
    isProcessing,
    isReviewing,
    activeTurnId,
    steerAvailable,
    queuePausedReason,
    canInsertComposerText,
    handleInsertComposerText,
    recentThreadInstances,
    recentThreadsUpdatedAt,
    workspaceHomeState,
    agentMdState,
    ...composerState,
  };
}
