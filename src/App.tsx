import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles/base.css";
import "./styles/buttons.css";
import "./styles/sidebar.css";
import "./styles/home.css";
import "./styles/main.css";
import "./styles/messages.css";
import "./styles/approval-toasts.css";
import "./styles/update-toasts.css";
import "./styles/composer.css";
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
import "./styles/settings.css";
import "./styles/compact-base.css";
import "./styles/compact-phone.css";
import "./styles/compact-tablet.css";
import successSoundUrl from "./assets/success-notification.mp3";
import errorSoundUrl from "./assets/error-notification.mp3";
import { WorktreePrompt } from "./features/workspaces/components/WorktreePrompt";
import { RenameThreadPrompt } from "./features/threads/components/RenameThreadPrompt";
import { AboutView } from "./features/about/components/AboutView";
import { SettingsView } from "./features/settings/components/SettingsView";
import { DesktopLayout } from "./features/layout/components/DesktopLayout";
import { TabletLayout } from "./features/layout/components/TabletLayout";
import { PhoneLayout } from "./features/layout/components/PhoneLayout";
import { useLayoutNodes } from "./features/layout/hooks/useLayoutNodes";
import { useWorkspaces } from "./features/workspaces/hooks/useWorkspaces";
import { useThreads } from "./features/threads/hooks/useThreads";
import { useWindowDrag } from "./features/layout/hooks/useWindowDrag";
import { useGitStatus } from "./features/git/hooks/useGitStatus";
import { useGitDiffs } from "./features/git/hooks/useGitDiffs";
import { useGitLog } from "./features/git/hooks/useGitLog";
import { useGitHubIssues } from "./features/git/hooks/useGitHubIssues";
import { useGitHubPullRequests } from "./features/git/hooks/useGitHubPullRequests";
import { useGitHubPullRequestDiffs } from "./features/git/hooks/useGitHubPullRequestDiffs";
import { useGitHubPullRequestComments } from "./features/git/hooks/useGitHubPullRequestComments";
import { useGitRemote } from "./features/git/hooks/useGitRemote";
import { useGitRepoScan } from "./features/git/hooks/useGitRepoScan";
import { useGitActions } from "./features/git/hooks/useGitActions";
import { useModels } from "./features/models/hooks/useModels";
import { useCollaborationModes } from "./features/collaboration/hooks/useCollaborationModes";
import { useSkills } from "./features/skills/hooks/useSkills";
import { useCustomPrompts } from "./features/prompts/hooks/useCustomPrompts";
import { useWorkspaceFiles } from "./features/workspaces/hooks/useWorkspaceFiles";
import { useGitBranches } from "./features/git/hooks/useGitBranches";
import { useDebugLog } from "./features/debug/hooks/useDebugLog";
import { useWorkspaceRefreshOnFocus } from "./features/workspaces/hooks/useWorkspaceRefreshOnFocus";
import { useWorkspaceRestore } from "./features/workspaces/hooks/useWorkspaceRestore";
import { useResizablePanels } from "./features/layout/hooks/useResizablePanels";
import { useLayoutMode } from "./features/layout/hooks/useLayoutMode";
import { useSidebarToggles } from "./features/layout/hooks/useSidebarToggles";
import { useTransparencyPreference } from "./features/layout/hooks/useTransparencyPreference";
import { useWindowLabel } from "./features/layout/hooks/useWindowLabel";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  RightPanelCollapseButton,
  SidebarCollapseButton,
  TitlebarExpandControls,
} from "./features/layout/components/SidebarToggleControls";
import { useAppSettings } from "./features/settings/hooks/useAppSettings";
import { useUpdater } from "./features/update/hooks/useUpdater";
import { useComposerImages } from "./features/composer/hooks/useComposerImages";
import { useComposerShortcuts } from "./features/composer/hooks/useComposerShortcuts";
import { useDictationModel } from "./features/dictation/hooks/useDictationModel";
import { useDictation } from "./features/dictation/hooks/useDictation";
import { useHoldToDictate } from "./features/dictation/hooks/useHoldToDictate";
import { useQueuedSend } from "./features/threads/hooks/useQueuedSend";
import { useRenameThreadPrompt } from "./features/threads/hooks/useRenameThreadPrompt";
import { useWorktreePrompt } from "./features/workspaces/hooks/useWorktreePrompt";
import { useUiScaleShortcuts } from "./features/layout/hooks/useUiScaleShortcuts";
import { useWorkspaceSelection } from "./features/workspaces/hooks/useWorkspaceSelection";
import { useLocalUsage } from "./features/home/hooks/useLocalUsage";
import { useNewAgentShortcut } from "./features/app/hooks/useNewAgentShortcut";
import { useAgentSoundNotifications } from "./features/notifications/hooks/useAgentSoundNotifications";
import { useWindowFocusState } from "./features/layout/hooks/useWindowFocusState";
import { useCopyThread } from "./features/threads/hooks/useCopyThread";
import { usePanelVisibility } from "./features/layout/hooks/usePanelVisibility";
import { useTerminalController } from "./features/terminal/hooks/useTerminalController";
import { playNotificationSound } from "./utils/notificationSounds";
import {
  pickWorkspacePath,
} from "./services/tauri";
import type {
  AccessMode,
  GitHubPullRequest,
  QueuedMessage,
  WorkspaceInfo,
} from "./types";

