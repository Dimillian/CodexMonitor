import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
import { useGitRemote } from "./features/git/hooks/useGitRemote";
import { useModels } from "./features/models/hooks/useModels";
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
import {
  RightPanelCollapseButton,
  SidebarCollapseButton,
  TitlebarExpandControls,
} from "./features/layout/components/SidebarToggleControls";
import { useAppSettings } from "./features/settings/hooks/useAppSettings";
import { useUpdater } from "./features/update/hooks/useUpdater";
import { useComposerImages } from "./features/composer/hooks/useComposerImages";
import { useDictationModel } from "./features/dictation/hooks/useDictationModel";
import { useDictation } from "./features/dictation/hooks/useDictation";
import { useHoldToDictate } from "./features/dictation/hooks/useHoldToDictate";
import { useQueuedSend } from "./features/threads/hooks/useQueuedSend";
import { useWorktreePrompt } from "./features/workspaces/hooks/useWorktreePrompt";
import { useUiScaleShortcuts } from "./features/layout/hooks/useUiScaleShortcuts";
import { useWorkspaceSelection } from "./features/workspaces/hooks/useWorkspaceSelection";
import { useNewAgentShortcut } from "./features/app/hooks/useNewAgentShortcut";
import { useAgentSoundNotifications } from "./features/notifications/hooks/useAgentSoundNotifications";
import { useWindowFocusState } from "./features/layout/hooks/useWindowFocusState";
import { useCopyThread } from "./features/threads/hooks/useCopyThread";
import { usePanelVisibility } from "./features/layout/hooks/usePanelVisibility";
import { useTerminalController } from "./features/terminal/hooks/useTerminalController";
import { playNotificationSound } from "./utils/notificationSounds";
import type { AccessMode, DiffLineReference, QueuedMessage, WorkspaceInfo } from "./types";

function useWindowLabel() {
  const [label, setLabel] = useState("main");
  useEffect(() => {
    try {
      const window = getCurrentWindow();
      setLabel(window.label ?? "main");
    } catch {
      setLabel("main");
    }
  }, []);
  return label;
}

