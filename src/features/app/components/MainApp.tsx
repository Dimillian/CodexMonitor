import { lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import successSoundUrl from "@/assets/success-notification.mp3";
import errorSoundUrl from "@/assets/error-notification.mp3";
import { MainAppShell } from "@app/components/MainAppShell";
import { useThreads } from "@threads/hooks/useThreads";
import { usePullRequestComposer } from "@/features/git/hooks/usePullRequestComposer";
import { useAutoExitEmptyDiff } from "@/features/git/hooks/useAutoExitEmptyDiff";
import { isMissingRepo } from "@/features/git/utils/repoErrors";
import { useModels } from "@/features/models/hooks/useModels";
import { useCollaborationModes } from "@/features/collaboration/hooks/useCollaborationModes";
import { useCollaborationModeSelection } from "@/features/collaboration/hooks/useCollaborationModeSelection";
import { useSkills } from "@/features/skills/hooks/useSkills";
import { useApps } from "@/features/apps/hooks/useApps";
import { useCustomPrompts } from "@/features/prompts/hooks/useCustomPrompts";
import { useBranchSwitcherShortcut } from "@/features/git/hooks/useBranchSwitcherShortcut";
import { useRenameWorktreePrompt } from "@/features/workspaces/hooks/useRenameWorktreePrompt";
import { useLayoutController } from "@app/hooks/useLayoutController";
import { useUpdaterController } from "@app/hooks/useUpdaterController";
import { useResponseRequiredNotificationsController } from "@app/hooks/useResponseRequiredNotificationsController";
import { useErrorToasts } from "@/features/notifications/hooks/useErrorToasts";
import { useComposerShortcuts } from "@/features/composer/hooks/useComposerShortcuts";
import { useComposerMenuActions } from "@/features/composer/hooks/useComposerMenuActions";
import { useComposerEditorState } from "@/features/composer/hooks/useComposerEditorState";
import { useMainAppComposerWorkspaceState } from "@app/hooks/useMainAppComposerWorkspaceState";
import { useMainAppGitState } from "@app/hooks/useMainAppGitState";
import { useMainAppLayoutSurfaces } from "@app/hooks/useMainAppLayoutSurfaces";
import { useMainAppLayoutNodes } from "@app/hooks/useMainAppLayoutNodes";
import { useWorkspaceFromUrlPrompt } from "@/features/workspaces/hooks/useWorkspaceFromUrlPrompt";
import { useWorkspaceController } from "@app/hooks/useWorkspaceController";
import { useWorkspaceSelection } from "@/features/workspaces/hooks/useWorkspaceSelection";
import { usePlanReadyActions } from "@app/hooks/usePlanReadyActions";
import { useThreadRows } from "@app/hooks/useThreadRows";
import { useInterruptShortcut } from "@app/hooks/useInterruptShortcut";
import { useArchiveShortcut } from "@app/hooks/useArchiveShortcut";
import { useCopyThread } from "@threads/hooks/useCopyThread";
import { useTerminalController } from "@/features/terminal/hooks/useTerminalController";
import { useWorkspaceLaunchScript } from "@app/hooks/useWorkspaceLaunchScript";
import { useWorkspaceLaunchScripts } from "@app/hooks/useWorkspaceLaunchScripts";
import { useWorktreeSetupScript } from "@app/hooks/useWorktreeSetupScript";
import { effectiveCommitMessageModelId } from "@/features/git/utils/commitMessageModelSelection";
import { useMobileServerSetup } from "@/features/mobile/hooks/useMobileServerSetup";
import { useMainAppModals } from "@app/hooks/useMainAppModals";
import { useMainAppDisplayNodes } from "@app/hooks/useMainAppDisplayNodes";
import { useMainAppPromptActions } from "@app/hooks/useMainAppPromptActions";
import { useMainAppShellProps } from "@app/hooks/useMainAppShellProps";
import { useMainAppSidebarMenuOrchestration } from "@app/hooks/useMainAppSidebarMenuOrchestration";
import { useMainAppWorktreeState } from "@app/hooks/useMainAppWorktreeState";
import { useMainAppWorkspaceActions } from "@app/hooks/useMainAppWorkspaceActions";
import { useMainAppWorkspaceLifecycle } from "@app/hooks/useMainAppWorkspaceLifecycle";
import { useHomeAccount } from "@app/hooks/useHomeAccount";
import type {
  ComposerEditorSettings,
  ServiceTier,
  WorkspaceInfo,
} from "@/types";
import { OPEN_APP_STORAGE_KEY } from "@app/constants";
import { useOpenAppIcons } from "@app/hooks/useOpenAppIcons";
import { useAccountSwitching } from "@app/hooks/useAccountSwitching";
import { useNewAgentDraft } from "@app/hooks/useNewAgentDraft";
import { useSystemNotificationThreadLinks } from "@app/hooks/useSystemNotificationThreadLinks";
import { useThreadListSortKey } from "@app/hooks/useThreadListSortKey";
import { useThreadListActions } from "@app/hooks/useThreadListActions";
import { useRemoteThreadLiveConnection } from "@app/hooks/useRemoteThreadLiveConnection";
import { useTrayRecentThreads } from "@app/hooks/useTrayRecentThreads";
import { useTraySessionUsage } from "@app/hooks/useTraySessionUsage";
import { useTauriEvent } from "@app/hooks/useTauriEvent";
import { useAppBootstrapOrchestration } from "@app/bootstrap/useAppBootstrapOrchestration";
import {
  useThreadCodexBootstrapOrchestration,
  useThreadCodexSyncOrchestration,
  useThreadSelectionHandlersOrchestration,
  useThreadUiOrchestration,
} from "@app/orchestration/useThreadOrchestration";
import {
  useWorkspaceInsightsOrchestration,
  useWorkspaceOrderingOrchestration,
} from "@app/orchestration/useWorkspaceOrchestration";
import { useAppShellOrchestration } from "@app/orchestration/useLayoutOrchestration";
import { buildCodexArgsOptions } from "@threads/utils/codexArgsProfiles";
import { normalizeCodexArgsInput } from "@/utils/codexArgsInput";
import {
  resolveWorkspaceRuntimeCodexArgsBadgeLabel,
  resolveWorkspaceRuntimeCodexArgsOverride,
} from "@threads/utils/threadCodexParamsSeed";
import { subscribeTrayOpenThread } from "@services/events";
import { setWorkspaceRuntimeCodexArgs } from "@services/tauri";

const SettingsView = lazy(() =>
  import("@settings/components/SettingsView").then((module) => ({
    default: module.SettingsView,
  })),
);

export default function MainApp() {
  const {
    appSettings,
    setAppSettings,
    doctor,
    codexUpdate,
    appSettingsLoading,
    reduceTransparency,
    setReduceTransparency,
    scaleShortcutTitle,
    scaleShortcutText,
    queueSaveSettings,
    dictationModel,
    dictationState,
    dictationLevel,
    dictationTranscript,
    dictationError,
    dictationHint,
    dictationReady,
    handleToggleDictation,
    cancelDictation,
    clearDictationTranscript,
    clearDictationError,
    clearDictationHint,
    debugOpen,
    setDebugOpen,
    debugEntries,
    showDebugButton,
    addDebugEntry,
    handleCopyDebug,
    clearDebugEntries,
    shouldReduceTransparency,
  } = useAppBootstrapOrchestration();
  const {
    threadListSortKey,
    setThreadListSortKey,
    threadListOrganizeMode,
    setThreadListOrganizeMode,
  } = useThreadListSortKey();
  const [activeTab, setActiveTab] = useState<
    "home" | "projects" | "codex" | "git" | "log"
  >("codex");
  const [mobileThreadRefreshLoading, setMobileThreadRefreshLoading] = useState(false);
  const tabletTab =
    activeTab === "projects" || activeTab === "home" ? "codex" : activeTab;
  const {
    workspaces,
    workspaceGroups,
    groupedWorkspaces,
    getWorkspaceGroupName,
    ungroupedLabel,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    addWorkspace,
    addWorkspaceFromPath,
    addWorkspaceFromGitUrl,
    addWorkspacesFromPaths,
    mobileRemoteWorkspacePathPrompt,
    updateMobileRemoteWorkspacePathInput,
    appendMobileRemoteWorkspacePathFromRecent,
    cancelMobileRemoteWorkspacePathPrompt,
    submitMobileRemoteWorkspacePathPrompt,
    addCloneAgent,
    addWorktreeAgent,
    connectWorkspace,
    markWorkspaceConnected,
    updateWorkspaceSettings,
    createWorkspaceGroup,
    renameWorkspaceGroup,
    moveWorkspaceGroup,
    deleteWorkspaceGroup,
    assignWorkspaceGroup,
    removeWorkspace,
    removeWorktree,
    renameWorktree,
    renameWorktreeUpstream,
    deletingWorktreeIds,
    hasLoaded,
    refreshWorkspaces,
  } = useWorkspaceController({
    appSettings,
    addDebugEntry,
    queueSaveSettings,
  });
  const {
    isMobileRuntime,
    showMobileSetupWizard,
    mobileSetupWizardProps,
    handleMobileConnectSuccess,
  } = useMobileServerSetup({
    appSettings,
    appSettingsLoading,
    queueSaveSettings,
    refreshWorkspaces,
  });
  const updaterEnabled = !isMobileRuntime;

  const workspacesById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );
  const {
    threadCodexParamsVersion,
    getThreadCodexParams,
    patchThreadCodexParams,
    accessMode,
    setAccessMode,
    preferredModelId,
    setPreferredModelId,
    preferredEffort,
    setPreferredEffort,
    preferredServiceTier,
    setPreferredServiceTier,
    preferredCollabModeId,
    setPreferredCollabModeId,
    preferredCodexArgsOverride,
    setPreferredCodexArgsOverride,
    threadCodexSelectionKey,
    setThreadCodexSelectionKey,
    activeThreadIdRef,
    pendingNewThreadSeedRef,
    persistThreadCodexParams,
  } = useThreadCodexBootstrapOrchestration({
    activeWorkspaceId,
  });
  const {
    appRef,
    isResizing,
    sidebarWidth,
    chatDiffSplitPositionPercent,
    rightPanelWidth,
    onSidebarResizeStart,
    onChatDiffSplitPositionResizeStart,
    onRightPanelResizeStart,
    planPanelHeight,
    onPlanPanelResizeStart,
    terminalPanelHeight,
    onTerminalPanelResizeStart,
    debugPanelHeight,
    onDebugPanelResizeStart,
    isCompact,
    isTablet,
    isPhone,
    sidebarCollapsed,
    rightPanelCollapsed,
    collapseSidebar,
    expandSidebar,
    collapseRightPanel,
    expandRightPanel,
    terminalOpen,
    handleDebugClick,
    handleToggleTerminal,
    openTerminal,
    closeTerminal: closeTerminalPanel,
  } = useLayoutController({
    activeWorkspaceId,
    setActiveTab,
    setDebugOpen,
    toggleDebugPanelShortcut: appSettings.toggleDebugPanelShortcut,
    toggleTerminalShortcut: appSettings.toggleTerminalShortcut,
  });
  const sidebarToggleProps = {
    isCompact,
    sidebarCollapsed,
    rightPanelCollapsed,
    onCollapseSidebar: collapseSidebar,
    onExpandSidebar: expandSidebar,
    onCollapseRightPanel: collapseRightPanel,
    onExpandRightPanel: expandRightPanel,
  };
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceHomeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const getWorkspaceName = useCallback(
    (workspaceId: string) => workspacesById.get(workspaceId)?.name,
    [workspacesById],
  );

  const recordPendingThreadLinkRef = useRef<
    (workspaceId: string, threadId: string) => void
  >(() => {});

  const { errorToasts, dismissErrorToast } = useErrorToasts();
  const queueGitStatusRefreshRef = useRef<() => void>(() => {});
  const handleThreadMessageActivity = useCallback(() => {
    queueGitStatusRefreshRef.current();
  }, []);

  // Access mode is thread-scoped (best-effort persisted) and falls back to the app default.

  const {
    models,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    reasoningSupported,
    reasoningOptions,
    selectedEffort,
    setSelectedEffort
  } = useModels({
    activeWorkspace,
    onDebug: addDebugEntry,
    preferredModelId,
    preferredEffort,
    selectionKey: threadCodexSelectionKey,
  });

  const {
    collaborationModes,
    selectedCollaborationMode,
    selectedCollaborationModeId,
    setSelectedCollaborationModeId,
  } = useCollaborationModes({
    activeWorkspace,
    enabled: appSettings.collaborationModesEnabled,
    preferredModeId: preferredCollabModeId,
    selectionKey: threadCodexSelectionKey,
    onDebug: addDebugEntry,
  });

  const [selectedCodexArgsOverride, setSelectedCodexArgsOverride] = useState<string | null>(
    null,
  );
  const [selectedServiceTier, setSelectedServiceTier] = useState<
    ServiceTier | null | undefined
  >(undefined);
  useEffect(() => {
    setSelectedCodexArgsOverride(normalizeCodexArgsInput(preferredCodexArgsOverride));
  }, [preferredCodexArgsOverride, threadCodexSelectionKey]);
  useEffect(() => {
    setSelectedServiceTier(preferredServiceTier);
  }, [preferredServiceTier, threadCodexSelectionKey]);

  const {
    handleSelectModel,
    handleSelectEffort,
    handleSelectServiceTier,
    handleSelectCollaborationMode,
    handleSelectAccessMode,
    handleSelectCodexArgsOverride,
  } = useThreadSelectionHandlersOrchestration({
    appSettingsLoading,
    setAppSettings,
    queueSaveSettings,
    activeThreadIdRef,
    setSelectedModelId,
    setSelectedEffort,
    setSelectedServiceTier,
    setSelectedCollaborationModeId,
    setAccessMode,
    setSelectedCodexArgsOverride,
    persistThreadCodexParams,
  });
  const commitMessageModelId = useMemo(
    () => effectiveCommitMessageModelId(models, appSettings.commitMessageModelId),
    [models, appSettings.commitMessageModelId],
  );

  const composerShortcuts = {
    modelShortcut: appSettings.composerModelShortcut,
    accessShortcut: appSettings.composerAccessShortcut,
    reasoningShortcut: appSettings.composerReasoningShortcut,
    collaborationShortcut: appSettings.collaborationModesEnabled
      ? appSettings.composerCollaborationShortcut
      : null,
    models,
    collaborationModes,
    selectedModelId,
    onSelectModel: handleSelectModel,
    selectedCollaborationModeId,
    onSelectCollaborationMode: handleSelectCollaborationMode,
    accessMode,
    onSelectAccessMode: handleSelectAccessMode,
    reasoningOptions,
    selectedEffort,
    onSelectEffort: handleSelectEffort,
    selectedServiceTier: selectedServiceTier ?? null,
    reasoningSupported,
  };

  useComposerShortcuts({
    textareaRef: composerInputRef,
    ...composerShortcuts,
  });

  useComposerShortcuts({
    textareaRef: workspaceHomeTextareaRef,
    ...composerShortcuts,
  });

  useComposerMenuActions({
    models,
    selectedModelId,
    onSelectModel: handleSelectModel,
    collaborationModes,
    selectedCollaborationModeId,
    onSelectCollaborationMode: handleSelectCollaborationMode,
    accessMode,
    onSelectAccessMode: handleSelectAccessMode,
    reasoningOptions,
    selectedEffort,
    onSelectEffort: handleSelectEffort,
    reasoningSupported,
    onFocusComposer: () => composerInputRef.current?.focus(),
  });
  const { skills } = useSkills({ activeWorkspace, onDebug: addDebugEntry });
  const {
    prompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    movePrompt,
    getWorkspacePromptsDir,
    getGlobalPromptsDir,
  } = useCustomPrompts({ activeWorkspace, onDebug: addDebugEntry });
  const resolvedModel = selectedModel?.model ?? null;
  const resolvedEffort = reasoningSupported ? selectedEffort : null;

  const handleThreadCodexMetadataDetected = useCallback(
    (
      workspaceId: string,
      threadId: string,
      metadata: { modelId: string | null; effort: string | null },
    ) => {
      if (!workspaceId || !threadId) {
        return;
      }
      const modelId =
        typeof metadata.modelId === "string" && metadata.modelId.trim().length > 0
          ? metadata.modelId.trim()
          : null;
      const effort =
        typeof metadata.effort === "string" && metadata.effort.trim().length > 0
          ? metadata.effort.trim().toLowerCase()
          : null;
      if (!modelId && !effort) {
        return;
      }

      const current = getThreadCodexParams(workspaceId, threadId);
      const patch: {
        modelId?: string | null;
        effort?: string | null;
      } = {};
      if (modelId && !current?.modelId) {
        patch.modelId = modelId;
      }
      if (effort && !current?.effort) {
        patch.effort = effort;
      }
      if (Object.keys(patch).length === 0) {
        return;
      }
      patchThreadCodexParams(workspaceId, threadId, patch);
    },
    [getThreadCodexParams, patchThreadCodexParams],
  );
  const codexArgsOptions = useMemo(
    () =>
      buildCodexArgsOptions({
        appCodexArgs: appSettings.codexArgs ?? null,
        additionalCodexArgs: [selectedCodexArgsOverride],
      }),
    [appSettings.codexArgs, selectedCodexArgsOverride],
  );
  const ensureWorkspaceRuntimeCodexArgs = useCallback(
    async (workspaceId: string, threadId: string | null) => {
      const sanitizedCodexArgsOverride = resolveWorkspaceRuntimeCodexArgsOverride({
        workspaceId,
        threadId,
        getThreadCodexParams,
      });
      await setWorkspaceRuntimeCodexArgs(workspaceId, sanitizedCodexArgsOverride);
    },
    [getThreadCodexParams],
  );
  const getThreadArgsBadge = useCallback(
    (workspaceId: string, threadId: string) =>
      resolveWorkspaceRuntimeCodexArgsBadgeLabel({
        workspaceId,
        threadId,
        getThreadCodexParams,
      }),
    [getThreadCodexParams],
  );

  const { collaborationModePayload } = useCollaborationModeSelection({
    selectedCollaborationMode,
    selectedCollaborationModeId,
    selectedEffort: resolvedEffort,
    resolvedModel,
  });

  const {
    setActiveThreadId,
    hasLocalThreadSnapshot,
    activeThreadId,
    activeItems,
    approvals,
    userInputRequests,
    threadsByWorkspace,
    threadParentById,
    isSubagentThread,
    threadStatusById,
    threadResumeLoadingById,
    threadListLoadingByWorkspace,
    threadListPagingByWorkspace,
    threadListCursorByWorkspace,
    activeTurnIdByThread,
    tokenUsageByThread,
    rateLimitsByWorkspace,
    accountByWorkspace,
    planByThread,
    lastAgentMessageByThread,
    pinnedThreadsVersion,
    interruptTurn,
    removeThread,
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    renameThread,
    startThreadForWorkspace,
    listThreadsForWorkspaces,
    listThreadsForWorkspace,
    loadOlderThreadsForWorkspace,
    resetWorkspaceThreads,
    refreshThread,
    sendUserMessage,
    sendUserMessageToThread,
    startFork,
    startReview,
    startUncommittedReview,
    startResume,
    startCompact,
    startApps,
    startMcp,
    startFast,
    startStatus,
    reviewPrompt,
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
    refreshAccountInfo,
    refreshAccountRateLimits,
  } = useThreads({
    activeWorkspace,
    onWorkspaceConnected: markWorkspaceConnected,
    onDebug: addDebugEntry,
    model: resolvedModel,
    effort: resolvedEffort,
    serviceTier: selectedServiceTier,
    collaborationMode: collaborationModePayload,
    onSelectServiceTier: handleSelectServiceTier,
    accessMode,
    ensureWorkspaceRuntimeCodexArgs,
    reviewDeliveryMode: appSettings.reviewDeliveryMode,
    steerEnabled: appSettings.steerEnabled,
    threadTitleAutogenerationEnabled: appSettings.threadTitleAutogenerationEnabled,
    chatHistoryScrollbackItems: appSettingsLoading
      ? null
      : appSettings.chatHistoryScrollbackItems,
    customPrompts: prompts,
    onMessageActivity: handleThreadMessageActivity,
    threadSortKey: threadListSortKey,
    onThreadCodexMetadataDetected: handleThreadCodexMetadataDetected,
  });
  const { connectionState: remoteThreadConnectionState, reconnectLive } =
    useRemoteThreadLiveConnection({
      backendMode: appSettings.backendMode,
      activeWorkspace,
      activeThreadId,
      activeThreadHasLocalSnapshot: hasLocalThreadSnapshot(activeThreadId),
      activeThreadIsProcessing: Boolean(
        activeThreadId && threadStatusById[activeThreadId]?.isProcessing,
      ),
      refreshThread,
      reconnectWorkspace: connectWorkspace,
    });

  const handleMobileThreadRefresh = useCallback(() => {
    if (mobileThreadRefreshLoading || !activeWorkspace) {
      return;
    }
    setMobileThreadRefreshLoading(true);
    void (async () => {
      let threadId = activeThreadId;
      if (!threadId) {
        threadId = await startThreadForWorkspace(activeWorkspace.id, {
          activate: true,
        });
      }
      if (!threadId) {
        return;
      }
      await refreshThread(activeWorkspace.id, threadId);
      await reconnectLive(activeWorkspace.id, threadId, { runResume: false });
    })()
      .catch(() => {
        // Errors are surfaced through debug entries/toasts in existing thread actions.
      })
      .finally(() => {
        setMobileThreadRefreshLoading(false);
      });
  }, [
    activeThreadId,
    activeWorkspace,
    mobileThreadRefreshLoading,
    refreshThread,
    reconnectLive,
    startThreadForWorkspace,
  ]);
  const {
    updaterState,
    startUpdate,
    dismissUpdate,
    postUpdateNotice,
    dismissPostUpdateNotice,
    handleTestNotificationSound,
    handleTestSystemNotification,
  } = useUpdaterController({
    enabled: updaterEnabled,
    notificationSoundsEnabled: appSettings.notificationSoundsEnabled,
    systemNotificationsEnabled: appSettings.systemNotificationsEnabled,
    subagentSystemNotificationsEnabled:
      appSettings.subagentSystemNotificationsEnabled,
    isSubagentThread,
    getWorkspaceName,
    onThreadNotificationSent: (workspaceId, threadId) =>
      recordPendingThreadLinkRef.current(workspaceId, threadId),
    onDebug: addDebugEntry,
    successSoundUrl,
    errorSoundUrl,
  });
  const gitState = useMainAppGitState({
    activeWorkspace,
    activeWorkspaceId,
    activeItems,
    activeThreadId,
    activeTab,
    tabletTab,
    isCompact,
    isTablet,
    setActiveTab,
    appSettings: {
      preloadGitDiffs: appSettings.preloadGitDiffs,
      gitDiffIgnoreWhitespaceChanges: appSettings.gitDiffIgnoreWhitespaceChanges,
      splitChatDiffView: appSettings.splitChatDiffView,
      reviewDeliveryMode: appSettings.reviewDeliveryMode,
    },
    addDebugEntry,
    updateWorkspaceSettings,
    commitMessageModelId,
    connectWorkspace,
    startThreadForWorkspace,
    sendUserMessageToThread,
  });
  const {
    activeWorkspaceRef,
    activeWorkspaceIdRef,
    queueGitStatusRefresh,
    alertError,
    centerMode,
    setCenterMode,
    selectedDiffPath,
    setSelectedDiffPath,
    gitPanelMode,
    setGitPanelMode,
    gitDiffViewStyle,
    setGitDiffViewStyle,
    filePanelMode,
    selectedPullRequest,
    setSelectedPullRequest,
    selectedCommitSha,
    diffSource,
    setDiffSource,
    gitStatus,
    gitLogEntries,
    gitLogAheadEntries,
    gitLogBehindEntries,
    shouldLoadDiffs,
    activeDiffs,
    activeDiffLoading,
    activeDiffError,
    shouldLoadGitHubPanelData,
    handleGitIssuesChange,
    handleGitPullRequestsChange,
    handleGitPullRequestDiffsChange,
    handleGitPullRequestCommentsChange,
    refreshGitRemote,
    branches,
    currentBranch,
    isBranchSwitcherEnabled,
    handleCheckoutBranch,
    handleCreateGitHubRepo,
    createGitHubRepoLoading,
    handleInitGitRepo,
    initGitRepoLoading,
    isLaunchingPullRequestReview,
    pullRequestReviewActions,
    runPullRequestReview,
  } = gitState;
  queueGitStatusRefreshRef.current = queueGitStatusRefresh;
  const { isExpanded: composerEditorExpanded, toggleExpanded: toggleComposerEditorExpanded } =
    useComposerEditorState();

  const composerEditorSettings = useMemo<ComposerEditorSettings>(
    () => ({
      preset: appSettings.composerEditorPreset,
      expandFenceOnSpace: appSettings.composerFenceExpandOnSpace,
      expandFenceOnEnter: appSettings.composerFenceExpandOnEnter,
      fenceLanguageTags: appSettings.composerFenceLanguageTags,
      fenceWrapSelection: appSettings.composerFenceWrapSelection,
      autoWrapPasteMultiline: appSettings.composerFenceAutoWrapPasteMultiline,
      autoWrapPasteCodeLike: appSettings.composerFenceAutoWrapPasteCodeLike,
      continueListOnShiftEnter: appSettings.composerListContinuation,
    }),
    [
      appSettings.composerEditorPreset,
      appSettings.composerFenceExpandOnSpace,
      appSettings.composerFenceExpandOnEnter,
      appSettings.composerFenceLanguageTags,
      appSettings.composerFenceWrapSelection,
      appSettings.composerFenceAutoWrapPasteMultiline,
      appSettings.composerFenceAutoWrapPasteCodeLike,
      appSettings.composerListContinuation,
    ],
  );

  const { apps } = useApps({
    activeWorkspace,
    activeThreadId,
    enabled: appSettings.experimentalAppsEnabled,
    onDebug: addDebugEntry,
  });

  useThreadCodexSyncOrchestration({
    activeWorkspaceId,
    activeThreadId,
    appSettings: {
      defaultAccessMode: appSettings.defaultAccessMode,
      lastComposerModelId: appSettings.lastComposerModelId,
      lastComposerReasoningEffort: appSettings.lastComposerReasoningEffort,
    },
    threadCodexParamsVersion,
    getThreadCodexParams,
    patchThreadCodexParams,
    setThreadCodexSelectionKey,
    setAccessMode,
    setPreferredModelId,
    setPreferredEffort,
    setPreferredServiceTier,
    setPreferredCollabModeId,
    setPreferredCodexArgsOverride,
    activeThreadIdRef,
    pendingNewThreadSeedRef,
    selectedModelId,
    resolvedEffort,
    selectedServiceTier,
    accessMode,
    selectedCollaborationModeId,
    selectedCodexArgsOverride,
  });

  const { handleSetThreadListSortKey, handleRefreshAllWorkspaceThreads } =
    useThreadListActions({
      threadListSortKey,
      setThreadListSortKey,
      workspaces,
      refreshWorkspaces,
      listThreadsForWorkspaces,
      resetWorkspaceThreads,
    });

  useResponseRequiredNotificationsController({
    systemNotificationsEnabled: appSettings.systemNotificationsEnabled,
    subagentSystemNotificationsEnabled:
      appSettings.subagentSystemNotificationsEnabled,
    isSubagentThread,
    approvals,
    userInputRequests,
    getWorkspaceName,
    onDebug: addDebugEntry,
  });

  const {
    activeAccount,
    accountSwitching,
    handleSwitchAccount,
    handleCancelSwitchAccount,
  } = useAccountSwitching({
    activeWorkspaceId,
    accountByWorkspace,
    refreshAccountInfo,
    refreshAccountRateLimits,
    alertError,
  });
  const {
    newAgentDraftWorkspaceId,
    startingDraftThreadWorkspaceId,
    isDraftModeForActiveWorkspace: isNewAgentDraftMode,
    startNewAgentDraft,
    clearDraftState,
    clearDraftStateIfDifferentWorkspace,
    runWithDraftStart,
  } = useNewAgentDraft({
    activeWorkspace,
    activeWorkspaceId,
    activeThreadId,
  });
  const { getThreadRows } = useThreadRows(threadParentById);

  useTrayRecentThreads({
    workspaces,
    threadsByWorkspace,
    isSubagentThread,
  });

  useAutoExitEmptyDiff({
    centerMode,
    autoExitEnabled: diffSource === "local",
    activeDiffCount: activeDiffs.length,
    activeDiffLoading,
    activeDiffError,
    activeThreadId,
    isCompact,
    setCenterMode,
    setSelectedDiffPath,
    setActiveTab,
  });

  const { handleCopyThread } = useCopyThread({
    activeItems,
    onDebug: addDebugEntry,
  });

  const {
    renamePrompt: renameWorktreePrompt,
    notice: renameWorktreeNotice,
    upstreamPrompt: renameWorktreeUpstreamPrompt,
    confirmUpstream: confirmRenameWorktreeUpstream,
    openRenamePrompt: openRenameWorktreePrompt,
    handleRenameChange: handleRenameWorktreeChange,
    handleRenameCancel: handleRenameWorktreeCancel,
    handleRenameConfirm: handleRenameWorktreeConfirm,
  } = useRenameWorktreePrompt({
    workspaces,
    activeWorkspaceId,
    renameWorktree,
    renameWorktreeUpstream,
    onRenameSuccess: (workspace) => {
      resetWorkspaceThreads(workspace.id);
      void listThreadsForWorkspace(workspace);
      if (activeThreadId && activeWorkspaceId === workspace.id) {
        void refreshThread(workspace.id, activeThreadId);
      }
    },
  });

  const handleOpenRenameWorktree = useCallback(() => {
    if (activeWorkspace) {
      openRenameWorktreePrompt(activeWorkspace.id);
    }
  }, [activeWorkspace, openRenameWorktreePrompt]);

  const {
    terminalTabs,
    activeTerminalId,
    onSelectTerminal,
    onNewTerminal,
    onCloseTerminal,
    terminalState,
    ensureTerminalWithTitle,
    restartTerminalSession,
    requestTerminalFocus,
  } = useTerminalController({
    activeWorkspaceId,
    activeWorkspace,
    terminalOpen,
    onCloseTerminalPanel: closeTerminalPanel,
    onDebug: addDebugEntry,
  });

  const ensureLaunchTerminal = useCallback(
    (workspaceId: string) => ensureTerminalWithTitle(workspaceId, "launch", "Launch"),
    [ensureTerminalWithTitle],
  );

  const openTerminalWithFocus = useCallback(() => {
    if (!activeWorkspaceId) {
      return;
    }
    requestTerminalFocus();
    openTerminal();
  }, [activeWorkspaceId, openTerminal, requestTerminalFocus]);

  const handleToggleTerminalWithFocus = useCallback(() => {
    if (!activeWorkspaceId) {
      return;
    }
    if (!terminalOpen) {
      requestTerminalFocus();
    }
    handleToggleTerminal();
  }, [
    activeWorkspaceId,
    handleToggleTerminal,
    requestTerminalFocus,
    terminalOpen,
  ]);

  const launchScriptState = useWorkspaceLaunchScript({
    activeWorkspace,
    updateWorkspaceSettings,
    openTerminal: openTerminalWithFocus,
    ensureLaunchTerminal,
    restartLaunchSession: restartTerminalSession,
    terminalState,
    activeTerminalId,
  });

  const launchScriptsState = useWorkspaceLaunchScripts({
    activeWorkspace,
    updateWorkspaceSettings,
    openTerminal: openTerminalWithFocus,
    ensureLaunchTerminal: (workspaceId, entry, title) => {
      const label = entry.label?.trim() || entry.icon;
      return ensureTerminalWithTitle(
        workspaceId,
        `launch:${entry.id}`,
        title || `Launch ${label}`,
      );
    },
    restartLaunchSession: restartTerminalSession,
    terminalState,
    activeTerminalId,
  });

  const worktreeSetupScriptState = useWorktreeSetupScript({
    ensureTerminalWithTitle,
    restartTerminalSession,
    openTerminal,
    onDebug: addDebugEntry,
  });

  const handleWorktreeCreated = useCallback(
    async (worktree: WorkspaceInfo, _parentWorkspace?: WorkspaceInfo) => {
      await worktreeSetupScriptState.maybeRunWorktreeSetupScript(worktree);
    },
    [worktreeSetupScriptState],
  );

  const { exitDiffView, selectWorkspace, selectHome } = useWorkspaceSelection({
    workspaces,
    isCompact,
    activeWorkspaceId,
    setActiveTab,
    setActiveWorkspaceId,
    updateWorkspaceSettings,
    setCenterMode,
    setSelectedDiffPath,
  });

  const resolveCloneProjectContext = useCallback(
    (workspace: WorkspaceInfo) => {
      const groupId = workspace.settings.groupId ?? null;
      const group = groupId
        ? appSettings.workspaceGroups.find((entry) => entry.id === groupId)
        : null;
      return {
        groupId,
        copiesFolder: group?.copiesFolder ?? null,
      };
    },
    [appSettings.workspaceGroups],
  );

  const { handleMoveWorkspace } = useWorkspaceOrderingOrchestration({
    workspaces,
    workspacesById,
    updateWorkspaceSettings,
  });

  const handleSelectOpenAppId = useCallback(
    (id: string) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(OPEN_APP_STORAGE_KEY, id);
      }
      setAppSettings((current) => {
        if (current.selectedOpenAppId === id) {
          return current;
        }
        const nextSettings = {
          ...current,
          selectedOpenAppId: id,
        };
        void queueSaveSettings(nextSettings);
        return nextSettings;
      });
    },
    [queueSaveSettings, setAppSettings],
  );

  const openAppIconById = useOpenAppIcons(appSettings.openAppTargets);

  const persistProjectCopiesFolder = useCallback(
    async (groupId: string, copiesFolder: string) => {
      await queueSaveSettings({
        ...appSettings,
        workspaceGroups: appSettings.workspaceGroups.map((entry) =>
          entry.id === groupId ? { ...entry, copiesFolder } : entry,
        ),
      });
    },
    [appSettings, queueSaveSettings],
  );


  const {
    workspaceFromUrlPrompt,
    openWorkspaceFromUrlPrompt,
    closeWorkspaceFromUrlPrompt,
    chooseWorkspaceFromUrlDestinationPath,
    submitWorkspaceFromUrlPrompt,
    updateWorkspaceFromUrlUrl,
    updateWorkspaceFromUrlTargetFolderName,
    clearWorkspaceFromUrlDestinationPath,
    canSubmitWorkspaceFromUrlPrompt,
  } = useWorkspaceFromUrlPrompt({
    onSubmit: async (url, destinationPath, targetFolderName) => {
      await handleAddWorkspaceFromGitUrl(url, destinationPath, targetFolderName);
    },
  });

  const { appModalsProps, modalActions } = useMainAppModals({
    settingsViewComponent: SettingsView,
    workspaces,
    workspaceGroups,
    groupedWorkspaces,
    ungroupedLabel,
    activeWorkspace,
    setActiveWorkspaceId,
    branches,
    currentBranch,
    threadRename: {
      threadsByWorkspace,
      renameThread,
    },
    git: {
      checkoutBranch: handleCheckoutBranch,
      initGitRepo: handleInitGitRepo,
      createGitHubRepo: handleCreateGitHubRepo,
      refreshGitRemote,
      initGitRepoLoading,
      createGitHubRepoLoading,
    },
    workspacePrompts: {
      addWorktreeAgent,
      addCloneAgent,
      connectWorkspace,
      updateWorkspaceSettings,
      selectWorkspace,
      handleWorktreeCreated,
      resolveCloneProjectContext,
      persistProjectCopiesFolder,
      onCompactActivate: isCompact ? () => setActiveTab("codex") : undefined,
      onWorkspacePromptError: (message, kind) => {
        addDebugEntry({
          id: `${Date.now()}-client-add-${kind}-error`,
          timestamp: Date.now(),
          source: "error",
          label: `${kind}/add error`,
          payload: message,
        });
      },
      mobileRemoteWorkspacePathPrompt,
      updateMobileRemoteWorkspacePathInput,
      appendMobileRemoteWorkspacePathFromRecent,
      cancelMobileRemoteWorkspacePathPrompt,
      submitMobileRemoteWorkspacePathPrompt,
      openWorkspaceFromUrlPrompt,
      workspaceFromUrl: {
        workspaceFromUrlPrompt,
        workspaceFromUrlCanSubmit: canSubmitWorkspaceFromUrlPrompt,
        onWorkspaceFromUrlPromptUrlChange: updateWorkspaceFromUrlUrl,
        onWorkspaceFromUrlPromptTargetFolderNameChange:
          updateWorkspaceFromUrlTargetFolderName,
        onWorkspaceFromUrlPromptChooseDestinationPath:
          chooseWorkspaceFromUrlDestinationPath,
        onWorkspaceFromUrlPromptClearDestinationPath:
          clearWorkspaceFromUrlDestinationPath,
        onWorkspaceFromUrlPromptCancel: closeWorkspaceFromUrlPrompt,
        onWorkspaceFromUrlPromptConfirm: submitWorkspaceFromUrlPrompt,
      },
    },
    settings: {
      handleMoveWorkspace,
      removeWorkspace,
      createWorkspaceGroup,
      renameWorkspaceGroup,
      moveWorkspaceGroup,
      deleteWorkspaceGroup,
      assignWorkspaceGroup,
      reduceTransparency,
      setReduceTransparency,
      appSettings,
      openAppIconById,
      queueSaveSettings,
      doctor,
      codexUpdate,
      updateWorkspaceSettings,
      scaleShortcutTitle,
      scaleShortcutText,
      handleTestNotificationSound,
      handleTestSystemNotification,
      handleMobileConnectSuccess,
      dictationModel,
    },
  });

  useBranchSwitcherShortcut({
    shortcut: appSettings.branchSwitcherShortcut,
    isEnabled: isBranchSwitcherEnabled,
    onTrigger: modalActions.openBranchSwitcher,
  });

  const handleRenameThread = useCallback(
    (workspaceId: string, threadId: string) => {
      modalActions.openRenamePrompt(workspaceId, threadId);
    },
    [modalActions],
  );

  const showHome = !activeWorkspace;
  const {
    latestAgentRuns,
    isLoadingLatestAgents,
    usageMetric,
    setUsageMetric,
    usageWorkspaceId,
    setUsageWorkspaceId,
    usageWorkspaceOptions,
    localUsageSnapshot,
    isLoadingLocalUsage,
    localUsageError,
    refreshLocalUsage,
  } = useWorkspaceInsightsOrchestration({
    workspaces,
    workspacesById,
    hasLoaded,
    showHome,
    threadsByWorkspace,
    lastAgentMessageByThread,
    threadStatusById,
    threadListLoadingByWorkspace,
    getWorkspaceGroupName,
  });

  const activeRateLimits = activeWorkspaceId
    ? rateLimitsByWorkspace[activeWorkspaceId] ?? null
    : null;
  const {
    homeAccount,
    homeRateLimits,
  } = useHomeAccount({
    showHome,
    usageWorkspaceId,
    workspaces,
    threadsByWorkspace,
    threadListLoadingByWorkspace,
    rateLimitsByWorkspace,
    accountByWorkspace,
    refreshAccountInfo,
    refreshAccountRateLimits,
  });
  const activeTokenUsage = activeThreadId
    ? tokenUsageByThread[activeThreadId] ?? null
    : null;
  useTraySessionUsage({
    accountRateLimits: activeRateLimits,
    showRemaining: appSettings.usageShowRemaining,
  });
  const activePlan = activeThreadId
    ? planByThread[activeThreadId] ?? null
    : null;
  const hasActivePlan = Boolean(
    activePlan && (activePlan.steps.length > 0 || activePlan.explanation)
  );
  const composerWorkspaceState = useMainAppComposerWorkspaceState({
    view: {
      activeTab,
      tabletTab,
      centerMode,
      isCompact,
      isTablet,
      rightPanelCollapsed,
      filePanelMode,
    },
    workspace: {
      activeWorkspace,
      activeWorkspaceId,
      isNewAgentDraftMode,
      startingDraftThreadWorkspaceId,
      threadsByWorkspace,
    },
    thread: {
      activeThreadId,
      activeItems,
      threadStatusById,
      activeTurnIdByThread,
      userInputRequests,
    },
    settings: {
      steerEnabled: appSettings.steerEnabled,
      followUpMessageBehavior: appSettings.followUpMessageBehavior,
      experimentalAppsEnabled: appSettings.experimentalAppsEnabled,
      pauseQueuedMessagesWhenResponseRequired:
        appSettings.pauseQueuedMessagesWhenResponseRequired,
    },
    models: {
      models,
      selectedModelId,
      resolvedEffort,
      selectedServiceTier,
      collaborationModePayload,
    },
    refs: {
      composerInputRef,
      workspaceHomeTextareaRef,
    },
    actions: {
      connectWorkspace,
      startThreadForWorkspace,
      sendUserMessage,
      sendUserMessageToThread,
      seedThreadCodexParams: patchThreadCodexParams,
      startFork,
      startReview,
      startResume,
      startCompact,
      startApps,
      startMcp,
      startFast,
      startStatus,
      addWorktreeAgent,
      handleWorktreeCreated,
      addDebugEntry,
    },
  });
  const {
    files,
    setFileAutocompleteActive,
    showWorkspaceHome,
    showComposer,
    canInterrupt,
    recentThreadInstances,
    recentThreadsUpdatedAt,
    clearActiveImages,
    removeImagesForThread,
    handleSend,
    setPrefillDraft,
    clearDraftForThread,
    workspaceHomeState,
    agentMdState,
  } = composerWorkspaceState;
  const {
    runs: workspaceRuns,
    draft: workspacePrompt,
    runMode: workspaceRunMode,
    modelSelections: workspaceModelSelections,
    error: workspaceRunError,
    isSubmitting: workspaceRunSubmitting,
    setDraft: setWorkspacePrompt,
    setRunMode: setWorkspaceRunMode,
    toggleModelSelection: toggleWorkspaceModelSelection,
    setModelCount: setWorkspaceModelCount,
    startRun: startWorkspaceRun,
  } = workspaceHomeState;
  const {
    content: agentMdContent,
    exists: agentMdExists,
    truncated: agentMdTruncated,
    isLoading: agentMdLoading,
    isSaving: agentMdSaving,
    error: agentMdError,
    isDirty: agentMdDirty,
    setContent: setAgentMdContent,
    refresh: refreshAgentMd,
    save: saveAgentMd,
  } = agentMdState;
  const promptActions = useMainAppPromptActions({
    activeWorkspace,
    connectWorkspace,
    startThreadForWorkspace,
    sendUserMessageToThread,
    alertError,
    createPrompt,
    updatePrompt,
    deletePrompt,
    movePrompt,
    getWorkspacePromptsDir,
    getGlobalPromptsDir,
  });
  const worktreeState = useMainAppWorktreeState({
    activeWorkspace,
    workspacesById,
    renameWorktreePrompt,
    renameWorktreeNotice,
    renameWorktreeUpstreamPrompt,
    confirmRenameWorktreeUpstream,
    handleOpenRenameWorktree,
    handleRenameWorktreeChange,
    handleRenameWorktreeCancel,
    handleRenameWorktreeConfirm,
  });
  const { baseWorkspaceRef } = worktreeState;

  useMainAppWorkspaceLifecycle({
    activeTab,
    isTablet,
    setActiveTab,
    workspaces,
    hasLoaded,
    connectWorkspace,
    listThreadsForWorkspaces,
    refreshWorkspaces,
    backendMode: appSettings.backendMode,
    activeWorkspace,
    activeThreadId,
    threadStatusById,
    remoteThreadConnectionState,
    refreshThread,
  });

  const {
    handleAddWorkspace,
    handleAddWorkspaceFromGitUrl,
    handleAddAgent,
    handleAddWorktreeAgent,
    handleAddCloneAgent,
    dropTargetRef: workspaceDropTargetRef,
    isDragOver: isWorkspaceDropActive,
    handleDragOver: handleWorkspaceDragOver,
    handleDragEnter: handleWorkspaceDragEnter,
    handleDragLeave: handleWorkspaceDragLeave,
    handleDrop: handleWorkspaceDrop,
  } = useMainAppWorkspaceActions({
    workspaceActions: {
      isCompact,
      addWorkspace,
      addWorkspaceFromPath,
      addWorkspaceFromGitUrl,
      addWorkspacesFromPaths,
      setActiveThreadId,
      setActiveTab,
      exitDiffView,
      selectWorkspace,
      onStartNewAgentDraft: startNewAgentDraft,
      openWorktreePrompt: modalActions.openWorktreePrompt,
      openClonePrompt: modalActions.openClonePrompt,
      composerInputRef,
      onDebug: addDebugEntry,
    },
  });

  useInterruptShortcut({
    isEnabled: canInterrupt,
    shortcut: appSettings.interruptShortcut,
    onTrigger: () => {
      void interruptTurn();
    },
  });

  const selectedCommitEntry = useMemo(() => {
    if (!selectedCommitSha) {
      return null;
    }
    return (
      [...gitLogAheadEntries, ...gitLogBehindEntries, ...gitLogEntries].find(
        (entry) => entry.sha === selectedCommitSha,
      ) ?? null
    );
  }, [gitLogAheadEntries, gitLogBehindEntries, gitLogEntries, selectedCommitSha]);

  const {
    handleSelectPullRequest,
    resetPullRequestSelection,
    composerContextActions,
    composerSendLabel,
    handleComposerSend,
  } = usePullRequestComposer({
    activeWorkspace,
    selectedPullRequest,
    selectedCommit: selectedCommitEntry,
    filePanelMode,
    gitPanelMode,
    centerMode,
    isCompact,
    setSelectedPullRequest,
    setDiffSource,
    setSelectedDiffPath,
    setCenterMode,
    setGitPanelMode,
    setPrefillDraft,
    setActiveTab,
    pullRequestReviewActions,
    pullRequestReviewLaunching: isLaunchingPullRequestReview,
    runPullRequestReview,
    startReview,
    clearActiveImages,
    handleSend,
  });

  const {
    handleComposerSendWithDraftStart,
    handleSelectWorkspaceInstance,
    handleOpenThreadLink,
    handleArchiveActiveThread,
  } = useThreadUiOrchestration({
    activeWorkspaceId,
    activeThreadId,
    accessMode,
    selectedServiceTier,
    selectedCollaborationModeId,
    selectedCodexArgsOverride,
    pendingNewThreadSeedRef,
    runWithDraftStart,
    handleComposerSend,
    clearDraftState,
    exitDiffView,
    resetPullRequestSelection,
    selectWorkspace,
    setActiveThreadId,
    setActiveTab,
    isCompact,
    removeThread,
    clearDraftForThread,
    removeImagesForThread,
  });

  const handleOpenThreadLinkFromExternal = useCallback(
    (workspaceId: string, threadId: string) => {
      setActiveTab("codex");
      handleOpenThreadLink(threadId, workspaceId);
    },
    [handleOpenThreadLink, setActiveTab],
  );

  const { recordPendingThreadLink, openThreadLinkOrQueue } =
    useSystemNotificationThreadLinks({
      hasLoadedWorkspaces: hasLoaded,
      workspacesById,
      refreshWorkspaces,
      connectWorkspace,
      openThreadLink: handleOpenThreadLinkFromExternal,
    });

  useTauriEvent(
    subscribeTrayOpenThread,
    ({ workspaceId, threadId }: { workspaceId: string; threadId: string }) => {
      openThreadLinkOrQueue(workspaceId, threadId);
    },
  );

  useEffect(() => {
    recordPendingThreadLinkRef.current = recordPendingThreadLink;
    return () => {
      recordPendingThreadLinkRef.current = () => {};
    };
  }, [recordPendingThreadLink]);

  const { handlePlanAccept, handlePlanSubmitChanges } = usePlanReadyActions({
    activeWorkspace,
    activeThreadId,
    collaborationModes,
    resolvedModel,
    resolvedEffort,
    connectWorkspace,
    sendUserMessageToThread,
    setSelectedCollaborationModeId,
    persistThreadCodexParams,
  });

  const {
    showGitDetail,
    isThreadOpen,
    dropOverlayActive,
    dropOverlayText,
    appClassName,
    appStyle,
  } = useAppShellOrchestration({
    isCompact,
    isPhone,
    isTablet,
    sidebarCollapsed,
    rightPanelCollapsed,
    shouldReduceTransparency,
    isWorkspaceDropActive,
    centerMode,
    selectedDiffPath,
    showComposer,
    activeThreadId,
    sidebarWidth,
    chatDiffSplitPositionPercent,
    rightPanelWidth,
    planPanelHeight,
    terminalPanelHeight,
    debugPanelHeight,
    appSettings,
  });

  const sidebarMenuOrchestration = useMainAppSidebarMenuOrchestration({
    sidebarActions: {
      openSettings: modalActions.openSettings,
      resetPullRequestSelection,
      clearDraftState,
      clearDraftStateIfDifferentWorkspace,
      selectHome,
      exitDiffView,
      selectWorkspace,
      setActiveThreadId,
      connectWorkspace,
      isCompact,
      setActiveTab,
      workspacesById,
      updateWorkspaceSettings,
      removeThread,
      clearDraftForThread,
      removeImagesForThread,
      refreshThread,
      handleRenameThread,
      removeWorkspace,
      removeWorktree,
      loadOlderThreadsForWorkspace,
      listThreadsForWorkspace,
    },
    workspaceCycling: {
      workspaces,
      groupedWorkspaces,
      threadsByWorkspace,
      getThreadRows,
      getPinTimestamp,
      pinnedThreadsVersion,
      activeWorkspaceIdRef,
      activeThreadIdRef,
      exitDiffView,
      resetPullRequestSelection,
      selectWorkspace,
      setActiveThreadId,
    },
    appMenu: {
      activeWorkspaceRef,
      baseWorkspaceRef,
      onAddWorkspace: handleAddWorkspace,
      onAddWorkspaceFromUrl: openWorkspaceFromUrlPrompt,
      onAddAgent: handleAddAgent,
      onAddWorktreeAgent: handleAddWorktreeAgent,
      onAddCloneAgent: handleAddCloneAgent,
      onToggleDebug: handleDebugClick,
      onToggleTerminal: handleToggleTerminalWithFocus,
      sidebarCollapsed,
      rightPanelCollapsed,
      onExpandSidebar: expandSidebar,
      onCollapseSidebar: collapseSidebar,
      onExpandRightPanel: expandRightPanel,
      onCollapseRightPanel: collapseRightPanel,
    },
    appSettings,
    onDebug: addDebugEntry,
  });
  useArchiveShortcut({
    isEnabled: isThreadOpen,
    shortcut: appSettings.archiveThreadShortcut,
    onTrigger: handleArchiveActiveThread,
  });
  const showCompactCodexThreadActions =
    Boolean(activeWorkspace) &&
    isCompact &&
    ((isPhone && activeTab === "codex") || (isTablet && tabletTab === "codex"));
  const showMobilePollingFetchStatus =
    showCompactCodexThreadActions &&
    Boolean(activeWorkspace?.connected) &&
    appSettings.backendMode === "remote" &&
    remoteThreadConnectionState === "polling";
  const gitRootOverride = activeWorkspace?.settings.gitRoot;
  const hasGitRootOverride =
    typeof gitRootOverride === "string" && gitRootOverride.trim().length > 0;
  const showGitInitBanner =
    Boolean(activeWorkspace) && !hasGitRootOverride && isMissingRepo(gitStatus.error);
  const displayNodes = useMainAppDisplayNodes({
    showCompactCodexThreadActions,
    handleMobileThreadRefresh,
    mobileThreadRefreshLoading,
    centerMode,
    gitDiffViewStyle,
    setGitDiffViewStyle,
    isCompact,
    rightPanelCollapsed,
    sidebarToggleProps,
    workspaceHomeProps: activeWorkspace
      ? {
          workspace: activeWorkspace,
          showGitInitBanner,
          initGitRepoLoading,
          onInitGitRepo: modalActions.openInitGitRepoPrompt,
          runs: workspaceRuns,
          recentThreadInstances,
          recentThreadsUpdatedAt,
          prompt: workspacePrompt,
          onPromptChange: setWorkspacePrompt,
          onStartRun: startWorkspaceRun,
          runMode: workspaceRunMode,
          onRunModeChange: setWorkspaceRunMode,
          models,
          selectedModelId,
          onSelectModel: setSelectedModelId,
          modelSelections: workspaceModelSelections,
          onToggleModel: toggleWorkspaceModelSelection,
          onModelCountChange: setWorkspaceModelCount,
          collaborationModes,
          selectedCollaborationModeId,
          onSelectCollaborationMode: setSelectedCollaborationModeId,
          reasoningOptions,
          selectedEffort,
          onSelectEffort: setSelectedEffort,
          reasoningSupported,
          error: workspaceRunError,
          isSubmitting: workspaceRunSubmitting,
          activeWorkspaceId,
          activeThreadId,
          threadStatusById,
          onSelectInstance: handleSelectWorkspaceInstance,
          skills,
          appsEnabled: appSettings.experimentalAppsEnabled,
          apps,
          prompts,
          files,
          onFileAutocompleteActiveChange: setFileAutocompleteActive,
          dictationEnabled: appSettings.dictationEnabled && dictationReady,
          dictationState,
          dictationLevel,
          onToggleDictation: handleToggleDictation,
          onCancelDictation: cancelDictation,
          onOpenDictationSettings: () => modalActions.openSettings("dictation"),
          dictationError,
          onDismissDictationError: clearDictationError,
          dictationHint,
          onDismissDictationHint: clearDictationHint,
          dictationTranscript,
          onDictationTranscriptHandled: clearDictationTranscript,
          textareaRef: workspaceHomeTextareaRef,
          agentMdContent,
          agentMdExists,
          agentMdTruncated,
          agentMdLoading,
          agentMdSaving,
          agentMdError,
          agentMdDirty,
          onAgentMdChange: setAgentMdContent,
          onAgentMdRefresh: () => {
            void refreshAgentMd();
          },
          onAgentMdSave: () => {
            void saveAgentMd();
          },
        }
      : null,
  });
  const { workspaceHomeNode } = displayNodes;
  const layoutSurfaces = useMainAppLayoutSurfaces({
    appSettings: {
      usageShowRemaining: appSettings.usageShowRemaining,
      composerCodeBlockCopyUseModifier:
        appSettings.composerCodeBlockCopyUseModifier,
      showMessageFilePath: appSettings.showMessageFilePath,
      openAppTargets: appSettings.openAppTargets,
      selectedOpenAppId: appSettings.selectedOpenAppId,
      experimentalAppsEnabled: appSettings.experimentalAppsEnabled,
      followUpMessageBehavior: appSettings.followUpMessageBehavior,
      composerFollowUpHintEnabled: appSettings.composerFollowUpHintEnabled,
      dictationEnabled: appSettings.dictationEnabled,
      splitChatDiffView: appSettings.splitChatDiffView,
      gitDiffIgnoreWhitespaceChanges:
        appSettings.gitDiffIgnoreWhitespaceChanges,
    },
    workspaces,
    groupedWorkspaces,
    workspaceGroupsCount: workspaceGroups.length,
    deletingWorktreeIds,
    newAgentDraftWorkspaceId,
    startingDraftThreadWorkspaceId,
    threadsByWorkspace,
    threadParentById,
    threadStatusById,
    threadResumeLoadingById,
    threadListLoadingByWorkspace,
    threadListPagingByWorkspace,
    threadListCursorByWorkspace,
    pinnedThreadsVersion,
    threadListSortKey,
    onSetThreadListSortKey: handleSetThreadListSortKey,
    threadListOrganizeMode,
    onSetThreadListOrganizeMode: setThreadListOrganizeMode,
    onRefreshAllThreads: handleRefreshAllWorkspaceThreads,
    activeWorkspace,
    activeWorkspaceId,
    activeThreadId,
    activeItems,
    userInputRequests,
    approvals,
    activeRateLimits,
    activeAccount,
    homeRateLimits,
    homeAccount,
    accountSwitching,
    onSwitchAccount: handleSwitchAccount,
    onCancelSwitchAccount: handleCancelSwitchAccount,
    onDecision: handleApprovalDecision,
    onRemember: handleApprovalRemember,
    onUserInputSubmit: handleUserInputSubmit,
    onPlanAccept: handlePlanAccept,
    onPlanSubmitChanges: handlePlanSubmitChanges,
    activePlan,
    activeTokenUsage,
    latestAgentRuns,
    isLoadingLatestAgents,
    localUsageSnapshot,
    isLoadingLocalUsage,
    localUsageError,
    onRefreshLocalUsage: () => {
      refreshLocalUsage()?.catch(() => {});
    },
    usageMetric,
    onUsageMetricChange: setUsageMetric,
    usageWorkspaceId,
    usageWorkspaceOptions,
    onUsageWorkspaceChange: setUsageWorkspaceId,
    gitState,
    selectedServiceTier: selectedServiceTier ?? null,
    composerWorkspaceState,
    promptActions,
    worktreeState,
    sidebarHandlers: sidebarMenuOrchestration,
    displayNodes,
    threadPinning: {
      pinThread,
      unpinThread,
      isThreadPinned,
      getPinTimestamp,
      getThreadArgsBadge,
    },
    workspaceDrop: {
      workspaceDropTargetRef,
      isWorkspaceDropActive: dropOverlayActive,
      workspaceDropText: dropOverlayText,
      onWorkspaceDragOver: handleWorkspaceDragOver,
      onWorkspaceDragEnter: handleWorkspaceDragEnter,
      onWorkspaceDragLeave: handleWorkspaceDragLeave,
      onWorkspaceDrop: handleWorkspaceDrop,
    },
    threadNavigation: {
      exitDiffView,
      clearDraftState,
      selectWorkspace,
      setActiveThreadId,
      resetPullRequestSelection,
      selectHome,
    },
    pullRequestComposer: {
      composerSendLabel,
      handleSelectPullRequest,
    },
    dictationUi: {
      onOpenDictationSettings: () => modalActions.openSettings('dictation'),
      dictationTranscript,
      dictationError,
      dictationHint,
    },
    openAppIconById,
    openInitGitRepoPrompt: modalActions.openInitGitRepoPrompt,
    startUncommittedReview,
    handleAddWorkspace,
    openWorkspaceFromUrlPrompt,
    handleAddAgent,
    handleAddWorktreeAgent,
    handleAddCloneAgent,
    handleOpenThreadLink,
    handleSelectOpenAppId,
    handleCopyThread,
    handleToggleTerminalWithFocus,
    launchScriptState,
    launchScriptsState,
    models,
    selectedModelId,
    onSelectModel: handleSelectModel,
    collaborationModes,
    selectedCollaborationModeId,
    onSelectCollaborationMode: handleSelectCollaborationMode,
    reasoningOptions,
    selectedEffort,
    onSelectEffort: handleSelectEffort,
    reasoningSupported,
    codexArgsOptions,
    selectedCodexArgsOverride,
    onSelectCodexArgsOverride: handleSelectCodexArgsOverride,
    accessMode,
    onSelectAccessMode: handleSelectAccessMode,
    skills,
    apps,
    prompts,
    composerInputRef,
    composerEditorSettings,
    composerEditorExpanded,
    onToggleComposerEditorExpanded: toggleComposerEditorExpanded,
    dictationReady,
    dictationState,
    dictationLevel,
    onToggleDictation: handleToggleDictation,
    onCancelDictation: cancelDictation,
    clearDictationTranscript,
    clearDictationError,
    clearDictationHint,
    composerContextActions,
    reviewPrompt,
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
    selectBranch,
    selectBranchAtIndex,
    confirmBranch,
    selectCommit,
    selectCommitAtIndex,
    confirmCommit,
    updateCustomInstructions,
    confirmCustom,
    handleComposerSendWithDraftStart,
    interruptTurn,
    terminalOpen,
    debugOpen,
    debugEntries,
    terminalTabs,
    activeTerminalId,
    onSelectTerminal,
    onNewTerminal,
    onCloseTerminal,
    terminalState,
    onClearDebug: clearDebugEntries,
    onCopyDebug: handleCopyDebug,
    onResizeDebug: onDebugPanelResizeStart,
    onResizeTerminal: onTerminalPanelResizeStart,
    isCompact,
    isPhone,
    activeTab,
    setActiveTab,
    tabletTab,
    showMobilePollingFetchStatus,
    appModalsAboutOpen:
      appModalsProps.settingsOpen && appModalsProps.settingsSection === 'about',
    updaterState,
    startUpdate,
    dismissUpdate,
    postUpdateNotice,
    dismissPostUpdateNotice,
    errorToasts,
    dismissErrorToast,
    showDebugButton,
    handleDebugClick,
  });

  const {
    sidebarNode,
    messagesNode,
    composerNode,
    approvalToastsNode,
    updateToastNode,
    errorToastsNode,
    homeNode,
    mainHeaderNode,
    desktopTopbarLeftNode,
    tabletNavNode,
    tabBarNode,
    gitDiffPanelNode,
    gitDiffViewerNode,
    planPanelNode,
    debugPanelNode,
    debugPanelFullNode,
    terminalDockNode,
    compactEmptyCodexNode,
    compactEmptyGitNode,
    compactGitBackNode,
  } = useMainAppLayoutNodes(layoutSurfaces);

  const mainMessagesNode = showWorkspaceHome ? workspaceHomeNode : messagesNode;
  const compactThreadConnectionState: "live" | "polling" | "disconnected" =
    !activeWorkspace?.connected
      ? "disconnected"
      : remoteThreadConnectionState;
  const mainAppShellProps = useMainAppShellProps({
    shell: {
      appClassName,
      isResizing,
      appStyle,
      appRef,
      sidebarToggleProps,
      shouldLoadGitHubPanelData,
      appModalsProps,
      showMobileSetupWizard,
      mobileSetupWizardProps,
    },
    gitHubPanelDataProps: {
      activeWorkspace,
      gitPanelMode,
      shouldLoadDiffs,
      diffSource,
      selectedPullRequestNumber: selectedPullRequest?.number ?? null,
      onIssuesChange: handleGitIssuesChange,
      onPullRequestsChange: handleGitPullRequestsChange,
      onPullRequestDiffsChange: handleGitPullRequestDiffsChange,
      onPullRequestCommentsChange: handleGitPullRequestCommentsChange,
    },
    appLayout: {
      isPhone,
      isTablet,
      showHome,
      showGitDetail,
      activeTab,
      tabletTab,
      centerMode,
      preloadGitDiffs: appSettings.preloadGitDiffs,
      splitChatDiffView: appSettings.splitChatDiffView,
      hasActivePlan: hasActivePlan,
      activeWorkspace: Boolean(activeWorkspace),
      sidebarNode,
      messagesNode: mainMessagesNode,
      composerNode,
      approvalToastsNode,
      updateToastNode,
      errorToastsNode,
      homeNode,
      mainHeaderNode,
      tabletNavNode,
      tabBarNode,
      gitDiffPanelNode,
      gitDiffViewerNode,
      planPanelNode,
      debugPanelNode,
      debugPanelFullNode,
      terminalDockNode,
      compactEmptyCodexNode,
      compactEmptyGitNode,
      compactGitBackNode,
      onSidebarResizeStart,
      onChatDiffSplitPositionResizeStart,
      onRightPanelResizeStart,
      onPlanPanelResizeStart,
    },
    topbar: {
      isCompact,
      desktopTopbarLeftNode,
      hasActiveWorkspace: Boolean(activeWorkspace),
      backendMode: appSettings.backendMode,
      remoteThreadConnectionState: compactThreadConnectionState,
    },
  });

  return <MainAppShell {...mainAppShellProps} />;
}
