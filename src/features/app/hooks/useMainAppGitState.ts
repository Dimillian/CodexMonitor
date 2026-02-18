import { useCallback, useEffect } from "react";
import type {
  ConversationItem,
  DebugEntry,
  SendMessageResult,
  WorkspaceInfo,
} from "@/types";
import { useGitPanelController } from "@app/hooks/useGitPanelController";
import { useGitHubPanelController } from "@app/hooks/useGitHubPanelController";
import { useGitCommitController } from "@app/hooks/useGitCommitController";
import { useGitRootSelection } from "@app/hooks/useGitRootSelection";
import { useGitRemote } from "@/features/git/hooks/useGitRemote";
import { useGitRepoScan } from "@/features/git/hooks/useGitRepoScan";
import { usePullRequestReviewActions } from "@/features/git/hooks/usePullRequestReviewActions";
import { useGitActions } from "@/features/git/hooks/useGitActions";
import { useGitBranches } from "@/features/git/hooks/useGitBranches";
import { useSyncSelectedDiffPath } from "@app/hooks/useSyncSelectedDiffPath";

type UseMainAppGitStateOptions = {
  activeWorkspace: WorkspaceInfo | null;
  activeWorkspaceId: string | null;
  activeItems: ConversationItem[];
  activeThreadId: string | null;
  activeTab: "home" | "projects" | "codex" | "git" | "log";
  tabletTab: "codex" | "git" | "log";
  isCompact: boolean;
  isTablet: boolean;
  setActiveTab: (tab: "home" | "projects" | "codex" | "git" | "log") => void;
  appSettings: {
    preloadGitDiffs: boolean;
    gitDiffIgnoreWhitespaceChanges: boolean;
    splitChatDiffView: boolean;
    reviewDeliveryMode: "inline" | "detached";
  };
  addDebugEntry: (entry: DebugEntry) => void;
  updateWorkspaceSettings: Parameters<typeof useGitRootSelection>[0]["updateWorkspaceSettings"];
  commitMessageModelId: string | null;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { activate?: boolean },
  ) => Promise<string | null>;
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
  ) => Promise<void | SendMessageResult>;
};

type GitStatusSummary = {
  error: unknown;
  files: Array<unknown>;
};

function buildGitStatusText(gitStatus: GitStatusSummary) {
  if (gitStatus.error) {
    return "Git status unavailable";
  }
  return gitStatus.files.length > 0
    ? `${gitStatus.files.length} file${gitStatus.files.length === 1 ? "" : "s"} changed`
    : "Working tree clean";
}

function resolveShouldLoadGitHubPanelData({
  gitPanelMode,
  shouldLoadDiffs,
  diffSource,
}: {
  gitPanelMode: "diff" | "issues" | "log" | "perFile" | "prs";
  shouldLoadDiffs: boolean;
  diffSource: "commit" | "local" | "perFile" | "pr";
}) {
  return (
    gitPanelMode === "issues" ||
    gitPanelMode === "prs" ||
    (shouldLoadDiffs && diffSource === "pr")
  );
}

function useMainAppGitBranchActions({
  activeWorkspace,
  addDebugEntry,
  refreshGitStatus,
  refreshGitLog,
  currentBranch,
}: {
  activeWorkspace: WorkspaceInfo | null;
  addDebugEntry: (entry: DebugEntry) => void;
  refreshGitStatus: () => void;
  refreshGitLog: () => void;
  currentBranch: string | null;
}) {
  const { branches, checkoutBranch, checkoutPullRequest, createBranch } = useGitBranches({
    activeWorkspace,
    onDebug: addDebugEntry,
  });

  const alertError = useCallback((error: unknown) => {
    alert(error instanceof Error ? error.message : String(error));
  }, []);

  const handleCheckoutBranch = useCallback(
    async (name: string) => {
      await checkoutBranch(name);
      refreshGitStatus();
    },
    [checkoutBranch, refreshGitStatus],
  );

  const handleCheckoutPullRequest = useCallback(
    async (prNumber: number) => {
      try {
        await checkoutPullRequest(prNumber);
        await Promise.resolve(refreshGitStatus());
        await Promise.resolve(refreshGitLog());
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, checkoutPullRequest, refreshGitLog, refreshGitStatus],
  );

  const handleCreateBranch = useCallback(
    async (name: string) => {
      await createBranch(name);
      refreshGitStatus();
    },
    [createBranch, refreshGitStatus],
  );

  return {
    branches,
    currentBranch,
    isBranchSwitcherEnabled: Boolean(activeWorkspace?.connected) && activeWorkspace?.kind !== "worktree",
    handleCheckoutBranch,
    handleCheckoutPullRequest,
    handleCreateBranch,
  };
}

function useMainAppPullRequestReviewState({
  activeWorkspace,
  activeThreadId,
  reviewDeliveryMode,
  pullRequest,
  pullRequestDiffs,
  pullRequestComments,
  connectWorkspace,
  startThreadForWorkspace,
  sendUserMessageToThread,
}: {
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  reviewDeliveryMode: "inline" | "detached";
  pullRequest: Parameters<typeof usePullRequestReviewActions>[0]["pullRequest"];
  pullRequestDiffs: Parameters<typeof usePullRequestReviewActions>[0]["pullRequestDiffs"];
  pullRequestComments: Parameters<typeof usePullRequestReviewActions>[0]["pullRequestComments"];
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { activate?: boolean },
  ) => Promise<string | null>;
  sendUserMessageToThread: (
    workspace: WorkspaceInfo,
    threadId: string,
    text: string,
    images?: string[],
  ) => Promise<void | SendMessageResult>;
}) {
  return usePullRequestReviewActions({
    activeWorkspace,
    activeThreadId,
    reviewDeliveryMode,
    pullRequest,
    pullRequestDiffs,
    pullRequestComments,
    connectWorkspace,
    startThreadForWorkspace,
    sendUserMessageToThread,
  });
}

