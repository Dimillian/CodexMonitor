import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubPullRequest, GitHubPullRequestDiff, WorkspaceInfo } from "../../../types";
import { useGitStatus } from "../../git/hooks/useGitStatus";
import { useGitDiffs } from "../../git/hooks/useGitDiffs";
import { useGitLog } from "../../git/hooks/useGitLog";
import { useGitCommitDiffs } from "../../git/hooks/useGitCommitDiffs";

export function useGitPanelController({
  activeWorkspace,
  isCompact,
  isTablet,
  activeTab,
  tabletTab,
  setActiveTab,
  prDiffs,
  prDiffsLoading,
  prDiffsError,
}: {
  activeWorkspace: WorkspaceInfo | null;
  isCompact: boolean;
  isTablet: boolean;
  activeTab: "projects" | "codex" | "git" | "log";
  tabletTab: "codex" | "git" | "log";
  setActiveTab: (tab: "projects" | "codex" | "git" | "log") => void;
  prDiffs: GitHubPullRequestDiff[];
  prDiffsLoading: boolean;
  prDiffsError: string | null;
}) {
  const [centerMode, setCenterMode] = useState<"chat" | "diff">("chat");
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null);
  const [diffScrollRequestId, setDiffScrollRequestId] = useState(0);
  const pendingDiffScrollRef = useRef(false);
  const [gitPanelMode, setGitPanelMode] = useState<
    "diff" | "log" | "issues" | "prs"
  >("diff");
  const [gitDiffViewStyle, setGitDiffViewStyle] = useState<
    "split" | "unified"
  >("split");
  const [filePanelMode, setFilePanelMode] = useState<
    "git" | "files" | "prompts"
  >("git");
  const [selectedPullRequest, setSelectedPullRequest] =
    useState<GitHubPullRequest | null>(null);
  const [selectedCommitSha, setSelectedCommitSha] = useState<string | null>(
    null,
  );
  const [diffSource, setDiffSource] = useState<"local" | "pr" | "commit">(
    "local",
  );

  const { status: gitStatus, refresh: refreshGitStatus } = useGitStatus(
    activeWorkspace,
  );
  const gitStatusRefreshTimeoutRef = useRef<number | null>(null);
  const activeWorkspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);
  const activeWorkspaceRef = useRef(activeWorkspace);

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspace?.id ?? null;
  }, [activeWorkspace?.id]);

  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
  }, [activeWorkspace]);

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

  const preloadedWorkspaceIdsRef = useRef<Set<string>>(new Set());
  const compactTab = isTablet ? tabletTab : activeTab;
  const diffUiVisible =
    centerMode === "diff" ||
    (isCompact ? compactTab === "git" : gitPanelMode === "diff");
  const shouldPreloadDiffs = Boolean(
    activeWorkspace && !preloadedWorkspaceIdsRef.current.has(activeWorkspace.id),
  );
  const shouldLoadDiffs =
    Boolean(activeWorkspace) && (diffUiVisible || shouldPreloadDiffs);
  const shouldLoadGitLog = gitPanelMode === "log" && Boolean(activeWorkspace);

  const {
    diffs: gitDiffs,
    isLoading: isDiffLoading,
    error: diffError,
    refresh: refreshGitDiffs,
  } = useGitDiffs(activeWorkspace, gitStatus.files, shouldLoadDiffs);

  useEffect(() => {
    if (!activeWorkspace || !shouldPreloadDiffs) {
      return;
    }
    if (!isDiffLoading && !diffError && gitDiffs.length === 0) {
      return;
    }
    preloadedWorkspaceIdsRef.current.add(activeWorkspace.id);
  }, [
    activeWorkspace,
    diffError,
    gitDiffs.length,
    isDiffLoading,
    shouldPreloadDiffs,
  ]);

  const {
    entries: gitLogEntries,
    total: gitLogTotal,
    ahead: gitLogAhead,
    behind: gitLogBehind,
    aheadEntries: gitLogAheadEntries,
    behindEntries: gitLogBehindEntries,
    upstream: gitLogUpstream,
    isLoading: gitLogLoading,
    error: gitLogError,
    refresh: refreshGitLog,
  } = useGitLog(activeWorkspace, shouldLoadGitLog);

  const {
    diffs: gitCommitDiffs,
    isLoading: gitCommitDiffsLoading,
    error: gitCommitDiffsError,
  } = useGitCommitDiffs(
    activeWorkspace,
    selectedCommitSha,
    shouldLoadDiffs && diffSource === "commit",
  );

  const activeDiffs =
    diffSource === "commit"
      ? gitCommitDiffs
      : diffSource === "pr"
        ? prDiffs
        : gitDiffs;
  const activeDiffLoading =
    diffSource === "commit"
      ? gitCommitDiffsLoading
      : diffSource === "pr"
        ? prDiffsLoading
        : isDiffLoading;
  const activeDiffError =
    diffSource === "commit"
      ? gitCommitDiffsError
      : diffSource === "pr"
        ? prDiffsError
        : diffError;

  const handleSelectDiff = useCallback(
    (path: string) => {
      setSelectedDiffPath(path);
      pendingDiffScrollRef.current = true;
      setCenterMode("diff");
      setGitPanelMode("diff");
      setDiffSource("local");
      setSelectedCommitSha(null);
      setSelectedPullRequest(null);
      if (isCompact) {
        setActiveTab("git");
      }
    },
    [isCompact, setActiveTab],
  );

  const handleSelectCommit = useCallback(
    (sha: string) => {
      setSelectedCommitSha(sha);
      setSelectedDiffPath(null);
      pendingDiffScrollRef.current = true;
      setCenterMode("diff");
      setGitPanelMode("log");
      setDiffSource("commit");
      setSelectedPullRequest(null);
      if (isCompact) {
        setActiveTab("git");
      }
    },
    [isCompact, setActiveTab],
  );

  const handleActiveDiffPath = useCallback((path: string) => {
    setSelectedDiffPath(path);
  }, []);

  const handleGitPanelModeChange = useCallback(
    (mode: "diff" | "log" | "issues" | "prs") => {
      setGitPanelMode(mode);
      if (mode !== "prs") {
        if (diffSource === "pr") {
          setSelectedDiffPath(null);
        }
        setDiffSource("local");
        setSelectedPullRequest(null);
      }
      if (mode !== "log") {
        if (diffSource === "commit") {
          setSelectedDiffPath(null);
          setDiffSource("local");
        }
        setSelectedCommitSha(null);
      }
    },
    [diffSource],
  );

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

  return {
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
    gitDiffs,
    isDiffLoading,
    diffError,
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
    gitCommitDiffsLoading,
    gitCommitDiffsError,
    shouldLoadDiffs,
    activeDiffs,
    activeDiffLoading,
    activeDiffError,
    handleSelectDiff,
    handleSelectCommit,
    handleActiveDiffPath,
    handleGitPanelModeChange,
    compactTab,
    activeWorkspaceIdRef,
    activeWorkspaceRef,
  };
}