function MainApp() {
  const {
    settings: appSettings,
    setSettings: setAppSettings,
    saveSettings,
    doctor
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
  const [gitPanelMode, setGitPanelMode] = useState<"diff" | "log" | "issues">(
    "diff"
  );
  const [filePanelMode, setFilePanelMode] = useState<"git" | "files">("git");
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
  type SettingsSection = "projects" | "display" | "dictation" | "codex" | "experimental";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(
    null,
  );
  const [reduceTransparency, setReduceTransparency] = useState(() => {
    const stored = localStorage.getItem("reduceTransparency");
    return stored === "true";
  });
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
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    addWorkspace,
    addWorktreeAgent,
    connectWorkspace,
    markWorkspaceConnected,
    updateWorkspaceSettings,
    updateWorkspaceCodexBin,
    removeWorkspace,
    removeWorktree,
    hasLoaded,
    refreshWorkspaces
  } = useWorkspaces({
    onDebug: addDebugEntry,
    defaultCodexBin: appSettings.codexBin
  });

  useEffect(() => {
    setAccessMode((prev) =>
      prev === "current" ? appSettings.defaultAccessMode : prev
    );
  }, [appSettings.defaultAccessMode]);

  useEffect(() => {
    localStorage.setItem("reduceTransparency", String(reduceTransparency));
  }, [reduceTransparency]);

  const { status: gitStatus, refresh: refreshGitStatus } =
    useGitStatus(activeWorkspace);
  const compactTab = isTablet ? tabletTab : activeTab;
  const shouldLoadDiffs =
    centerMode === "diff" || (isCompact && compactTab === "git");
  const shouldLoadGitLog = gitPanelMode === "log" && Boolean(activeWorkspace);
  const {
    diffs: gitDiffs,
    isLoading: isDiffLoading,
    error: diffError
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
  const { remote: gitRemoteUrl } = useGitRemote(activeWorkspace);
  const {
    models,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    reasoningOptions,
    selectedEffort,
    setSelectedEffort
  } = useModels({ activeWorkspace, onDebug: addDebugEntry });
  const { skills } = useSkills({ activeWorkspace, onDebug: addDebugEntry });
  const { prompts } = useCustomPrompts({ activeWorkspace, onDebug: addDebugEntry });
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

  const resolvedModel = selectedModel?.model ?? null;
  const fileStatus =
    gitStatus.files.length > 0
      ? `${gitStatus.files.length} file${
          gitStatus.files.length === 1 ? "" : "s"
        } changed`
      : "Working tree clean";

  const {
    setActiveThreadId,
    activeThreadId,
    activeItems,
    approvals,
    threadsByWorkspace,
    threadStatusById,
    threadListLoadingByWorkspace,
    threadListPagingByWorkspace,
    threadListCursorByWorkspace,
    activeTurnIdByThread,
    tokenUsageByThread,
    rateLimitsByWorkspace,
    planByThread,
    lastAgentMessageByThread,
    interruptTurn,
    removeThread,
    startThreadForWorkspace,
    listThreadsForWorkspace,
    loadOlderThreadsForWorkspace,
    sendUserMessage,
    startReview,
    handleApprovalDecision
  } = useThreads({
    activeWorkspace,
    onWorkspaceConnected: markWorkspaceConnected,
    onDebug: addDebugEntry,
    model: resolvedModel,
    effort: selectedEffort,
    accessMode,
    customPrompts: prompts,
    onMessageActivity: refreshGitStatus
  });

  const { handleCopyThread } = useCopyThread({
    activeItems,
    onDebug: addDebugEntry,
  });

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
          workspaceId: workspace.id,
          isProcessing: threadStatusById[thread.id]?.isProcessing ?? false
        });
      });
    });
    return entries.sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
  }, [
    lastAgentMessageByThread,
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
  const canInterrupt = activeThreadId
    ? Boolean(
        threadStatusById[activeThreadId]?.isProcessing &&
          activeTurnIdByThread[activeThreadId]
      )
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
    setCenterMode("diff");
    setGitPanelMode("diff");
    if (isCompact) {
      setActiveTab("git");
    }
  }

  function handleActiveDiffPath(path: string) {
    if (path !== selectedDiffPath) {
      setSelectedDiffPath(path);
    }
  }

  function handleDiffLineReference(reference: DiffLineReference) {
    const startLine = reference.newLine ?? reference.oldLine;
    const endLine =
      reference.endNewLine ?? reference.endOldLine ?? startLine ?? null;
    const lineRange =
      startLine && endLine && endLine !== startLine
        ? `${startLine}-${endLine}`
        : startLine
        ? `${startLine}`
        : null;
    const lineLabel = lineRange
      ? `${reference.path}:${lineRange}`
      : reference.path;
    const changeLabel =
      reference.type === "add"
        ? "added"
        : reference.type === "del"
        ? "removed"
        : reference.type === "mixed"
        ? "mixed"
        : "context";
    const snippet = reference.lines.join("\n").trimEnd();
    const snippetBlock = snippet ? `\n\`\`\`\n${snippet}\n\`\`\`` : "";
    const label = reference.lines.length > 1 ? "Line range" : "Line reference";
    const text = `${label} (${changeLabel}): ${lineLabel}${snippetBlock}`;
    setComposerInsert({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      createdAt: Date.now()
    });
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
    const ordered = workspaces
      .filter((entry) => (entry.kind ?? "main") !== "worktree")
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
  const appClassName = `app ${isCompact ? "layout-compact" : "layout-desktop"}${
    isPhone ? " layout-phone" : ""
  }${isTablet ? " layout-tablet" : ""}${
    reduceTransparency ? " reduced-transparency" : ""
  }${!isCompact && sidebarCollapsed ? " sidebar-collapsed" : ""}${
    !isCompact && rightPanelCollapsed ? " right-panel-collapsed" : ""
  }`;
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
    threadsByWorkspace,
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
    onToggleFilePanel: () => {
      setFilePanelMode((prev) => (prev === "git" ? "files" : "git"));
    },
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
    onGitPanelModeChange: setGitPanelMode,
    gitStatus,
    fileStatus,
    selectedDiffPath,
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
    gitRemoteUrl,
    gitDiffs,
    gitDiffLoading: isDiffLoading,
    gitDiffError: diffError,
    onDiffLineReference: handleDiffLineReference,
    onDiffActivePathChange: handleActiveDiffPath,
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
          workspaces={workspaces}
          onClose={() => {
            setSettingsOpen(false);
            setSettingsSection(null);
          }}
          onMoveWorkspace={handleMoveWorkspace}
          onDeleteWorkspace={(workspaceId) => {
            void removeWorkspace(workspaceId);
          }}
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