function MainApp() {
  const {
    settings: appSettings,
    setSettings: setAppSettings,
    saveSettings,
    doctor,
    isLoading: appSettingsLoading
  } = useAppSettings();
  const dictationModel = useDictationModel(appSettings.dictationModelId);
  const {
    state: dictationState,
    level: dictationLevel,
    transcript: dictationTranscript,
    error: dictationError,
    hint: dictationHint,
    start: startDictation,
    stop: stopDictation,
    cancel: cancelDictation,
    clearTranscript: clearDictationTranscript,
    clearError: clearDictationError,
    clearHint: clearDictationHint,
  } = useDictation();
  const {
    uiScale,
    scaleShortcutTitle,
    scaleShortcutText,
    queueSaveSettings,
  } = useUiScaleShortcuts({
    settings: appSettings,
    setSettings: setAppSettings,
    saveSettings,
  });
  const {
    sidebarWidth,
    rightPanelWidth,
    onSidebarResizeStart,
    onRightPanelResizeStart,
    planPanelHeight,
    onPlanPanelResizeStart,
    terminalPanelHeight,
    onTerminalPanelResizeStart,
    debugPanelHeight,
    onDebugPanelResizeStart
  } = useResizablePanels(uiScale);
  const layoutMode = useLayoutMode();
  const isCompact = layoutMode !== "desktop";
  const isTablet = layoutMode === "tablet";
  const isPhone = layoutMode === "phone";
  const {
    sidebarCollapsed,
    rightPanelCollapsed,
    collapseSidebar,
    expandSidebar,
    collapseRightPanel,
    expandRightPanel,
  } = useSidebarToggles({ isCompact });
  const sidebarToggleProps = {
    isCompact,
    sidebarCollapsed,
    rightPanelCollapsed,
    onCollapseSidebar: collapseSidebar,
    onExpandSidebar: expandSidebar,
    onCollapseRightPanel: collapseRightPanel,
    onExpandRightPanel: expandRightPanel,
  };
  const [centerMode, setCenterMode] = useState<"chat" | "diff">("chat");
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null);
  const [diffScrollRequestId, setDiffScrollRequestId] = useState(0);
  const pendingDiffScrollRef = useRef(false);
  const [gitPanelMode, setGitPanelMode] = useState<
    "diff" | "log" | "issues" | "prs"
  >("diff");
  const [filePanelMode, setFilePanelMode] = useState<
    "git" | "files" | "prompts"
  >("git");
  const [selectedPullRequest, setSelectedPullRequest] =
    useState<GitHubPullRequest | null>(null);
  const [diffSource, setDiffSource] = useState<"local" | "pr">("local");
  const [accessMode, setAccessMode] = useState<AccessMode>("current");
  const [activeTab, setActiveTab] = useState<
    "projects" | "codex" | "git" | "log"
  >("codex");
  const tabletTab = activeTab === "projects" ? "codex" : activeTab;
  const [composerDraftsByThread, setComposerDraftsByThread] = useState<
    Record<string, string>
  >({});
  const [prefillDraft, setPrefillDraft] = useState<QueuedMessage | null>(null);
  const [composerInsert, setComposerInsert] = useState<QueuedMessage | null>(
    null
  );
  type SettingsSection =
    | "projects"
    | "display"
    | "dictation"
    | "shortcuts"
    | "codex"
    | "experimental";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(
    null,
  );
  const { reduceTransparency, setReduceTransparency } = useTransparencyPreference();
  const dictationReady = dictationModel.status?.state === "ready";
  const holdDictationKey = (appSettings.dictationHoldKey ?? "").toLowerCase();
  const handleToggleDictation = useCallback(async () => {
    if (!appSettings.dictationEnabled || !dictationReady) {
      return;
    }
    try {
      if (dictationState === "listening") {
        await stopDictation();
        return;
      }
      if (dictationState === "idle") {
        await startDictation(appSettings.dictationPreferredLanguage);
      }
    } catch {
      // Errors are surfaced through dictation events.
    }
  }, [
    appSettings.dictationEnabled,
    appSettings.dictationPreferredLanguage,
    dictationReady,
    dictationState,
    startDictation,
    stopDictation,
  ]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (dictationState !== "listening" && dictationState !== "processing") {
        return;
      }
      event.preventDefault();
      void cancelDictation();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [dictationState, cancelDictation]);

  useHoldToDictate({
    enabled: appSettings.dictationEnabled,
    ready: dictationReady,
    state: dictationState,
    preferredLanguage: appSettings.dictationPreferredLanguage,
    holdKey: holdDictationKey,
    startDictation,
    stopDictation,
    cancelDictation,
  });
  const {
    debugOpen,
    setDebugOpen,
    debugEntries,
    showDebugButton,
    addDebugEntry,
    handleCopyDebug,
    clearDebugEntries
  } = useDebugLog();

  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);

  const updater = useUpdater({ onDebug: addDebugEntry });
  const isWindowFocused = useWindowFocusState();
  const nextTestSoundIsError = useRef(false);

  useAgentSoundNotifications({
    enabled: appSettings.notificationSoundsEnabled,
    isWindowFocused,
    onDebug: addDebugEntry,
  });

  const handleTestNotificationSound = useCallback(() => {
    const useError = nextTestSoundIsError.current;
    nextTestSoundIsError.current = !useError;
    const type = useError ? "error" : "success";
    const url = useError ? errorSoundUrl : successSoundUrl;
    playNotificationSound(url, type, addDebugEntry);
  }, [addDebugEntry]);

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
    hasLoaded,
    refreshWorkspaces
  } = useWorkspaces({
    onDebug: addDebugEntry,
    defaultCodexBin: appSettings.codexBin,
    appSettings,
    onUpdateAppSettings: queueSaveSettings,
  });

  useEffect(() => {
    setAccessMode((prev) =>
      prev === "current" ? appSettings.defaultAccessMode : prev
    );
  }, [appSettings.defaultAccessMode]);

  const { status: gitStatus, refresh: refreshGitStatus } =
    useGitStatus(activeWorkspace);
  const gitStatusRefreshTimeoutRef = useRef<number | null>(null);
  const activeWorkspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);
  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspace?.id ?? null;
  }, [activeWorkspace?.id]);
  useEffect(() => {
    return () => {
      if (gitStatusRefreshTimeoutRef.current !== null) {
        window.clearTimeout(gitStatusRefreshTimeoutRef.current);
      }
    };
  }, []);
  const queueGitStatusRefresh = useCallback(() => {
    const workspaceId = activeWorkspaceIdRef.current;
    if (!workspaceId) {
      return;
    }
    if (gitStatusRefreshTimeoutRef.current !== null) {
      window.clearTimeout(gitStatusRefreshTimeoutRef.current);
    }
    gitStatusRefreshTimeoutRef.current = window.setTimeout(() => {
      gitStatusRefreshTimeoutRef.current = null;
      if (activeWorkspaceIdRef.current !== workspaceId) {
        return;
      }
      refreshGitStatus();
    }, 500);
  }, [refreshGitStatus]);
  const compactTab = isTablet ? tabletTab : activeTab;
  const shouldLoadDiffs =
    centerMode === "diff" || (isCompact && compactTab === "git");
  const shouldLoadGitLog = gitPanelMode === "log" && Boolean(activeWorkspace);
  const shouldLoadPullRequests =
    gitPanelMode === "prs" && Boolean(activeWorkspace);
  const {
    diffs: gitDiffs,
    isLoading: isDiffLoading,
    error: diffError,
    refresh: refreshGitDiffs,
  } = useGitDiffs(activeWorkspace, gitStatus.files, shouldLoadDiffs);
  const {
    entries: gitLogEntries,
    total: gitLogTotal,
    ahead: gitLogAhead,
    behind: gitLogBehind,
    aheadEntries: gitLogAheadEntries,
    behindEntries: gitLogBehindEntries,
    upstream: gitLogUpstream,
    isLoading: gitLogLoading,
    error: gitLogError
  } = useGitLog(activeWorkspace, shouldLoadGitLog);
  const {
    issues: gitIssues,
    total: gitIssuesTotal,
    isLoading: gitIssuesLoading,
    error: gitIssuesError
  } = useGitHubIssues(activeWorkspace, gitPanelMode === "issues");
  const {
    pullRequests: gitPullRequests,
    total: gitPullRequestsTotal,
    isLoading: gitPullRequestsLoading,
    error: gitPullRequestsError
  } = useGitHubPullRequests(activeWorkspace, shouldLoadPullRequests);
  const {
    diffs: gitPullRequestDiffs,
    isLoading: gitPullRequestDiffsLoading,
    error: gitPullRequestDiffsError
  } = useGitHubPullRequestDiffs(
    activeWorkspace,
    selectedPullRequest?.number ?? null,
    shouldLoadDiffs && diffSource === "pr"
  );
  const {
    comments: gitPullRequestComments,
    isLoading: gitPullRequestCommentsLoading,
    error: gitPullRequestCommentsError
  } = useGitHubPullRequestComments(
    activeWorkspace,
    selectedPullRequest?.number ?? null,
    shouldLoadDiffs && diffSource === "pr"
  );
  const { remote: gitRemoteUrl } = useGitRemote(activeWorkspace);
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
    reasoningOptions,
    selectedEffort,
    setSelectedEffort
  } = useModels({
    activeWorkspace,
    onDebug: addDebugEntry,
    preferredModelId: appSettings.lastComposerModelId,
    preferredEffort: appSettings.lastComposerReasoningEffort,
  });

  useComposerShortcuts({
    textareaRef: composerInputRef,
    modelShortcut: appSettings.composerModelShortcut,
    accessShortcut: appSettings.composerAccessShortcut,
    reasoningShortcut: appSettings.composerReasoningShortcut,
    models,
    selectedModelId,
    onSelectModel: setSelectedModelId,
    accessMode,
    onSelectAccessMode: setAccessMode,
    reasoningOptions,
    selectedEffort,
    onSelectEffort: setSelectedEffort,
  });
  const {
    collaborationModes,
    selectedCollaborationMode,
    selectedCollaborationModeId,
    setSelectedCollaborationModeId,
  } = useCollaborationModes({
    activeWorkspace,
    enabled: appSettings.experimentalCollabEnabled,
    onDebug: addDebugEntry,
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
  const { files, isLoading: isFilesLoading } = useWorkspaceFiles({
    activeWorkspace,
    onDebug: addDebugEntry,
  });
  const { branches, checkoutBranch, createBranch } = useGitBranches({
    activeWorkspace,
    onDebug: addDebugEntry
  });
  const handleCheckoutBranch = async (name: string) => {
    await checkoutBranch(name);
    refreshGitStatus();
  };
  const handleCreateBranch = async (name: string) => {
    await createBranch(name);
    refreshGitStatus();
  };
  const alertError = useCallback((error: unknown) => {
    alert(error instanceof Error ? error.message : String(error));
  }, []);
  const {
    applyWorktreeChanges: handleApplyWorktreeChanges,
    revertAllGitChanges: handleRevertAllGitChanges,
    revertGitFile: handleRevertGitFile,
    stageGitFile: handleStageGitFile,
    unstageGitFile: handleUnstageGitFile,
    worktreeApplyError,
    worktreeApplyLoading,
    worktreeApplySuccess,
  } = useGitActions({
    activeWorkspace,
    onRefreshGitStatus: refreshGitStatus,
    onRefreshGitDiffs: refreshGitDiffs,
    onError: alertError,
  });

  const resolvedModel = selectedModel?.model ?? null;
  const activeGitRoot = activeWorkspace?.settings.gitRoot ?? null;
  const normalizePath = useCallback((value: string) => {
    return value.replace(/\\/g, "/").replace(/\/+$/, "");
  }, []);
  const handleSetGitRoot = useCallback(
    async (path: string | null) => {
      if (!activeWorkspace) {
        return;
      }
      await updateWorkspaceSettings(activeWorkspace.id, {
        ...activeWorkspace.settings,
        gitRoot: path,
      });
      clearGitRootCandidates();
      refreshGitStatus();
    },
    [
      activeWorkspace,
      clearGitRootCandidates,
      refreshGitStatus,
      updateWorkspaceSettings,
    ],
  );
  const handlePickGitRoot = useCallback(async () => {
    if (!activeWorkspace) {
      return;
    }
    const selection = await pickWorkspacePath();
    if (!selection) {
      return;
    }
    const workspacePath = normalizePath(activeWorkspace.path);
    const selectedPath = normalizePath(selection);
    let nextRoot: string | null = null;
    if (selectedPath === workspacePath) {
      nextRoot = null;
    } else if (selectedPath.startsWith(`${workspacePath}/`)) {
      nextRoot = selectedPath.slice(workspacePath.length + 1);
    } else {
      nextRoot = selectedPath;
    }
    await handleSetGitRoot(nextRoot);
  }, [activeWorkspace, handleSetGitRoot, normalizePath]);
  const fileStatus =
    gitStatus.error
      ? "Git status unavailable"
      : gitStatus.files.length > 0
        ? `${gitStatus.files.length} file${
            gitStatus.files.length === 1 ? "" : "s"
          } changed`
        : "Working tree clean";

  const activeDiffs = diffSource === "pr" ? gitPullRequestDiffs : gitDiffs;
  const activeDiffLoading =
    diffSource === "pr" ? gitPullRequestDiffsLoading : isDiffLoading;
  const activeDiffError =
    diffSource === "pr" ? gitPullRequestDiffsError : diffError;

  useEffect(() => {
    if (appSettingsLoading) {
      return;
    }
    if (!selectedModelId && selectedEffort === null) {
      return;
    }
    setAppSettings((current) => {
      if (
        current.lastComposerModelId === selectedModelId &&
        current.lastComposerReasoningEffort === selectedEffort
      ) {
        return current;
      }
      const nextSettings = {
        ...current,
        lastComposerModelId: selectedModelId,
        lastComposerReasoningEffort: selectedEffort,
      };
      void queueSaveSettings(nextSettings);
      return nextSettings;
    });
  }, [
    appSettingsLoading,
    queueSaveSettings,
    selectedEffort,
    selectedModelId,
    setAppSettings,
  ]);

  useEffect(() => {
    if (diffSource !== "pr" || centerMode !== "diff") {
      return;
    }
    if (!gitPullRequestDiffs.length) {
      return;
    }
    if (
      selectedDiffPath &&
      gitPullRequestDiffs.some((entry) => entry.path === selectedDiffPath)
    ) {
      return;
    }
    setSelectedDiffPath(gitPullRequestDiffs[0].path);
  }, [centerMode, diffSource, gitPullRequestDiffs, selectedDiffPath]);

  const {
    setActiveThreadId,
    activeThreadId,
    activeItems,
    approvals,
    threadsByWorkspace,
    threadParentById,
    threadStatusById,
    threadListLoadingByWorkspace,
    threadListPagingByWorkspace,
    threadListCursorByWorkspace,
    tokenUsageByThread,
    rateLimitsByWorkspace,
    planByThread,
    lastAgentMessageByThread,
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
    sendUserMessage,
    sendUserMessageToThread,
    startReview,
    handleApprovalDecision
  } = useThreads({
    activeWorkspace,
    onWorkspaceConnected: markWorkspaceConnected,
    onDebug: addDebugEntry,
    model: resolvedModel,
    effort: selectedEffort,
    collaborationMode: selectedCollaborationMode?.value ?? null,
    accessMode,
    customPrompts: prompts,
    onMessageActivity: queueGitStatusRefresh
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

  const handleRenameThread = useCallback(
    (workspaceId: string, threadId: string) => {
      openRenamePrompt(workspaceId, threadId);
    },
    [openRenamePrompt],
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
  const { exitDiffView, selectWorkspace, selectHome } = useWorkspaceSelection({
    workspaces,
    isCompact,
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
    updateBranch: updateWorktreeBranch,
  } = useWorktreePrompt({
    addWorktreeAgent,
    connectWorkspace,
    onSelectWorkspace: selectWorkspace,
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

  const latestAgentRuns = useMemo(() => {
    const entries: Array<{
      threadId: string;
      message: string;
      timestamp: number;
      projectName: string;
      groupName?: string | null;
      workspaceId: string;
      isProcessing: boolean;
    }> = [];
    workspaces.forEach((workspace) => {
      const threads = threadsByWorkspace[workspace.id] ?? [];
      threads.forEach((thread) => {
        const entry = lastAgentMessageByThread[thread.id];
        if (!entry) {
          return;
        }
        entries.push({
          threadId: thread.id,
          message: entry.text,
          timestamp: entry.timestamp,
          projectName: workspace.name,
          groupName: getWorkspaceGroupName(workspace.id),
          workspaceId: workspace.id,
          isProcessing: threadStatusById[thread.id]?.isProcessing ?? false
        });
      });
    });
    return entries.sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
  }, [
    lastAgentMessageByThread,
    getWorkspaceGroupName,
    threadStatusById,
    threadsByWorkspace,
    workspaces
  ]);
  const isLoadingLatestAgents = useMemo(
    () =>
      !hasLoaded ||
      workspaces.some(
        (workspace) => threadListLoadingByWorkspace[workspace.id] ?? false
      ),
    [hasLoaded, threadListLoadingByWorkspace, workspaces]
  );

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
  const showHome = !activeWorkspace;
  const {
    snapshot: localUsageSnapshot,
    isLoading: isLoadingLocalUsage,
    error: localUsageError,
    refresh: refreshLocalUsage,
  } = useLocalUsage(showHome);
  const canInterrupt = activeThreadId
    ? threadStatusById[activeThreadId]?.isProcessing ?? false
    : false;
  const isProcessing = activeThreadId
    ? threadStatusById[activeThreadId]?.isProcessing ?? false
    : false;
  const isReviewing = activeThreadId
    ? threadStatusById[activeThreadId]?.isReviewing ?? false
    : false;
  const { activeQueue, handleSend, queueMessage, removeQueuedMessage } = useQueuedSend({
    activeThreadId,
    isProcessing,
    isReviewing,
    steerEnabled: appSettings.experimentalSteerEnabled,
    activeWorkspace,
    connectWorkspace,
    sendUserMessage,
    startReview,
    clearActiveImages,
  });
  const activeDraft = activeThreadId
    ? composerDraftsByThread[activeThreadId] ?? ""
    : "";
  const handleDraftChange = useCallback(
    (next: string) => {
      if (!activeThreadId) {
        return;
      }
      setComposerDraftsByThread((prev) => ({
        ...prev,
        [activeThreadId]: next
      }));
    },
    [activeThreadId]
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
      await revealItemInDir(path);
    } catch (error) {
      alertError(error);
    }
  }, [alertError, getGlobalPromptsDir]);

  const isWorktreeWorkspace = activeWorkspace?.kind === "worktree";
  const activeParentWorkspace = isWorktreeWorkspace
    ? workspaces.find((entry) => entry.id === activeWorkspace?.parentId) ?? null
    : null;
  const worktreeLabel = isWorktreeWorkspace
    ? activeWorkspace?.worktree?.branch ?? activeWorkspace?.name ?? null
    : null;

  useEffect(() => {
    if (!isPhone) {
      return;
    }
    if (!activeWorkspace && activeTab !== "projects") {
      setActiveTab("projects");
    }
  }, [activeTab, activeWorkspace, isPhone]);

  useEffect(() => {
    if (!isTablet) {
      return;
    }
    if (activeTab === "projects") {
      setActiveTab("codex");
    }
  }, [activeTab, isTablet]);

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

  useNewAgentShortcut({
    isEnabled: Boolean(activeWorkspace),
    onTrigger: () => {
      if (activeWorkspace) {
        void handleAddAgent(activeWorkspace);
      }
    },
  });

  async function handleAddWorkspace() {
    try {
      const workspace = await addWorkspace();
      if (workspace) {
        setActiveThreadId(null, workspace.id);
        if (isCompact) {
          setActiveTab("codex");
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addDebugEntry({
        id: `${Date.now()}-client-add-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/add error",
        payload: message
      });
      alert(`Failed to add workspace.\n\n${message}`);
    }
  }


  async function handleAddAgent(workspace: (typeof workspaces)[number]) {
    exitDiffView();
    selectWorkspace(workspace.id);
    if (!workspace.connected) {
      await connectWorkspace(workspace);
    }
    await startThreadForWorkspace(workspace.id);
    if (isCompact) {
      setActiveTab("codex");
    }
    // Focus the composer input after creating the agent
    setTimeout(() => composerInputRef.current?.focus(), 0);
  }

  async function handleAddWorktreeAgent(
    workspace: (typeof workspaces)[number]
  ) {
    exitDiffView();
    openWorktreePrompt(workspace);
  }

  function handleSelectDiff(path: string) {
    setSelectedDiffPath(path);
    pendingDiffScrollRef.current = true;
    setCenterMode("diff");
    setGitPanelMode("diff");
    setDiffSource("local");
    setSelectedPullRequest(null);
    if (isCompact) {
      setActiveTab("git");
    }
  }

  const handleActiveDiffPath = useCallback((path: string) => {
    setSelectedDiffPath(path);
  }, []);

  useEffect(() => {
    if (!selectedDiffPath) {
      pendingDiffScrollRef.current = false;
    }
  }, [selectedDiffPath]);

  useEffect(() => {
    if (!pendingDiffScrollRef.current) {
      return;
    }
    if (!selectedDiffPath) {
      return;
    }
    if (centerMode !== "diff") {
      return;
    }
    if (!activeDiffs.some((entry) => entry.path === selectedDiffPath)) {
      return;
    }
    setDiffScrollRequestId((current) => current + 1);
    pendingDiffScrollRef.current = false;
  }, [activeDiffs, centerMode, selectedDiffPath]);

  function handleSelectPullRequest(pullRequest: GitHubPullRequest) {
    setSelectedPullRequest(pullRequest);
    setDiffSource("pr");
    setSelectedDiffPath(null);
    setCenterMode("diff");
    setGitPanelMode("prs");
    if (isCompact) {
      setActiveTab("git");
    }
  }

  function handleGitPanelModeChange(
    mode: "diff" | "log" | "issues" | "prs",
  ) {
    setGitPanelMode(mode);
    if (mode !== "prs") {
      if (diffSource === "pr") {
        setSelectedDiffPath(null);
      }
      setDiffSource("local");
      setSelectedPullRequest(null);
    }
  }


  const handleOpenSettings = useCallback(
    (section?: SettingsSection) => {
      setSettingsSection(section ?? null);
      setSettingsOpen(true);
    },
    [],
  );

  const orderValue = (entry: WorkspaceInfo) =>
    typeof entry.settings.sortOrder === "number"
      ? entry.settings.sortOrder
      : Number.MAX_SAFE_INTEGER;

  const handleMoveWorkspace = async (
    workspaceId: string,
    direction: "up" | "down"
  ) => {
    const target = workspaces.find((entry) => entry.id === workspaceId);
    if (!target || (target.kind ?? "main") === "worktree") {
      return;
    }
    const targetGroupId = target.settings.groupId ?? null;
    const ordered = workspaces
      .filter(
        (entry) =>
          (entry.kind ?? "main") !== "worktree" &&
          (entry.settings.groupId ?? null) === targetGroupId,
      )
      .slice()
      .sort((a, b) => {
        const orderDiff = orderValue(a) - orderValue(b);
        if (orderDiff !== 0) {
          return orderDiff;
        }
        return a.name.localeCompare(b.name);
      });
    const index = ordered.findIndex((entry) => entry.id === workspaceId);
    if (index === -1) {
      return;
    }
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= ordered.length) {
      return;
    }
    const next = ordered.slice();
    const temp = next[index];
    next[index] = next[nextIndex];
    next[nextIndex] = temp;
    await Promise.all(
      next.map((entry, idx) =>
        updateWorkspaceSettings(entry.id, {
          ...entry.settings,
          sortOrder: idx
        })
      )
    );
  };

  const showComposer = !isCompact
    ? centerMode === "chat" || centerMode === "diff"
    : (isTablet ? tabletTab : activeTab) === "codex";
  const showGitDetail = Boolean(selectedDiffPath) && isPhone;
  const {
    terminalOpen,
    onToggleDebug: handleDebugClick,
    onToggleTerminal: handleToggleTerminal,
  } = usePanelVisibility({
    isCompact,
    activeWorkspaceId,
    setActiveTab,
    setDebugOpen,
  });
  const {
    terminalTabs,
    activeTerminalId,
    onSelectTerminal,
    onNewTerminal,
    onCloseTerminal,
    terminalState,
  } = useTerminalController({
    activeWorkspaceId,
    activeWorkspace,
    terminalOpen,
    onDebug: addDebugEntry,
  });
  const isDefaultScale = Math.abs(uiScale - 1) < 0.001;
  const appClassName = `app ${isCompact ? "layout-compact" : "layout-desktop"}${
    isPhone ? " layout-phone" : ""
  }${isTablet ? " layout-tablet" : ""}${
    reduceTransparency ? " reduced-transparency" : ""
  }${!isCompact && sidebarCollapsed ? " sidebar-collapsed" : ""}${
    !isCompact && rightPanelCollapsed ? " right-panel-collapsed" : ""
  }${isDefaultScale ? " ui-scale-default" : ""}`;
  const {
    sidebarNode,
    messagesNode,
    composerNode,
    approvalToastsNode,
    updateToastNode,
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
    threadsByWorkspace,
    threadParentById,
    threadStatusById,
    threadListLoadingByWorkspace,
    threadListPagingByWorkspace,
    threadListCursorByWorkspace,
    lastAgentMessageByThread,
    activeWorkspaceId,
    activeThreadId,
    activeItems,
    activeRateLimits,
    approvals,
    handleApprovalDecision,
    onOpenSettings: () => handleOpenSettings(),
    onOpenDictationSettings: () => handleOpenSettings("dictation"),
    onOpenDebug: handleDebugClick,
    showDebugButton,
    onAddWorkspace: handleAddWorkspace,
    onSelectHome: selectHome,
    onSelectWorkspace: (workspaceId) => {
      exitDiffView();
      selectWorkspace(workspaceId);
    },
    onConnectWorkspace: async (workspace) => {
      await connectWorkspace(workspace);
      if (isCompact) {
        setActiveTab("codex");
      }
    },
    onAddAgent: handleAddAgent,
    onAddWorktreeAgent: handleAddWorktreeAgent,
    onToggleWorkspaceCollapse: (workspaceId, collapsed) => {
      const target = workspaces.find((entry) => entry.id === workspaceId);
      if (!target) {
        return;
      }
      void updateWorkspaceSettings(workspaceId, {
        ...target.settings,
        sidebarCollapsed: collapsed,
      });
    },
    onSelectThread: (workspaceId, threadId) => {
      exitDiffView();
      selectWorkspace(workspaceId);
      setActiveThreadId(threadId, workspaceId);
    },
    onDeleteThread: (workspaceId, threadId) => {
      removeThread(workspaceId, threadId);
      setComposerDraftsByThread((prev) => {
        if (!(threadId in prev)) {
          return prev;
        }
        const { [threadId]: _, ...rest } = prev;
        return rest;
      });
      removeImagesForThread(threadId);
    },
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    onRenameThread: (workspaceId, threadId) => {
      handleRenameThread(workspaceId, threadId);
    },
    onDeleteWorkspace: (workspaceId) => {
      void removeWorkspace(workspaceId);
    },
    onDeleteWorktree: (workspaceId) => {
      void removeWorktree(workspaceId);
    },
    onLoadOlderThreads: (workspaceId) => {
      const workspace = workspaces.find((entry) => entry.id === workspaceId);
      if (!workspace) {
        return;
      }
      void loadOlderThreadsForWorkspace(workspace);
    },
    onReloadWorkspaceThreads: (workspaceId) => {
      const workspace = workspaces.find((entry) => entry.id === workspaceId);
      if (!workspace) {
        return;
      }
      void listThreadsForWorkspace(workspace);
    },
    updaterState: updater.state,
    onUpdate: updater.startUpdate,
    onDismissUpdate: updater.dismiss,
    latestAgentRuns,
    isLoadingLatestAgents,
    localUsageSnapshot,
    isLoadingLocalUsage,
    localUsageError,
    onRefreshLocalUsage: () => {
      refreshLocalUsage()?.catch(() => {});
    },
    onSelectHomeThread: (workspaceId, threadId) => {
      exitDiffView();
      selectWorkspace(workspaceId);
      setActiveThreadId(threadId, workspaceId);
      if (isCompact) {
        setActiveTab("codex");
      }
    },
    activeWorkspace,
    activeParentWorkspace,
    worktreeLabel,
    isWorktreeWorkspace,
    branchName: gitStatus.branchName || "unknown",
    branches,
    onCheckoutBranch: handleCheckoutBranch,
    onCreateBranch: handleCreateBranch,
    onCopyThread: handleCopyThread,
    onToggleTerminal: handleToggleTerminal,
    showTerminalButton: !isCompact,
    mainHeaderActionsNode: !isCompact && !rightPanelCollapsed ? (
      <RightPanelCollapseButton {...sidebarToggleProps} />
    ) : null,
    filePanelMode,
    onFilePanelModeChange: setFilePanelMode,
    fileTreeLoading: isFilesLoading,
    centerMode,
    onExitDiff: () => {
      setCenterMode("chat");
      setSelectedDiffPath(null);
    },
    activeTab,
    onSelectTab: setActiveTab,
    tabletNavTab: tabletTab,
    gitPanelMode,
    onGitPanelModeChange: handleGitPanelModeChange,
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
    selectedDiffPath,
    diffScrollRequestId,
    onSelectDiff: handleSelectDiff,
    gitLogEntries,
    gitLogTotal,
    gitLogAhead,
    gitLogBehind,
    gitLogAheadEntries,
    gitLogBehindEntries,
    gitLogUpstream,
    gitLogError,
    gitLogLoading,
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
    onSelectPullRequest: handleSelectPullRequest,
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
    onStageGitFile: handleStageGitFile,
    onUnstageGitFile: handleUnstageGitFile,
    onRevertGitFile: handleRevertGitFile,
    onRevertAllGitChanges: handleRevertAllGitChanges,
    gitDiffs: activeDiffs,
    gitDiffLoading: activeDiffLoading,
    gitDiffError: activeDiffError,
    onDiffActivePathChange: handleActiveDiffPath,
    onSendPrompt: handleSendPrompt,
    onSendPromptToNewAgent: handleSendPromptToNewAgent,
    onCreatePrompt: handleCreatePrompt,
    onUpdatePrompt: handleUpdatePrompt,
    onDeletePrompt: handleDeletePrompt,
    onMovePrompt: handleMovePrompt,
    onRevealWorkspacePrompts: handleRevealWorkspacePrompts,
    onRevealGeneralPrompts: handleRevealGeneralPrompts,
    onSend: handleSend,
    onQueue: queueMessage,
    onStop: interruptTurn,
    canStop: canInterrupt,
    isReviewing,
    isProcessing,
    steerEnabled: appSettings.experimentalSteerEnabled,
    activeTokenUsage,
    activeQueue,
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
    onEditQueued: (item) => {
      if (!activeThreadId) {
        return;
      }
      removeQueuedMessage(activeThreadId, item.id);
      setImagesForThread(activeThreadId, item.images ?? []);
      setPrefillDraft(item);
    },
    onDeleteQueued: (id) => {
      if (!activeThreadId) {
        return;
      }
      removeQueuedMessage(activeThreadId, id);
    },
    collaborationModes,
    selectedCollaborationModeId,
    onSelectCollaborationMode: setSelectedCollaborationModeId,
    models,
    selectedModelId,
    onSelectModel: setSelectedModelId,
    reasoningOptions,
    selectedEffort,
    onSelectEffort: setSelectedEffort,
    accessMode,
    onSelectAccessMode: setAccessMode,
    skills,
    prompts,
    files,
    textareaRef: composerInputRef,
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
      setSelectedDiffPath(null);
      setCenterMode("chat");
    },
    onGoProjects: () => setActiveTab("projects"),
  });

  const desktopTopbarLeftNodeWithToggle = !isCompact ? (
    <div className="topbar-leading">
      <SidebarCollapseButton {...sidebarToggleProps} />
      {desktopTopbarLeftNode}
    </div>
  ) : (
    desktopTopbarLeftNode
  );

  return (
    <div
      className={appClassName}
      style={
        {
          "--sidebar-width": `${
            isCompact ? sidebarWidth : sidebarCollapsed ? 0 : sidebarWidth
          }px`,
          "--right-panel-width": `${
            isCompact ? rightPanelWidth : rightPanelCollapsed ? 0 : rightPanelWidth
          }px`,
          "--plan-panel-height": `${planPanelHeight}px`,
          "--terminal-panel-height": `${terminalPanelHeight}px`,
          "--debug-panel-height": `${debugPanelHeight}px`,
          "--ui-scale": String(uiScale)
        } as React.CSSProperties
      }
    >
      <div className="drag-strip" id="titlebar" data-tauri-drag-region />
      <TitlebarExpandControls {...sidebarToggleProps} />
      {isPhone ? (
        <PhoneLayout
          approvalToastsNode={approvalToastsNode}
          updateToastNode={updateToastNode}
          tabBarNode={tabBarNode}
          sidebarNode={sidebarNode}
          activeTab={activeTab}
          activeWorkspace={Boolean(activeWorkspace)}
          showGitDetail={showGitDetail}
          compactEmptyCodexNode={compactEmptyCodexNode}
          compactEmptyGitNode={compactEmptyGitNode}
          compactGitBackNode={compactGitBackNode}
          topbarLeftNode={mainHeaderNode}
          messagesNode={messagesNode}
          composerNode={composerNode}
          gitDiffPanelNode={gitDiffPanelNode}
          gitDiffViewerNode={gitDiffViewerNode}
          debugPanelNode={debugPanelFullNode}
        />
      ) : isTablet ? (
        <TabletLayout
          tabletNavNode={tabletNavNode}
          approvalToastsNode={approvalToastsNode}
          updateToastNode={updateToastNode}
          homeNode={homeNode}
          showHome={showHome}
          showWorkspace={Boolean(activeWorkspace && !showHome)}
          sidebarNode={sidebarNode}
          tabletTab={tabletTab}
          onSidebarResizeStart={onSidebarResizeStart}
          topbarLeftNode={mainHeaderNode}
          messagesNode={messagesNode}
          composerNode={composerNode}
          gitDiffPanelNode={gitDiffPanelNode}
          gitDiffViewerNode={gitDiffViewerNode}
          debugPanelNode={debugPanelFullNode}
        />
      ) : (
        <DesktopLayout
          sidebarNode={sidebarNode}
          updateToastNode={updateToastNode}
          approvalToastsNode={approvalToastsNode}
          homeNode={homeNode}
          showHome={showHome}
          showWorkspace={Boolean(activeWorkspace && !showHome)}
          topbarLeftNode={desktopTopbarLeftNodeWithToggle}
          centerMode={centerMode}
          messagesNode={messagesNode}
          gitDiffViewerNode={gitDiffViewerNode}
          gitDiffPanelNode={gitDiffPanelNode}
          planPanelNode={planPanelNode}
          composerNode={composerNode}
          terminalDockNode={terminalDockNode}
          debugPanelNode={debugPanelNode}
          hasActivePlan={hasActivePlan}
          onSidebarResizeStart={onSidebarResizeStart}
          onRightPanelResizeStart={onRightPanelResizeStart}
          onPlanPanelResizeStart={onPlanPanelResizeStart}
        />
      )}
      {renamePrompt && (
        <RenameThreadPrompt
          currentName={renamePrompt.originalName}
          name={renamePrompt.name}
          onChange={handleRenamePromptChange}
          onCancel={handleRenamePromptCancel}
          onConfirm={handleRenamePromptConfirm}
        />
      )}
      {worktreePrompt && (
        <WorktreePrompt
          workspaceName={worktreePrompt.workspace.name}
          branch={worktreePrompt.branch}
          error={worktreePrompt.error}
          isBusy={worktreePrompt.isSubmitting}
          onChange={updateWorktreeBranch}
          onCancel={cancelWorktreePrompt}
          onConfirm={confirmWorktreePrompt}
        />
      )}
      {settingsOpen && (
        <SettingsView
          workspaceGroups={workspaceGroups}
          groupedWorkspaces={groupedWorkspaces}
          ungroupedLabel={ungroupedLabel}
          onClose={() => {
            setSettingsOpen(false);
            setSettingsSection(null);
          }}
          onMoveWorkspace={handleMoveWorkspace}
          onDeleteWorkspace={(workspaceId) => {
            void removeWorkspace(workspaceId);
          }}
          onCreateWorkspaceGroup={createWorkspaceGroup}
          onRenameWorkspaceGroup={renameWorkspaceGroup}
          onMoveWorkspaceGroup={moveWorkspaceGroup}
          onDeleteWorkspaceGroup={deleteWorkspaceGroup}
          onAssignWorkspaceGroup={assignWorkspaceGroup}
          reduceTransparency={reduceTransparency}
          onToggleTransparency={setReduceTransparency}
          appSettings={appSettings}
          onUpdateAppSettings={async (next) => {
            await queueSaveSettings(next);
          }}
          onRunDoctor={doctor}
          onUpdateWorkspaceCodexBin={async (id, codexBin) => {
            await updateWorkspaceCodexBin(id, codexBin);
          }}
          scaleShortcutTitle={scaleShortcutTitle}
          scaleShortcutText={scaleShortcutText}
          onTestNotificationSound={handleTestNotificationSound}
          dictationModelStatus={dictationModel.status}
          onDownloadDictationModel={dictationModel.download}
          onCancelDictationDownload={dictationModel.cancel}
          onRemoveDictationModel={dictationModel.remove}
          initialSection={settingsSection ?? undefined}
        />
      )}
    </div>
  );
}

function App() {
  const windowLabel = useWindowLabel();
  if (windowLabel === "about") {
    return <AboutView />;
  }
  return <MainApp />;
}

export default App;