export function useMainAppGitState({
  activeWorkspace,
  activeWorkspaceId,
  activeItems,
  activeThreadId,
  activeTab,
  tabletTab,
  isCompact,
  isTablet,
  setActiveTab,
  appSettings,
  addDebugEntry,
  updateWorkspaceSettings,
  commitMessageModelId,
  connectWorkspace,
  startThreadForWorkspace,
  sendUserMessageToThread,
}: UseMainAppGitStateOptions) {
  const alertError = useCallback((error: unknown) => {
    alert(error instanceof Error ? error.message : String(error));
  }, []);

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

  const shouldLoadGitHubPanelData = resolveShouldLoadGitHubPanelData({
    gitPanelMode,
    shouldLoadDiffs,
    diffSource,
  });

  const {
    branches,
    currentBranch,
    isBranchSwitcherEnabled,
    handleCheckoutBranch,
    handleCheckoutPullRequest,
    handleCreateBranch,
  } = useMainAppGitBranchActions({
    activeWorkspace,
    addDebugEntry,
    refreshGitStatus,
    refreshGitLog,
    currentBranch: gitStatus.branchName ?? null,
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
    stageGitSelection: handleStageGitSelection,
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

  const { activeGitRoot, handleSetGitRoot, handlePickGitRoot } = useGitRootSelection({
    activeWorkspace,
    updateWorkspaceSettings,
    clearGitRootCandidates,
    refreshGitStatus,
  });

  const fileStatus = buildGitStatusText(gitStatus);

  useSyncSelectedDiffPath({
    diffSource,
    centerMode,
    gitPullRequestDiffs,
    gitCommitDiffs,
    perFileDiffGroups,
    selectedDiffPath,
    setSelectedDiffPath,
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
    commitMessageModelId,
    gitStatus,
    refreshGitStatus,
    refreshGitLog,
  });

  const {
    isLaunchingReview: isLaunchingPullRequestReview,
    lastReviewThreadId: lastPullRequestReviewThreadId,
    reviewActions: pullRequestReviewActions,
    runPullRequestReview,
  } = useMainAppPullRequestReviewState({
    activeWorkspace,
    activeThreadId,
    reviewDeliveryMode: appSettings.reviewDeliveryMode,
    pullRequest: selectedPullRequest,
    pullRequestDiffs: gitPullRequestDiffs,
    pullRequestComments: gitPullRequestComments,
    connectWorkspace,
    startThreadForWorkspace,
    sendUserMessageToThread,
  });

  return {
    activeWorkspaceRef,
    activeWorkspaceIdRef,
    queueGitStatusRefresh,
    alertError,
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
    shouldLoadGitHubPanelData,
    gitIssues,
    gitIssuesTotal,
    gitIssuesLoading,
    gitIssuesError,
    gitPullRequests,
    gitPullRequestsTotal,
    gitPullRequestsLoading,
    gitPullRequestsError,
    gitPullRequestDiffs,
    gitPullRequestComments,
    gitPullRequestCommentsLoading,
    gitPullRequestCommentsError,
    handleGitIssuesChange,
    handleGitPullRequestsChange,
    handleGitPullRequestDiffsChange,
    handleGitPullRequestCommentsChange,
    gitRemoteUrl,
    refreshGitRemote,
    gitRootCandidates,
    gitRootScanLoading,
    gitRootScanError,
    gitRootScanDepth,
    gitRootScanHasScanned,
    scanGitRoots,
    setGitRootScanDepth,
    branches,
    currentBranch,
    isBranchSwitcherEnabled,
    handleCheckoutBranch,
    handleCheckoutPullRequest,
    handleCreateBranch,
    handleApplyWorktreeChanges,
    handleCreateGitHubRepo,
    createGitHubRepoLoading,
    handleInitGitRepo,
    initGitRepoLoading,
    handleRevertAllGitChanges,
    handleRevertGitFile,
    handleStageGitAll,
    handleStageGitFile,
    handleStageGitSelection,
    handleUnstageGitFile,
    worktreeApplyError,
    worktreeApplyLoading,
    worktreeApplySuccess,
    activeGitRoot,
    handleSetGitRoot,
    handlePickGitRoot,
    fileStatus,
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
    handleCommitMessageChange,
    handleGenerateCommitMessage,
    handleCommit,
    handleCommitAndPush,
    handleCommitAndSync,
    handlePull,
    handleFetch,
    handlePush,
    handleSync,
    isLaunchingPullRequestReview,
    lastPullRequestReviewThreadId,
    pullRequestReviewActions,
    runPullRequestReview,
  };
}
