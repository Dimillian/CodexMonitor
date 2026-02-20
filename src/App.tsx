import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import "./styles/base.css";
import "./styles/ds-tokens.css";
import "./styles/ds-modal.css";
import "./styles/ds-toast.css";
import "./styles/ds-panel.css";
import "./styles/ds-diff.css";
import "./styles/ds-popover.css";
import "./styles/buttons.css";
import "./styles/sidebar.css";
import "./styles/home.css";
import "./styles/workspace-home.css";
import "./styles/main.css";
import "./styles/messages.css";
import "./styles/approval-toasts.css";
import "./styles/error-toasts.css";
import "./styles/request-user-input.css";
import "./styles/update-toasts.css";
import "./styles/composer.css";
import "./styles/review-inline.css";
import "./styles/diff.css";
import "./styles/diff-viewer.css";
import "./styles/file-tree.css";
import "./styles/panel-tabs.css";
import "./styles/prompts.css";
import "./styles/debug.css";
import "./styles/terminal.css";
import "./styles/plan.css";
import "./styles/about.css";
import "./styles/tabbar.css";
import "./styles/worktree-modal.css";
import "./styles/clone-modal.css";
import "./styles/workspace-from-url-modal.css";
import "./styles/branch-switcher-modal.css";
import "./styles/git-init-modal.css";
import "./styles/settings.css";
import "./styles/compact-base.css";
import "./styles/compact-phone.css";
import "./styles/compact-tablet.css";
import successSoundUrl from "@/assets/success-notification.mp3";
import errorSoundUrl from "@/assets/error-notification.mp3";
import { AppLayout } from "@app/components/AppLayout";
import { AppModals } from "@app/components/AppModals";
import { MainHeaderActions } from "@app/components/MainHeaderActions";
import { useLayoutNodes } from "@/features/layout/hooks/useLayoutNodes";
import { useWorkspaceDropZone } from "@/features/workspaces/hooks/useWorkspaceDropZone";
import { useThreads } from "@threads/hooks/useThreads";
import { useWindowDrag } from "@/features/layout/hooks/useWindowDrag";
import { useGitPanelController } from "@app/hooks/useGitPanelController";
import { useGitRemote } from "@/features/git/hooks/useGitRemote";
import { useGitRepoScan } from "@/features/git/hooks/useGitRepoScan";
import { usePullRequestComposer } from "@/features/git/hooks/usePullRequestComposer";
import { usePullRequestReviewActions } from "@/features/git/hooks/usePullRequestReviewActions";
import { useGitActions } from "@/features/git/hooks/useGitActions";
import { useAutoExitEmptyDiff } from "@/features/git/hooks/useAutoExitEmptyDiff";
import { isMissingRepo } from "@/features/git/utils/repoErrors";
import { useInitGitRepoPrompt } from "@/features/git/hooks/useInitGitRepoPrompt";
import { useModels } from "@/features/models/hooks/useModels";
import { useCollaborationModes } from "@/features/collaboration/hooks/useCollaborationModes";
import { useCollaborationModeSelection } from "@/features/collaboration/hooks/useCollaborationModeSelection";
import { useSkills } from "@/features/skills/hooks/useSkills";
import { useApps } from "@/features/apps/hooks/useApps";
import { useCustomPrompts } from "@/features/prompts/hooks/useCustomPrompts";
import { useWorkspaceFileListing } from "@app/hooks/useWorkspaceFileListing";
import { useGitBranches } from "@/features/git/hooks/useGitBranches";
import { useBranchSwitcher } from "@/features/git/hooks/useBranchSwitcher";
import { useBranchSwitcherShortcut } from "@/features/git/hooks/useBranchSwitcherShortcut";
import { useWorkspaceRefreshOnFocus } from "@/features/workspaces/hooks/useWorkspaceRefreshOnFocus";
import { useWorkspaceRestore } from "@/features/workspaces/hooks/useWorkspaceRestore";
import { useRenameWorktreePrompt } from "@/features/workspaces/hooks/useRenameWorktreePrompt";
import { useLayoutController } from "@app/hooks/useLayoutController";
import { useWindowLabel } from "@/features/layout/hooks/useWindowLabel";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  SidebarCollapseButton,
  TitlebarExpandControls,
} from "@/features/layout/components/SidebarToggleControls";
import { useUpdaterController } from "@app/hooks/useUpdaterController";
import { useResponseRequiredNotificationsController } from "@app/hooks/useResponseRequiredNotificationsController";
import { useErrorToasts } from "@/features/notifications/hooks/useErrorToasts";
import { useComposerShortcuts } from "@/features/composer/hooks/useComposerShortcuts";
import { useComposerMenuActions } from "@/features/composer/hooks/useComposerMenuActions";
import { useComposerEditorState } from "@/features/composer/hooks/useComposerEditorState";
import { useComposerController } from "@app/hooks/useComposerController";
import { useComposerInsert } from "@app/hooks/useComposerInsert";
import { useRenameThreadPrompt } from "@threads/hooks/useRenameThreadPrompt";
import { useWorktreePrompt } from "@/features/workspaces/hooks/useWorktreePrompt";
import { useClonePrompt } from "@/features/workspaces/hooks/useClonePrompt";
import { useWorkspaceFromUrlPrompt } from "@/features/workspaces/hooks/useWorkspaceFromUrlPrompt";
import { useWorkspaceController } from "@app/hooks/useWorkspaceController";
import { useWorkspaceSelection } from "@/features/workspaces/hooks/useWorkspaceSelection";
import { useGitHubPanelController } from "@app/hooks/useGitHubPanelController";
import { useSettingsModalState } from "@app/hooks/useSettingsModalState";
import { useSyncSelectedDiffPath } from "@app/hooks/useSyncSelectedDiffPath";
import { useMenuAcceleratorController } from "@app/hooks/useMenuAcceleratorController";
import { useAppMenuEvents } from "@app/hooks/useAppMenuEvents";
import { usePlanReadyActions } from "@app/hooks/usePlanReadyActions";
import { useWorkspaceActions } from "@app/hooks/useWorkspaceActions";
import { useWorkspaceCycling } from "@app/hooks/useWorkspaceCycling";
import { useThreadRows } from "@app/hooks/useThreadRows";
import { useInterruptShortcut } from "@app/hooks/useInterruptShortcut";
import { useArchiveShortcut } from "@app/hooks/useArchiveShortcut";
import { useCopyThread } from "@threads/hooks/useCopyThread";
import { useTerminalController } from "@/features/terminal/hooks/useTerminalController";
import { useWorkspaceLaunchScript } from "@app/hooks/useWorkspaceLaunchScript";
import { useWorkspaceLaunchScripts } from "@app/hooks/useWorkspaceLaunchScripts";
import { useWorktreeSetupScript } from "@app/hooks/useWorktreeSetupScript";
import { useGitCommitController } from "@app/hooks/useGitCommitController";
import { WorkspaceHome } from "@/features/workspaces/components/WorkspaceHome";
import { MobileServerSetupWizard } from "@/features/mobile/components/MobileServerSetupWizard";
import { useMobileServerSetup } from "@/features/mobile/hooks/useMobileServerSetup";
import { useWorkspaceHome } from "@/features/workspaces/hooks/useWorkspaceHome";
import { useWorkspaceAgentMd } from "@/features/workspaces/hooks/useWorkspaceAgentMd";
import type {
  ComposerEditorSettings,
  WorkspaceInfo,
} from "@/types";
import { computePlanFollowupState } from "@/features/messages/utils/messageRenderUtils";
import { OPEN_APP_STORAGE_KEY } from "@app/constants";
import { useOpenAppIcons } from "@app/hooks/useOpenAppIcons";
import { useAccountSwitching } from "@app/hooks/useAccountSwitching";
import { useNewAgentDraft } from "@app/hooks/useNewAgentDraft";
import { useSystemNotificationThreadLinks } from "@app/hooks/useSystemNotificationThreadLinks";
import { useThreadListSortKey } from "@app/hooks/useThreadListSortKey";
import { useThreadListActions } from "@app/hooks/useThreadListActions";
import { useSidebarLayoutActions } from "@app/hooks/useSidebarLayoutActions";
import { useGitRootSelection } from "@app/hooks/useGitRootSelection";
import { useTabActivationGuard } from "@app/hooks/useTabActivationGuard";
import {
  REMOTE_THREAD_POLL_INTERVAL_MS,
  useRemoteThreadRefreshOnFocus,
} from "@app/hooks/useRemoteThreadRefreshOnFocus";
import { useRemoteThreadLiveConnection } from "@app/hooks/useRemoteThreadLiveConnection";
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
import { setWorkspaceRuntimeCodexArgs } from "@services/tauri";

const AboutView = lazy(() =>
  import("@/features/about/components/AboutView").then((module) => ({
    default: module.AboutView,
  })),
);

const SettingsView = lazy(() =>
  import("@settings/components/SettingsView").then((module) => ({
    default: module.SettingsView,
  })),
);

const GitHubPanelData = lazy(() =>
  import("@/features/git/components/GitHubPanelData").then((module) => ({
    default: module.GitHubPanelData,
  })),
);

function MainApp() {
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
  const { threadListSortKey, setThreadListSortKey } = useThreadListSortKey();
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
    addCloneAgent,
    addWorktreeAgent,
    connectWorkspace,
    markWorkspaceConnected,
    updateWorkspaceSettings,
    updateWorkspaceCodexBin,
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
  const {
    settingsOpen,
    settingsSection,
    openSettings,
    closeSettings,
  } = useSettingsModalState();
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
    gitIssues,
    gitIssuesTotal,
    gitIssuesLoading,
    gitIssuesError,
    gitPullRequests,
    gitPullRequestsTotal,
    gitPullRequestsLoading,
    gitPullRequestsError,
    gitPullRequestDiffs,
    gitPullRequestDiffsLoading,
    gitPullRequestDiffsError,
    gitPullRequestComments,
    gitPullRequestCommentsLoading,
    gitPullRequestCommentsError,
    handleGitIssuesChange,
    handleGitPullRequestsChange,
    handleGitPullRequestDiffsChange,
    handleGitPullRequestCommentsChange,
    resetGitHubPanelState,
  } = useGitHubPanelController();

  useEffect(() => {
    resetGitHubPanelState();
  }, [activeWorkspaceId, resetGitHubPanelState]);
  const { remote: gitRemoteUrl, refresh: refreshGitRemote } = useGitRemote(activeWorkspace);
  const {
    repos: gitRootCandidates,
    isLoading: gitRootScanLoading,
    error: gitRootScanError,
    depth: gitRootScanDepth,
    hasScanned: gitRootScanHasScanned,
    scan: scanGitRoots,
    setDepth: setGitRootScanDepth,
    clear: clearGitRootCandidates,
  } = useGitRepoScan(activeWorkspace);
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
  useEffect(() => {
    setSelectedCodexArgsOverride(normalizeCodexArgsInput(preferredCodexArgsOverride));
  }, [preferredCodexArgsOverride, threadCodexSelectionKey]);

  const {
    handleSelectModel,
    handleSelectEffort,
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
    setSelectedCollaborationModeId,
    setAccessMode,
    setSelectedCodexArgsOverride,
    persistThreadCodexParams,
  });

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
  const codexArgsOptions = useMemo(
    () =>
      buildCodexArgsOptions({
        appCodexArgs: appSettings.codexArgs ?? null,
        workspaceCodexArgs: workspaces.map((workspace) => workspace.settings.codexArgs),
        additionalCodexArgs: [selectedCodexArgsOverride],
      }),
    [appSettings.codexArgs, selectedCodexArgsOverride, workspaces],
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
    listThreadsForWorkspace,
    loadOlderThreadsForWorkspace,
    resetWorkspaceThreads,
    refreshThread,
    sendUserMessage,
    sendUserMessageToThread,
    startFork,
    startReview,
    startResume,
    startCompact,
    startApps,
    startMcp,
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
    collaborationMode: collaborationModePayload,
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
  });
  const { connectionState: remoteThreadConnectionState, reconnectLive } =
    useRemoteThreadLiveConnection({
      backendMode: appSettings.backendMode,
      activeWorkspace,
      activeThreadId,
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
  const {
    centerMode,
    setCenterMode,
    selectedDiffPath,
    setSelectedDiffPath,
    diffScrollRequestId,
    gitPanelMode,
    setGitPanelMode,
    gitDiffViewStyle,
    setGitDiffViewStyle,
    filePanelMode,
    setFilePanelMode,
    selectedPullRequest,
    setSelectedPullRequest,
    selectedCommitSha,
    setSelectedCommitSha,
    diffSource,
    setDiffSource,
    gitStatus,
    refreshGitStatus,
    queueGitStatusRefresh,
    refreshGitDiffs,
    gitLogEntries,
    gitLogTotal,
    gitLogAhead,
    gitLogBehind,
    gitLogAheadEntries,
    gitLogBehindEntries,
    gitLogUpstream,
    gitLogLoading,
    gitLogError,
    refreshGitLog,
    gitCommitDiffs,
    shouldLoadDiffs,
    activeDiffs,
    activeDiffLoading,
    activeDiffError,
    perFileDiffGroups,
    handleSelectDiff,
    handleSelectPerFileDiff,
    handleSelectCommit,
    handleActiveDiffPath,
    handleGitPanelModeChange,
    activeWorkspaceIdRef,
    activeWorkspaceRef,
  } = useGitPanelController({
    activeWorkspace,
    activeItems,
    gitDiffPreloadEnabled: appSettings.preloadGitDiffs,
    gitDiffIgnoreWhitespaceChanges: appSettings.gitDiffIgnoreWhitespaceChanges,
    splitChatDiffView: appSettings.splitChatDiffView,
    isCompact,
    isTablet,
    activeTab,
    tabletTab,
    setActiveTab,
    prDiffs: gitPullRequestDiffs,
    prDiffsLoading: gitPullRequestDiffsLoading,
    prDiffsError: gitPullRequestDiffsError,
  });
  queueGitStatusRefreshRef.current = queueGitStatusRefresh;

  const shouldLoadGitHubPanelData =
    gitPanelMode === "issues" ||
    gitPanelMode === "prs" ||
    (shouldLoadDiffs && diffSource === "pr");

  const alertError = useCallback((error: unknown) => {
    alert(error instanceof Error ? error.message : String(error));
  }, []);
  const { branches, checkoutBranch, checkoutPullRequest, createBranch } = useGitBranches({
    activeWorkspace,
    onDebug: addDebugEntry
  });
  const handleCheckoutBranch = async (name: string) => {
    await checkoutBranch(name);
    refreshGitStatus();
  };
  const handleCheckoutPullRequest = async (prNumber: number) => {
    try {
      await checkoutPullRequest(prNumber);
      await Promise.resolve(refreshGitStatus());
      await Promise.resolve(refreshGitLog());
    } catch (error) {
      alertError(error);
    }
  };
  const handleCreateBranch = async (name: string) => {
    await createBranch(name);
    refreshGitStatus();
  };
  const currentBranch = gitStatus.branchName ?? null;
  const {
    branchSwitcher,
    openBranchSwitcher,
    closeBranchSwitcher,
    handleBranchSelect,
  } = useBranchSwitcher({
    activeWorkspace,
    checkoutBranch: handleCheckoutBranch,
    setActiveWorkspaceId,
  });
  const isBranchSwitcherEnabled =
    Boolean(activeWorkspace?.connected) && activeWorkspace?.kind !== "worktree";
  useBranchSwitcherShortcut({
    shortcut: appSettings.branchSwitcherShortcut,
    isEnabled: isBranchSwitcherEnabled,
    onTrigger: openBranchSwitcher,
  });
  const {
    applyWorktreeChanges: handleApplyWorktreeChanges,
    createGitHubRepo: handleCreateGitHubRepo,
    createGitHubRepoLoading,
    initGitRepo: handleInitGitRepo,
    initGitRepoLoading,
    revertAllGitChanges: handleRevertAllGitChanges,
    revertGitFile: handleRevertGitFile,
    stageGitAll: handleStageGitAll,
    stageGitFile: handleStageGitFile,
    unstageGitFile: handleUnstageGitFile,
    worktreeApplyError,
    worktreeApplyLoading,
    worktreeApplySuccess,
  } = useGitActions({
    activeWorkspace,
    onRefreshGitStatus: refreshGitStatus,
    onRefreshGitDiffs: refreshGitDiffs,
    onClearGitRootCandidates: clearGitRootCandidates,
    onError: alertError,
  });
  const {
    initGitRepoPrompt,
    openInitGitRepoPrompt,
    handleInitGitRepoPromptBranchChange,
    handleInitGitRepoPromptCreateRemoteChange,
    handleInitGitRepoPromptRepoNameChange,
    handleInitGitRepoPromptPrivateChange,
    handleInitGitRepoPromptCancel,
    handleInitGitRepoPromptConfirm,
  } = useInitGitRepoPrompt({
    activeWorkspace,
    initGitRepo: handleInitGitRepo,
    createGitHubRepo: handleCreateGitHubRepo,
    refreshGitRemote,
    isBusy: initGitRepoLoading || createGitHubRepoLoading,
  });
  const { activeGitRoot, handleSetGitRoot, handlePickGitRoot } = useGitRootSelection({
    activeWorkspace,
    updateWorkspaceSettings,
    clearGitRootCandidates,
    refreshGitStatus,
  });
  const fileStatus =
    gitStatus.error
      ? "Git status unavailable"
      : gitStatus.files.length > 0
        ? `${gitStatus.files.length} file${
            gitStatus.files.length === 1 ? "" : "s"
          } changed`
        : "Working tree clean";

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

  useSyncSelectedDiffPath({
    diffSource,
    centerMode,
    gitPullRequestDiffs,
    gitCommitDiffs,
    perFileDiffGroups,
    selectedDiffPath,
    setSelectedDiffPath,
  });

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
    setPreferredCollabModeId,
    setPreferredCodexArgsOverride,
    activeThreadIdRef,
    pendingNewThreadSeedRef,
    selectedModelId,
    resolvedEffort,
    accessMode,
    selectedCollaborationModeId,
    selectedCodexArgsOverride,
  });

  const { handleSetThreadListSortKey, handleRefreshAllWorkspaceThreads } =
    useThreadListActions({
      threadListSortKey,
      setThreadListSortKey,
      workspaces,
      listThreadsForWorkspace,
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

  const { recordPendingThreadLink } = useSystemNotificationThreadLinks({
    hasLoadedWorkspaces: hasLoaded,
    workspacesById,
    refreshWorkspaces,
    connectWorkspace,
    setActiveTab,
    setCenterMode,
    setSelectedDiffPath,
    setActiveWorkspaceId,
    setActiveThreadId,
  });

  useEffect(() => {
    recordPendingThreadLinkRef.current = recordPendingThreadLink;
    return () => {
      recordPendingThreadLinkRef.current = () => {};
    };
  }, [recordPendingThreadLink]);

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
    renamePrompt,
    openRenamePrompt,
    handleRenamePromptChange,
    handleRenamePromptCancel,
    handleRenamePromptConfirm,
  } = useRenameThreadPrompt({
    threadsByWorkspace,
    renameThread,
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

  const handleRenameThread = useCallback(
    (workspaceId: string, threadId: string) => {
      openRenamePrompt(workspaceId, threadId);
    },
    [openRenamePrompt],
  );

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
  const {
    worktreePrompt,
    openPrompt: openWorktreePrompt,
    confirmPrompt: confirmWorktreePrompt,
    cancelPrompt: cancelWorktreePrompt,
    updateName: updateWorktreeName,
    updateBranch: updateWorktreeBranch,
    updateCopyAgentsMd: updateWorktreeCopyAgentsMd,
    updateSetupScript: updateWorktreeSetupScript,
  } = useWorktreePrompt({
    addWorktreeAgent,
    updateWorkspaceSettings,
    connectWorkspace,
    onSelectWorkspace: selectWorkspace,
    onWorktreeCreated: handleWorktreeCreated,
    onCompactActivate: isCompact ? () => setActiveTab("codex") : undefined,
    onError: (message) => {
      addDebugEntry({
        id: `${Date.now()}-client-add-worktree-error`,
        timestamp: Date.now(),
        source: "error",
        label: "worktree/add error",
        payload: message,
      });
    },
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
    clonePrompt,
    openPrompt: openClonePrompt,
    confirmPrompt: confirmClonePrompt,
    cancelPrompt: cancelClonePrompt,
    updateCopyName: updateCloneCopyName,
    chooseCopiesFolder: chooseCloneCopiesFolder,
    useSuggestedCopiesFolder: useSuggestedCloneCopiesFolder,
    clearCopiesFolder: clearCloneCopiesFolder,
  } = useClonePrompt({
    addCloneAgent,
    connectWorkspace,
    onSelectWorkspace: selectWorkspace,
    resolveProjectContext: resolveCloneProjectContext,
    persistProjectCopiesFolder,
    onCompactActivate: isCompact ? () => setActiveTab("codex") : undefined,
    onError: (message) => {
      addDebugEntry({
        id: `${Date.now()}-client-add-clone-error`,
        timestamp: Date.now(),
        source: "error",
        label: "clone/add error",
        payload: message,
      });
    },
  });


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
  const activeTokenUsage = activeThreadId
    ? tokenUsageByThread[activeThreadId] ?? null
    : null;
  const activePlan = activeThreadId
    ? planByThread[activeThreadId] ?? null
    : null;
  const hasActivePlan = Boolean(
    activePlan && (activePlan.steps.length > 0 || activePlan.explanation)
  );
  const showWorkspaceHome = Boolean(activeWorkspace && !activeThreadId && !isNewAgentDraftMode);
  const showComposer = (!isCompact
    ? centerMode === "chat" || centerMode === "diff"
    : (isTablet ? tabletTab : activeTab) === "codex") && !showWorkspaceHome;
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
  const activeTurnId = activeThreadId
    ? activeTurnIdByThread[activeThreadId] ?? null
    : null;
  const hasUserInputRequestForActiveThread = Boolean(
    activeThreadId &&
      userInputRequests.some(
        (request) =>
          request.params.thread_id === activeThreadId &&
          (!activeWorkspaceId || request.workspace_id === activeWorkspaceId),
      ),
  );

  const isPlanReadyAwaitingResponse = useMemo(() => {
    return computePlanFollowupState({
      threadId: activeThreadId,
      items: activeItems,
      isThinking: isProcessing,
      hasVisibleUserInputRequest: hasUserInputRequestForActiveThread,
    }).shouldShow;
  }, [
    activeItems,
    activeThreadId,
    hasUserInputRequestForActiveThread,
    isProcessing,
  ]);

  const queueFlushPaused = Boolean(
    appSettings.pauseQueuedMessagesWhenResponseRequired &&
      activeThreadId &&
      (hasUserInputRequestForActiveThread || isPlanReadyAwaitingResponse),
  );

  const queuePausedReason =
    queueFlushPaused && hasUserInputRequestForActiveThread
      ? "Paused — waiting for your answers."
      : queueFlushPaused && isPlanReadyAwaitingResponse
        ? "Paused — waiting for plan accept/changes."
        : null;

  const {
    activeImages,
    attachImages,
    pickImages,
    removeImage,
    clearActiveImages,
    removeImagesForThread,
    activeQueue,
    handleSend,
    queueMessage,
    prefillDraft,
    setPrefillDraft,
    composerInsert,
    setComposerInsert,
    activeDraft,
    handleDraftChange,
    handleSendPrompt,
    handleEditQueued,
    handleDeleteQueued,
    clearDraftForThread,
  } = useComposerController({
    activeThreadId,
    activeTurnId,
    activeWorkspaceId,
    activeWorkspace,
    isProcessing,
    isReviewing,
    queueFlushPaused,
    steerEnabled: appSettings.steerEnabled,
    appsEnabled: appSettings.experimentalAppsEnabled,
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
  });

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
  } = useWorkspaceHome({
    activeWorkspace,
    models,
    selectedModelId,
    effort: resolvedEffort,
    collaborationMode: collaborationModePayload,
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
    draftText: showWorkspaceHome ? workspacePrompt : activeDraft,
    onDraftChange: showWorkspaceHome ? setWorkspacePrompt : handleDraftChange,
    textareaRef: showWorkspaceHome ? workspaceHomeTextareaRef : composerInputRef,
  });
  const RECENT_THREAD_LIMIT = 8;
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
  } = useWorkspaceAgentMd({
    activeWorkspace,
    onDebug: addDebugEntry,
  });

  const {
    commitMessage,
    commitMessageLoading,
    commitMessageError,
    commitLoading,
    pullLoading,
    fetchLoading,
    pushLoading,
    syncLoading,
    commitError,
    pullError,
    fetchError,
    pushError,
    syncError,
    onCommitMessageChange: handleCommitMessageChange,
    onGenerateCommitMessage: handleGenerateCommitMessage,
    onCommit: handleCommit,
    onCommitAndPush: handleCommitAndPush,
    onCommitAndSync: handleCommitAndSync,
    onPull: handlePull,
    onFetch: handleFetch,
    onPush: handlePush,
    onSync: handleSync,
  } = useGitCommitController({
    activeWorkspace,
    activeWorkspaceId,
    activeWorkspaceIdRef,
    gitStatus,
    refreshGitStatus,
    refreshGitLog,
  });

  const handleSendPromptToNewAgent = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!activeWorkspace || !trimmed) {
        return;
      }
      if (!activeWorkspace.connected) {
        await connectWorkspace(activeWorkspace);
      }
      const threadId = await startThreadForWorkspace(activeWorkspace.id, {
        activate: false,
      });
      if (!threadId) {
        return;
      }
      await sendUserMessageToThread(activeWorkspace, threadId, trimmed, []);
    },
    [activeWorkspace, connectWorkspace, sendUserMessageToThread, startThreadForWorkspace],
  );


  const handleCreatePrompt = useCallback(
    async (data: {
      scope: "workspace" | "global";
      name: string;
      description?: string | null;
      argumentHint?: string | null;
      content: string;
    }) => {
      try {
        await createPrompt(data);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, createPrompt],
  );

  const handleUpdatePrompt = useCallback(
    async (data: {
      path: string;
      name: string;
      description?: string | null;
      argumentHint?: string | null;
      content: string;
    }) => {
      try {
        await updatePrompt(data);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, updatePrompt],
  );

  const handleDeletePrompt = useCallback(
    async (path: string) => {
      try {
        await deletePrompt(path);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, deletePrompt],
  );

  const handleMovePrompt = useCallback(
    async (data: { path: string; scope: "workspace" | "global" }) => {
      try {
        await movePrompt(data);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, movePrompt],
  );

  const handleRevealWorkspacePrompts = useCallback(async () => {
    try {
      const path = await getWorkspacePromptsDir();
      await revealItemInDir(path);
    } catch (error) {
      alertError(error);
    }
  }, [alertError, getWorkspacePromptsDir]);

  const handleRevealGeneralPrompts = useCallback(async () => {
    try {
      const path = await getGlobalPromptsDir();
      if (!path) {
        return;
      }
      await revealItemInDir(path);
    } catch (error) {
      alertError(error);
    }
  }, [alertError, getGlobalPromptsDir]);

  const isWorktreeWorkspace = activeWorkspace?.kind === "worktree";
  const activeParentWorkspace = isWorktreeWorkspace
    ? workspacesById.get(activeWorkspace?.parentId ?? "") ?? null
    : null;
  const worktreeLabel = isWorktreeWorkspace
    ? (activeWorkspace?.name?.trim() || activeWorkspace?.worktree?.branch) ?? null
    : null;
  const activeRenamePrompt =
    renameWorktreePrompt?.workspaceId === activeWorkspace?.id
      ? renameWorktreePrompt
      : null;
  const worktreeRename =
    isWorktreeWorkspace && activeWorkspace
      ? {
          name: activeRenamePrompt?.name ?? worktreeLabel ?? "",
          error: activeRenamePrompt?.error ?? null,
          notice: renameWorktreeNotice,
          isSubmitting: activeRenamePrompt?.isSubmitting ?? false,
          isDirty: activeRenamePrompt
            ? activeRenamePrompt.name.trim() !==
              activeRenamePrompt.originalName.trim()
            : false,
          upstream:
            renameWorktreeUpstreamPrompt?.workspaceId === activeWorkspace.id
              ? {
                  oldBranch: renameWorktreeUpstreamPrompt.oldBranch,
                  newBranch: renameWorktreeUpstreamPrompt.newBranch,
                  error: renameWorktreeUpstreamPrompt.error,
                  isSubmitting: renameWorktreeUpstreamPrompt.isSubmitting,
                  onConfirm: confirmRenameWorktreeUpstream,
                }
              : null,
          onFocus: handleOpenRenameWorktree,
          onChange: handleRenameWorktreeChange,
          onCancel: handleRenameWorktreeCancel,
          onCommit: handleRenameWorktreeConfirm,
        }
      : null;
  const baseWorkspaceRef = useRef(activeParentWorkspace ?? activeWorkspace);

  useEffect(() => {
    baseWorkspaceRef.current = activeParentWorkspace ?? activeWorkspace;
  }, [activeParentWorkspace, activeWorkspace]);

  useTabActivationGuard({
    activeTab,
    isTablet,
    setActiveTab,
  });

  useWindowDrag("titlebar");
  useWorkspaceRestore({
    workspaces,
    hasLoaded,
    connectWorkspace,
    listThreadsForWorkspace
  });
  useWorkspaceRefreshOnFocus({
    workspaces,
    refreshWorkspaces,
    listThreadsForWorkspace
  });

  useRemoteThreadRefreshOnFocus({
    backendMode: appSettings.backendMode,
    activeWorkspace,
    activeThreadId,
    activeThreadIsProcessing: Boolean(
      activeThreadId && threadStatusById[activeThreadId]?.isProcessing,
    ),
    suspendPolling:
      appSettings.backendMode === "remote" &&
      remoteThreadConnectionState === "live",
    reconnectWorkspace: connectWorkspace,
    refreshThread,
  });

  const {
    handleAddWorkspace,
    handleAddWorkspacesFromPaths,
    handleAddWorkspaceFromGitUrl,
    handleAddAgent,
    handleAddWorktreeAgent,
    handleAddCloneAgent,
  } = useWorkspaceActions({
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
    openWorktreePrompt,
    openClonePrompt,
    composerInputRef,
    onDebug: addDebugEntry,
  });

  const handleDropWorkspacePaths = useCallback(
    async (paths: string[]) => {
      const uniquePaths = Array.from(
        new Set(paths.filter((path) => path.length > 0)),
      );
      if (uniquePaths.length === 0) {
        return;
      }
      void handleAddWorkspacesFromPaths(uniquePaths);
    },
    [handleAddWorkspacesFromPaths],
  );

  const {
    dropTargetRef: workspaceDropTargetRef,
    isDragOver: isWorkspaceDropActive,
    handleDragOver: handleWorkspaceDragOver,
    handleDragEnter: handleWorkspaceDragEnter,
    handleDragLeave: handleWorkspaceDragLeave,
    handleDrop: handleWorkspaceDrop,
  } = useWorkspaceDropZone({
    onDropPaths: handleDropWorkspacePaths,
  });

  useInterruptShortcut({
    isEnabled: canInterrupt,
    shortcut: appSettings.interruptShortcut,
    onTrigger: () => {
      void interruptTurn();
    },
  });

  const {
    isLaunchingReview: isLaunchingPullRequestReview,
    lastReviewThreadId: lastPullRequestReviewThreadId,
    reviewActions: pullRequestReviewActions,
    runPullRequestReview,
  } = usePullRequestReviewActions({
    activeWorkspace,
    pullRequest: selectedPullRequest,
    pullRequestDiffs: gitPullRequestDiffs,
    pullRequestComments: gitPullRequestComments,
    connectWorkspace,
    startThreadForWorkspace,
    sendUserMessageToThread,
  });

  const {
    handleSelectPullRequest,
    resetPullRequestSelection,
    composerContextActions,
    composerSendLabel,
    handleComposerSend,
    handleComposerQueue,
  } = usePullRequestComposer({
    activeWorkspace,
    selectedPullRequest,
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
    clearActiveImages,
    handleSend,
    queueMessage,
  });

  const {
    handleComposerSendWithDraftStart,
    handleComposerQueueWithDraftStart,
    handleSelectWorkspaceInstance,
    handleOpenThreadLink,
    handleArchiveActiveThread,
  } = useThreadUiOrchestration({
    activeWorkspaceId,
    activeThreadId,
    accessMode,
    selectedCollaborationModeId,
    selectedCodexArgsOverride,
    pendingNewThreadSeedRef,
    runWithDraftStart,
    handleComposerSend,
    handleComposerQueue,
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

  const { handlePlanAccept, handlePlanSubmitChanges } = usePlanReadyActions({
    activeWorkspace,
    activeThreadId,
    collaborationModes,
    resolvedModel,
    resolvedEffort,
    connectWorkspace,
    sendUserMessageToThread,
    setSelectedCollaborationModeId,
  });

  const { handleMoveWorkspace } = useWorkspaceOrderingOrchestration({
    workspaces,
    workspacesById,
    updateWorkspaceSettings,
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

  const {
    onOpenSettings: handleSidebarOpenSettings,
    onSelectHome: handleSidebarSelectHome,
    onSelectWorkspace: handleSidebarSelectWorkspace,
    onConnectWorkspace: handleSidebarConnectWorkspace,
    onToggleWorkspaceCollapse: handleSidebarToggleWorkspaceCollapse,
    onSelectThread: handleSidebarSelectThread,
    onDeleteThread: handleSidebarDeleteThread,
    onSyncThread: handleSidebarSyncThread,
    onRenameThread: handleSidebarRenameThread,
    onDeleteWorkspace: handleSidebarDeleteWorkspace,
    onDeleteWorktree: handleSidebarDeleteWorktree,
    onLoadOlderThreads: handleSidebarLoadOlderThreads,
    onReloadWorkspaceThreads: handleSidebarReloadWorkspaceThreads,
  } = useSidebarLayoutActions({
    openSettings,
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
  });

  useArchiveShortcut({
    isEnabled: isThreadOpen,
    shortcut: appSettings.archiveThreadShortcut,
    onTrigger: handleArchiveActiveThread,
  });

  const { handleCycleAgent, handleCycleWorkspace } = useWorkspaceCycling({
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
  });

  useAppMenuEvents({
    activeWorkspaceRef,
    baseWorkspaceRef,
    onAddWorkspace: () => {
      void handleAddWorkspace();
    },
    onAddWorkspaceFromUrl: () => {
      openWorkspaceFromUrlPrompt();
    },
    onAddAgent: (workspace) => {
      void handleAddAgent(workspace);
    },
    onAddWorktreeAgent: (workspace) => {
      void handleAddWorktreeAgent(workspace);
    },
    onAddCloneAgent: (workspace) => {
      void handleAddCloneAgent(workspace);
    },
    onOpenSettings: handleSidebarOpenSettings,
    onCycleAgent: handleCycleAgent,
    onCycleWorkspace: handleCycleWorkspace,
    onToggleDebug: handleDebugClick,
    onToggleTerminal: handleToggleTerminalWithFocus,
    sidebarCollapsed,
    rightPanelCollapsed,
    onExpandSidebar: expandSidebar,
    onCollapseSidebar: collapseSidebar,
    onExpandRightPanel: expandRightPanel,
    onCollapseRightPanel: collapseRightPanel,
  });

  useMenuAcceleratorController({ appSettings, onDebug: addDebugEntry });
  const showCompactCodexThreadActions =
    Boolean(activeWorkspace) &&
    isCompact &&
    ((isPhone && activeTab === "codex") || (isTablet && tabletTab === "codex"));
  const showMobilePollingFetchStatus =
    showCompactCodexThreadActions &&
    Boolean(activeWorkspace?.connected) &&
    appSettings.backendMode === "remote" &&
    remoteThreadConnectionState === "polling";

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
  } = useLayoutNodes({
    workspaces,
    groupedWorkspaces,
    hasWorkspaceGroups: workspaceGroups.length > 0,
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
    onRefreshAllThreads: handleRefreshAllWorkspaceThreads,
    activeWorkspaceId,
    activeThreadId,
    activeItems,
    showPollingFetchStatus: showMobilePollingFetchStatus,
    pollingIntervalMs: REMOTE_THREAD_POLL_INTERVAL_MS,
    activeRateLimits,
    usageShowRemaining: appSettings.usageShowRemaining,
    accountInfo: activeAccount,
    onSwitchAccount: handleSwitchAccount,
    onCancelSwitchAccount: handleCancelSwitchAccount,
    accountSwitching,
    codeBlockCopyUseModifier: appSettings.composerCodeBlockCopyUseModifier,
    showMessageFilePath: appSettings.showMessageFilePath,
    openAppTargets: appSettings.openAppTargets,
    openAppIconById,
    selectedOpenAppId: appSettings.selectedOpenAppId,
    onSelectOpenAppId: handleSelectOpenAppId,
    approvals,
    userInputRequests,
    handleApprovalDecision,
    handleApprovalRemember,
    handleUserInputSubmit,
    onPlanAccept: handlePlanAccept,
    onPlanSubmitChanges: handlePlanSubmitChanges,
    onOpenSettings: handleSidebarOpenSettings,
    onOpenDictationSettings: () => openSettings("dictation"),
    onOpenDebug: handleDebugClick,
    showDebugButton,
    onAddWorkspace: handleAddWorkspace,
    onAddWorkspaceFromUrl: openWorkspaceFromUrlPrompt,
    onSelectHome: handleSidebarSelectHome,
    onSelectWorkspace: handleSidebarSelectWorkspace,
    onConnectWorkspace: handleSidebarConnectWorkspace,
    onAddAgent: handleAddAgent,
    onAddWorktreeAgent: handleAddWorktreeAgent,
    onAddCloneAgent: handleAddCloneAgent,
    onToggleWorkspaceCollapse: handleSidebarToggleWorkspaceCollapse,
    onSelectThread: handleSidebarSelectThread,
    onOpenThreadLink: handleOpenThreadLink,
    onDeleteThread: handleSidebarDeleteThread,
    onSyncThread: handleSidebarSyncThread,
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    onRenameThread: handleSidebarRenameThread,
    onDeleteWorkspace: handleSidebarDeleteWorkspace,
    onDeleteWorktree: handleSidebarDeleteWorktree,
    onLoadOlderThreads: handleSidebarLoadOlderThreads,
    onReloadWorkspaceThreads: handleSidebarReloadWorkspaceThreads,
    updaterState,
    onUpdate: startUpdate,
    onDismissUpdate: dismissUpdate,
    postUpdateNotice,
    onDismissPostUpdateNotice: dismissPostUpdateNotice,
    errorToasts,
    onDismissErrorToast: dismissErrorToast,
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
    onSelectHomeThread: (workspaceId, threadId) => {
      exitDiffView();
      clearDraftState();
      selectWorkspace(workspaceId);
      setActiveThreadId(threadId, workspaceId);
      if (isCompact) {
        setActiveTab("codex");
      }
    },
    activeWorkspace,
    activeParentWorkspace,
    worktreeLabel,
    worktreeRename: worktreeRename ?? undefined,
    isWorktreeWorkspace,
    branchName: gitStatus.branchName || "unknown",
    branches,
    onCheckoutBranch: handleCheckoutBranch,
    onCheckoutPullRequest: (pullRequest) =>
      handleCheckoutPullRequest(pullRequest.number),
    onCreateBranch: handleCreateBranch,
    onCopyThread: handleCopyThread,
    onToggleTerminal: handleToggleTerminalWithFocus,
    showTerminalButton: !isCompact,
    showWorkspaceTools: !isCompact,
    launchScript: launchScriptState.launchScript,
    launchScriptEditorOpen: launchScriptState.editorOpen,
    launchScriptDraft: launchScriptState.draftScript,
    launchScriptSaving: launchScriptState.isSaving,
    launchScriptError: launchScriptState.error,
    onRunLaunchScript: launchScriptState.onRunLaunchScript,
    onOpenLaunchScriptEditor: launchScriptState.onOpenEditor,
    onCloseLaunchScriptEditor: launchScriptState.onCloseEditor,
    onLaunchScriptDraftChange: launchScriptState.onDraftScriptChange,
    onSaveLaunchScript: launchScriptState.onSaveLaunchScript,
    launchScriptsState,
    mainHeaderActionsNode: (
      <>
        {showCompactCodexThreadActions ? (
          <button
            type="button"
            className="ghost main-header-action"
            onClick={handleMobileThreadRefresh}
            data-tauri-drag-region="false"
            aria-label="Refresh current thread from server"
            title="Refresh current thread from server"
            disabled={mobileThreadRefreshLoading}
          >
            <RefreshCw
              className={`compact-codex-refresh-icon${mobileThreadRefreshLoading ? " spinning" : ""}`}
              size={14}
              aria-hidden
            />
          </button>
        ) : null}
        <MainHeaderActions
          centerMode={centerMode}
          gitDiffViewStyle={gitDiffViewStyle}
          onSelectDiffViewStyle={setGitDiffViewStyle}
          isCompact={isCompact}
          rightPanelCollapsed={rightPanelCollapsed}
          sidebarToggleProps={sidebarToggleProps}
        />
      </>
    ),
    filePanelMode,
    onFilePanelModeChange: setFilePanelMode,
    fileTreeLoading: isFilesLoading,
    centerMode,
    splitChatDiffView: appSettings.splitChatDiffView,
    onExitDiff: () => {
      setCenterMode("chat");
      setSelectedDiffPath(null);
    },
    activeTab,
    onSelectTab: (tab) => {
      if (tab === "home") {
        resetPullRequestSelection();
        clearDraftState();
        selectHome();
        return;
      }
      setActiveTab(tab);
    },
    tabletNavTab: tabletTab,
    gitPanelMode,
    onGitPanelModeChange: handleGitPanelModeChange,
    isPhone,
    gitDiffViewStyle,
    gitDiffIgnoreWhitespaceChanges:
      appSettings.gitDiffIgnoreWhitespaceChanges && diffSource !== "pr",
    worktreeApplyLabel: "apply",
    worktreeApplyTitle: activeParentWorkspace?.name
      ? `Apply changes to ${activeParentWorkspace.name}`
      : "Apply changes to parent workspace",
    worktreeApplyLoading: isWorktreeWorkspace ? worktreeApplyLoading : false,
    worktreeApplyError: isWorktreeWorkspace ? worktreeApplyError : null,
    worktreeApplySuccess: isWorktreeWorkspace ? worktreeApplySuccess : false,
    onApplyWorktreeChanges: isWorktreeWorkspace
      ? handleApplyWorktreeChanges
      : undefined,
    gitStatus,
    fileStatus,
    perFileDiffGroups,
    hasActiveGitDiffs: activeDiffs.length > 0,
    selectedDiffPath,
    diffScrollRequestId,
    onSelectDiff: handleSelectDiff,
    onSelectPerFileDiff: handleSelectPerFileDiff,
    diffSource,
    gitLogEntries,
    gitLogTotal,
    gitLogAhead,
    gitLogBehind,
    gitLogAheadEntries,
    gitLogBehindEntries,
    gitLogUpstream,
    gitLogError,
    gitLogLoading,
    selectedCommitSha,
    gitIssues,
    gitIssuesTotal,
    gitIssuesLoading,
    gitIssuesError,
    gitPullRequests,
    gitPullRequestsTotal,
    gitPullRequestsLoading,
    gitPullRequestsError,
    selectedPullRequestNumber: selectedPullRequest?.number ?? null,
    selectedPullRequest: diffSource === "pr" ? selectedPullRequest : null,
    selectedPullRequestComments: diffSource === "pr" ? gitPullRequestComments : [],
    selectedPullRequestCommentsLoading: gitPullRequestCommentsLoading,
    selectedPullRequestCommentsError: gitPullRequestCommentsError,
    pullRequestReviewActions,
    onRunPullRequestReview: runPullRequestReview,
    pullRequestReviewLaunching: isLaunchingPullRequestReview,
    pullRequestReviewThreadId: lastPullRequestReviewThreadId,
    onSelectPullRequest: (pullRequest) => {
      setSelectedCommitSha(null);
      handleSelectPullRequest(pullRequest);
    },
    onSelectCommit: (entry) => {
      handleSelectCommit(entry.sha);
    },
    gitRemoteUrl,
    gitRoot: activeGitRoot,
    gitRootCandidates,
    gitRootScanDepth,
    gitRootScanLoading,
    gitRootScanError,
    gitRootScanHasScanned,
    onGitRootScanDepthChange: setGitRootScanDepth,
    onScanGitRoots: scanGitRoots,
    onSelectGitRoot: (path) => {
      void handleSetGitRoot(path);
    },
    onClearGitRoot: () => {
      void handleSetGitRoot(null);
    },
    onPickGitRoot: handlePickGitRoot,
    onInitGitRepo: openInitGitRepoPrompt,
    initGitRepoLoading,
    onStageGitAll: handleStageGitAll,
    onStageGitFile: handleStageGitFile,
    onUnstageGitFile: handleUnstageGitFile,
    onRevertGitFile: handleRevertGitFile,
    onRevertAllGitChanges: handleRevertAllGitChanges,
    gitDiffs: activeDiffs,
    gitDiffLoading: activeDiffLoading,
    gitDiffError: activeDiffError,
    onDiffActivePathChange: handleActiveDiffPath,
    commitMessage,
    commitMessageLoading,
    commitMessageError,
    onCommitMessageChange: handleCommitMessageChange,
    onGenerateCommitMessage: handleGenerateCommitMessage,
    onCommit: handleCommit,
    onCommitAndPush: handleCommitAndPush,
    onCommitAndSync: handleCommitAndSync,
    onPull: handlePull,
    onFetch: handleFetch,
    onPush: handlePush,
    onSync: handleSync,
    commitLoading,
    pullLoading,
    fetchLoading,
    pushLoading,
    syncLoading,
    commitError,
    pullError,
    fetchError,
    pushError,
    syncError,
    commitsAhead: gitLogAhead,
    onSendPrompt: handleSendPrompt,
    onSendPromptToNewAgent: handleSendPromptToNewAgent,
    onCreatePrompt: handleCreatePrompt,
    onUpdatePrompt: handleUpdatePrompt,
    onDeletePrompt: handleDeletePrompt,
    onMovePrompt: handleMovePrompt,
    onRevealWorkspacePrompts: handleRevealWorkspacePrompts,
    onRevealGeneralPrompts: handleRevealGeneralPrompts,
    canRevealGeneralPrompts: Boolean(activeWorkspace),
    onSend: handleComposerSendWithDraftStart,
    onQueue: handleComposerQueueWithDraftStart,
    onStop: interruptTurn,
    canStop: canInterrupt,
    onFileAutocompleteActiveChange: setFileAutocompleteActive,
    isReviewing,
    isProcessing,
    steerEnabled: appSettings.steerEnabled,
    reviewPrompt,
    onReviewPromptClose: closeReviewPrompt,
    onReviewPromptShowPreset: showPresetStep,
    onReviewPromptChoosePreset: choosePreset,
    highlightedPresetIndex,
    onReviewPromptHighlightPreset: setHighlightedPresetIndex,
    highlightedBranchIndex,
    onReviewPromptHighlightBranch: setHighlightedBranchIndex,
    highlightedCommitIndex,
    onReviewPromptHighlightCommit: setHighlightedCommitIndex,
    onReviewPromptKeyDown: handleReviewPromptKeyDown,
    onReviewPromptSelectBranch: selectBranch,
    onReviewPromptSelectBranchAtIndex: selectBranchAtIndex,
    onReviewPromptConfirmBranch: confirmBranch,
    onReviewPromptSelectCommit: selectCommit,
    onReviewPromptSelectCommitAtIndex: selectCommitAtIndex,
    onReviewPromptConfirmCommit: confirmCommit,
    onReviewPromptUpdateCustomInstructions: updateCustomInstructions,
    onReviewPromptConfirmCustom: confirmCustom,
    activeTokenUsage,
    activeQueue,
    queuePausedReason,
    draftText: activeDraft,
    onDraftChange: handleDraftChange,
    activeImages,
    onPickImages: pickImages,
    onAttachImages: attachImages,
    onRemoveImage: removeImage,
    prefillDraft,
    onPrefillHandled: (id) => {
      if (prefillDraft?.id === id) {
        setPrefillDraft(null);
      }
    },
    insertText: composerInsert,
    onInsertHandled: (id) => {
      if (composerInsert?.id === id) {
        setComposerInsert(null);
      }
    },
    onEditQueued: handleEditQueued,
    onDeleteQueued: handleDeleteQueued,
    collaborationModes,
    selectedCollaborationModeId,
    onSelectCollaborationMode: handleSelectCollaborationMode,
    codexArgsOptions,
    selectedCodexArgsOverride,
    onSelectCodexArgsOverride: handleSelectCodexArgsOverride,
    models,
    selectedModelId,
    onSelectModel: handleSelectModel,
    reasoningOptions,
    selectedEffort,
    onSelectEffort: handleSelectEffort,
    reasoningSupported,
    accessMode,
    onSelectAccessMode: handleSelectAccessMode,
    skills,
    appsEnabled: appSettings.experimentalAppsEnabled,
    apps,
    prompts,
    files,
    onInsertComposerText: handleInsertComposerText,
    canInsertComposerText,
    textareaRef: composerInputRef,
    composerEditorSettings,
    composerEditorExpanded,
    onToggleComposerEditorExpanded: toggleComposerEditorExpanded,
    dictationEnabled: appSettings.dictationEnabled && dictationReady,
    dictationState,
    dictationLevel,
    onToggleDictation: handleToggleDictation,
    dictationTranscript,
    onDictationTranscriptHandled: (id) => {
      clearDictationTranscript(id);
    },
    dictationError,
    onDismissDictationError: clearDictationError,
    dictationHint,
    onDismissDictationHint: clearDictationHint,
    composerContextActions,
    composerSendLabel,
    showComposer,
    plan: activePlan,
    debugEntries,
    debugOpen,
    terminalOpen,
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
    onBackFromDiff: () => {
      setCenterMode("chat");
    },
    onShowSelectedDiff: () => {
      const fallbackPath =
        selectedDiffPath ?? activeDiffs[0]?.path;

      if (!fallbackPath) {
        return;
      }

      if (!selectedDiffPath) {
        setSelectedDiffPath(fallbackPath);
      }

      setCenterMode("diff");
      if (isPhone) {
        setActiveTab("git");
      }
    },
    onGoProjects: () => setActiveTab("projects"),
    workspaceDropTargetRef,
    isWorkspaceDropActive: dropOverlayActive,
    workspaceDropText: dropOverlayText,
    onWorkspaceDragOver: handleWorkspaceDragOver,
    onWorkspaceDragEnter: handleWorkspaceDragEnter,
    onWorkspaceDragLeave: handleWorkspaceDragLeave,
    onWorkspaceDrop: handleWorkspaceDrop,
    getThreadArgsBadge,
  });

  const gitRootOverride = activeWorkspace?.settings.gitRoot;
  const hasGitRootOverride =
    typeof gitRootOverride === "string" && gitRootOverride.trim().length > 0;
  const showGitInitBanner =
    Boolean(activeWorkspace) && !hasGitRootOverride && isMissingRepo(gitStatus.error);

  const workspaceHomeNode = activeWorkspace ? (
    <WorkspaceHome
      workspace={activeWorkspace}
      showGitInitBanner={showGitInitBanner}
      initGitRepoLoading={initGitRepoLoading}
      onInitGitRepo={openInitGitRepoPrompt}
      runs={workspaceRuns}
      recentThreadInstances={recentThreadInstances}
      recentThreadsUpdatedAt={recentThreadsUpdatedAt}
      prompt={workspacePrompt}
      onPromptChange={setWorkspacePrompt}
      onStartRun={startWorkspaceRun}
      runMode={workspaceRunMode}
      onRunModeChange={setWorkspaceRunMode}
      models={models}
      selectedModelId={selectedModelId}
      onSelectModel={setSelectedModelId}
      modelSelections={workspaceModelSelections}
      onToggleModel={toggleWorkspaceModelSelection}
      onModelCountChange={setWorkspaceModelCount}
      collaborationModes={collaborationModes}
      selectedCollaborationModeId={selectedCollaborationModeId}
      onSelectCollaborationMode={setSelectedCollaborationModeId}
      reasoningOptions={reasoningOptions}
      selectedEffort={selectedEffort}
      onSelectEffort={setSelectedEffort}
      reasoningSupported={reasoningSupported}
      error={workspaceRunError}
      isSubmitting={workspaceRunSubmitting}
      activeWorkspaceId={activeWorkspaceId}
      activeThreadId={activeThreadId}
      threadStatusById={threadStatusById}
      onSelectInstance={handleSelectWorkspaceInstance}
      skills={skills}
      appsEnabled={appSettings.experimentalAppsEnabled}
      apps={apps}
      prompts={prompts}
      files={files}
      onFileAutocompleteActiveChange={setFileAutocompleteActive}
      dictationEnabled={appSettings.dictationEnabled && dictationReady}
      dictationState={dictationState}
      dictationLevel={dictationLevel}
      onToggleDictation={handleToggleDictation}
      onOpenDictationSettings={() => openSettings("dictation")}
      dictationError={dictationError}
      onDismissDictationError={clearDictationError}
      dictationHint={dictationHint}
      onDismissDictationHint={clearDictationHint}
      dictationTranscript={dictationTranscript}
      onDictationTranscriptHandled={clearDictationTranscript}
      textareaRef={workspaceHomeTextareaRef}
      agentMdContent={agentMdContent}
      agentMdExists={agentMdExists}
      agentMdTruncated={agentMdTruncated}
      agentMdLoading={agentMdLoading}
      agentMdSaving={agentMdSaving}
      agentMdError={agentMdError}
      agentMdDirty={agentMdDirty}
      onAgentMdChange={setAgentMdContent}
      onAgentMdRefresh={() => {
        void refreshAgentMd();
      }}
      onAgentMdSave={() => {
        void saveAgentMd();
      }}
    />
  ) : null;

  const mainMessagesNode = showWorkspaceHome ? workspaceHomeNode : messagesNode;
  const showCompactThreadConnectionIndicator =
    showCompactCodexThreadActions && Boolean(activeThreadId) && activeItems.length > 0;
  const compactThreadConnectionState: "live" | "polling" | "disconnected" =
    !activeWorkspace?.connected
      ? "disconnected"
      : appSettings.backendMode === "remote"
        ? remoteThreadConnectionState
        : "live";
  const codexTopbarActionsNode = showCompactThreadConnectionIndicator ? (
    <span
      className={`compact-workspace-live-indicator ${
        compactThreadConnectionState === "live"
          ? "is-live"
          : compactThreadConnectionState === "polling"
            ? "is-polling"
            : "is-disconnected"
      }`}
      title={
        compactThreadConnectionState === "live"
          ? "Receiving live thread events"
          : compactThreadConnectionState === "polling"
            ? "Connected, syncing thread state by polling"
            : "Disconnected from backend"
      }
    >
      {compactThreadConnectionState === "live"
        ? "Live"
        : compactThreadConnectionState === "polling"
          ? "Polling"
          : "Disconnected"}
    </span>
  ) : null;

  const desktopTopbarLeftNodeWithToggle = !isCompact ? (
    <div className="topbar-leading">
      <SidebarCollapseButton {...sidebarToggleProps} />
      {desktopTopbarLeftNode}
    </div>
  ) : (
    desktopTopbarLeftNode
  );

  return (
    <div className={`${appClassName}${isResizing ? " is-resizing" : ""}`} style={appStyle} ref={appRef}>
      <div className="drag-strip" id="titlebar" data-tauri-drag-region />
      <TitlebarExpandControls {...sidebarToggleProps} />
      {shouldLoadGitHubPanelData ? (
        <Suspense fallback={null}>
          <GitHubPanelData
            activeWorkspace={activeWorkspace}
            gitPanelMode={gitPanelMode}
            shouldLoadDiffs={shouldLoadDiffs}
            diffSource={diffSource}
            selectedPullRequestNumber={selectedPullRequest?.number ?? null}
            onIssuesChange={handleGitIssuesChange}
            onPullRequestsChange={handleGitPullRequestsChange}
            onPullRequestDiffsChange={handleGitPullRequestDiffsChange}
            onPullRequestCommentsChange={handleGitPullRequestCommentsChange}
          />
        </Suspense>
      ) : null}
      <AppLayout
        isPhone={isPhone}
        isTablet={isTablet}
        showHome={showHome}
        showGitDetail={showGitDetail}
        activeTab={activeTab}
        tabletTab={tabletTab}
        centerMode={centerMode}
        preloadGitDiffs={appSettings.preloadGitDiffs}
        splitChatDiffView={appSettings.splitChatDiffView}
        hasActivePlan={hasActivePlan}
        activeWorkspace={Boolean(activeWorkspace)}
        sidebarNode={sidebarNode}
        messagesNode={mainMessagesNode}
        composerNode={composerNode}
        approvalToastsNode={approvalToastsNode}
        updateToastNode={updateToastNode}
        errorToastsNode={errorToastsNode}
        homeNode={homeNode}
        mainHeaderNode={mainHeaderNode}
        desktopTopbarLeftNode={desktopTopbarLeftNodeWithToggle}
        codexTopbarActionsNode={codexTopbarActionsNode}
        tabletNavNode={tabletNavNode}
        tabBarNode={tabBarNode}
        gitDiffPanelNode={gitDiffPanelNode}
        gitDiffViewerNode={gitDiffViewerNode}
        planPanelNode={planPanelNode}
        debugPanelNode={debugPanelNode}
        debugPanelFullNode={debugPanelFullNode}
        terminalDockNode={terminalDockNode}
        compactEmptyCodexNode={compactEmptyCodexNode}
        compactEmptyGitNode={compactEmptyGitNode}
        compactGitBackNode={compactGitBackNode}
        onSidebarResizeStart={onSidebarResizeStart}
        onChatDiffSplitPositionResizeStart={onChatDiffSplitPositionResizeStart}
        onRightPanelResizeStart={onRightPanelResizeStart}
        onPlanPanelResizeStart={onPlanPanelResizeStart}
      />
      <AppModals
        renamePrompt={renamePrompt}
        onRenamePromptChange={handleRenamePromptChange}
        onRenamePromptCancel={handleRenamePromptCancel}
        onRenamePromptConfirm={handleRenamePromptConfirm}
        initGitRepoPrompt={initGitRepoPrompt}
        initGitRepoPromptBusy={initGitRepoLoading || createGitHubRepoLoading}
        onInitGitRepoPromptBranchChange={handleInitGitRepoPromptBranchChange}
        onInitGitRepoPromptCreateRemoteChange={handleInitGitRepoPromptCreateRemoteChange}
        onInitGitRepoPromptRepoNameChange={handleInitGitRepoPromptRepoNameChange}
        onInitGitRepoPromptPrivateChange={handleInitGitRepoPromptPrivateChange}
        onInitGitRepoPromptCancel={handleInitGitRepoPromptCancel}
        onInitGitRepoPromptConfirm={handleInitGitRepoPromptConfirm}
        worktreePrompt={worktreePrompt}
        onWorktreePromptNameChange={updateWorktreeName}
        onWorktreePromptChange={updateWorktreeBranch}
        onWorktreePromptCopyAgentsMdChange={updateWorktreeCopyAgentsMd}
        onWorktreeSetupScriptChange={updateWorktreeSetupScript}
        onWorktreePromptCancel={cancelWorktreePrompt}
        onWorktreePromptConfirm={confirmWorktreePrompt}
        clonePrompt={clonePrompt}
        onClonePromptCopyNameChange={updateCloneCopyName}
        onClonePromptChooseCopiesFolder={chooseCloneCopiesFolder}
        onClonePromptUseSuggestedFolder={useSuggestedCloneCopiesFolder}
        onClonePromptClearCopiesFolder={clearCloneCopiesFolder}
        onClonePromptCancel={cancelClonePrompt}
        onClonePromptConfirm={confirmClonePrompt}
        workspaceFromUrlPrompt={workspaceFromUrlPrompt}
        workspaceFromUrlCanSubmit={canSubmitWorkspaceFromUrlPrompt}
        onWorkspaceFromUrlPromptUrlChange={updateWorkspaceFromUrlUrl}
        onWorkspaceFromUrlPromptTargetFolderNameChange={updateWorkspaceFromUrlTargetFolderName}
        onWorkspaceFromUrlPromptChooseDestinationPath={chooseWorkspaceFromUrlDestinationPath}
        onWorkspaceFromUrlPromptClearDestinationPath={clearWorkspaceFromUrlDestinationPath}
        onWorkspaceFromUrlPromptCancel={closeWorkspaceFromUrlPrompt}
        onWorkspaceFromUrlPromptConfirm={submitWorkspaceFromUrlPrompt}
        branchSwitcher={branchSwitcher}
        branches={branches}
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        currentBranch={currentBranch}
        onBranchSwitcherSelect={handleBranchSelect}
        onBranchSwitcherCancel={closeBranchSwitcher}
        settingsOpen={settingsOpen}
        settingsSection={settingsSection ?? undefined}
        onCloseSettings={closeSettings}
        SettingsViewComponent={SettingsView}
        settingsProps={{
          workspaceGroups,
          groupedWorkspaces,
          ungroupedLabel,
          onMoveWorkspace: handleMoveWorkspace,
          onDeleteWorkspace: (workspaceId) => {
            void removeWorkspace(workspaceId);
          },
          onCreateWorkspaceGroup: createWorkspaceGroup,
          onRenameWorkspaceGroup: renameWorkspaceGroup,
          onMoveWorkspaceGroup: moveWorkspaceGroup,
          onDeleteWorkspaceGroup: deleteWorkspaceGroup,
          onAssignWorkspaceGroup: assignWorkspaceGroup,
          reduceTransparency,
          onToggleTransparency: setReduceTransparency,
          appSettings,
          openAppIconById,
          onUpdateAppSettings: async (next) => {
            await queueSaveSettings(next);
          },
          onRunDoctor: doctor,
          onRunCodexUpdate: codexUpdate,
          onUpdateWorkspaceCodexBin: async (id, codexBin) => {
            await updateWorkspaceCodexBin(id, codexBin);
          },
          onUpdateWorkspaceSettings: async (id, settings) => {
            await updateWorkspaceSettings(id, settings);
          },
          scaleShortcutTitle,
          scaleShortcutText,
          onTestNotificationSound: handleTestNotificationSound,
          onTestSystemNotification: handleTestSystemNotification,
          onMobileConnectSuccess: handleMobileConnectSuccess,
          dictationModelStatus: dictationModel.status,
          onDownloadDictationModel: dictationModel.download,
          onCancelDictationDownload: dictationModel.cancel,
          onRemoveDictationModel: dictationModel.remove,
        }}
      />
      {showMobileSetupWizard && (
        <MobileServerSetupWizard {...mobileSetupWizardProps} />
      )}
    </div>
  );
}

function App() {
  const windowLabel = useWindowLabel();
  if (windowLabel === "about") {
    return (
      <Suspense fallback={null}>
        <AboutView />
      </Suspense>
    );
  }
  return <MainApp />;
}

export default App;
