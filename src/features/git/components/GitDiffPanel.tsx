import type { GitHubIssue, GitHubPullRequest, GitLogEntry } from "../../../types";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useI18n } from "@/i18n";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import FileText from "lucide-react/dist/esm/icons/file-text";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Search from "lucide-react/dist/esm/icons/search";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PanelTabId } from "../../layout/components/PanelTabs";
import { PanelShell } from "../../layout/components/PanelShell";
import { pushErrorToast } from "../../../services/toasts";
import {
  fileManagerName,
  isAbsolutePath as isAbsolutePathForPlatform,
} from "../../../utils/platformPaths";
import {
  GitBranchRow,
  GitDiffModeContent,
  GitIssuesModeContent,
  GitLogModeContent,
  GitPerFileModeContent,
  GitPanelModeStatus,
  GitPullRequestsModeContent,
  GitRootCurrentPath,
} from "./GitDiffPanelModeContent";
import {
  SidebarError,
  type SidebarErrorAction,
} from "./GitDiffPanelShared";
import {
  getFileName,
  getGitHubBaseUrl,
  getRelativePathWithin,
  hasPushSyncConflict,
  isMissingRepo,
  joinRootAndPath,
  normalizeRootPath,
  resolveRootPath,
} from "./GitDiffPanel.utils";
import { useDiffFileSelection } from "../hooks/useDiffFileSelection";
import type { GitPanelMode } from "../types";
import type { PerFileDiffGroup } from "../utils/perFileThreadDiffs";

type GitDiffPanelProps = {
  workspaceId?: string | null;
  workspacePath?: string | null;
  mode: GitPanelMode;
  onModeChange: (mode: GitPanelMode) => void;
  filePanelMode: PanelTabId;
  onFilePanelModeChange: (mode: PanelTabId) => void;
  worktreeApplyLabel?: string;
  worktreeApplyTitle?: string | null;
  worktreeApplyLoading?: boolean;
  worktreeApplyError?: string | null;
  worktreeApplySuccess?: boolean;
  onApplyWorktreeChanges?: () => void | Promise<void>;
  onRevertAllChanges?: () => void | Promise<void>;
  branchName: string;
  totalAdditions: number;
  totalDeletions: number;
  fileStatus: string;
  perFileDiffGroups?: PerFileDiffGroup[];
  error?: string | null;
  logError?: string | null;
  logLoading?: boolean;
  logTotal?: number;
  logAhead?: number;
  logBehind?: number;
  logAheadEntries?: GitLogEntry[];
  logBehindEntries?: GitLogEntry[];
  logUpstream?: string | null;
  issues?: GitHubIssue[];
  issuesTotal?: number;
  issuesLoading?: boolean;
  issuesError?: string | null;
  pullRequests?: GitHubPullRequest[];
  pullRequestsTotal?: number;
  pullRequestsLoading?: boolean;
  pullRequestsError?: string | null;
  selectedPullRequest?: number | null;
  onSelectPullRequest?: (pullRequest: GitHubPullRequest) => void;
  gitRemoteUrl?: string | null;
  gitRoot?: string | null;
  gitRootCandidates?: string[];
  gitRootScanDepth?: number;
  gitRootScanLoading?: boolean;
  gitRootScanError?: string | null;
  gitRootScanHasScanned?: boolean;
  onGitRootScanDepthChange?: (depth: number) => void;
  onScanGitRoots?: () => void;
  onSelectGitRoot?: (path: string) => void;
  onClearGitRoot?: () => void;
  onPickGitRoot?: () => void | Promise<void>;
  onInitGitRepo?: () => void | Promise<void>;
  initGitRepoLoading?: boolean;
  selectedPath?: string | null;
  onSelectFile?: (path: string) => void;
  stagedFiles: {
    path: string;
    status: string;
    additions: number;
    deletions: number;
  }[];
  unstagedFiles: {
    path: string;
    status: string;
    additions: number;
    deletions: number;
  }[];
  onStageAllChanges?: () => void | Promise<void>;
  onStageFile?: (path: string) => Promise<void> | void;
  onUnstageFile?: (path: string) => Promise<void> | void;
  onRevertFile?: (path: string) => Promise<void> | void;
  onReviewUncommittedChanges?: (workspaceId?: string | null) => void | Promise<void>;
  logEntries: GitLogEntry[];
  selectedCommitSha?: string | null;
  onSelectCommit?: (entry: GitLogEntry) => void;
  commitMessage?: string;
  commitMessageLoading?: boolean;
  commitMessageError?: string | null;
  onCommitMessageChange?: (value: string) => void;
  onGenerateCommitMessage?: () => void | Promise<void>;
  // Git operations
  onCommit?: () => void | Promise<void>;
  onCommitAndPush?: () => void | Promise<void>;
  onCommitAndSync?: () => void | Promise<void>;
  onPull?: () => void | Promise<void>;
  onFetch?: () => void | Promise<void>;
  onPush?: () => void | Promise<void>;
  onSync?: () => void | Promise<void>;
  commitLoading?: boolean;
  pullLoading?: boolean;
  fetchLoading?: boolean;
  pushLoading?: boolean;
  syncLoading?: boolean;
  commitError?: string | null;
  pullError?: string | null;
  fetchError?: string | null;
  pushError?: string | null;
  syncError?: string | null;
  // For showing push button when there are commits to push
  commitsAhead?: number;
};

export function GitDiffPanel({
  workspaceId = null,
  workspacePath = null,
  mode,
  onModeChange,
  filePanelMode,
  onFilePanelModeChange,
  worktreeApplyTitle = null,
  worktreeApplyLoading = false,
  worktreeApplyError = null,
  worktreeApplySuccess = false,
  onApplyWorktreeChanges,
  onRevertAllChanges: _onRevertAllChanges,
  branchName,
  totalAdditions,
  totalDeletions,
  fileStatus,
  perFileDiffGroups = [],
  error,
  logError,
  logLoading = false,
  logTotal = 0,
  gitRemoteUrl = null,
  onSelectFile,
  logEntries,
  logAhead = 0,
  logBehind = 0,
  logAheadEntries = [],
  logBehindEntries = [],
  logUpstream = null,
  selectedCommitSha = null,
  onSelectCommit,
  issues = [],
  issuesTotal = 0,
  issuesLoading = false,
  issuesError = null,
  pullRequests = [],
  pullRequestsTotal = 0,
  pullRequestsLoading = false,
  pullRequestsError = null,
  selectedPullRequest = null,
  onSelectPullRequest,
  gitRoot = null,
  gitRootCandidates = [],
  gitRootScanDepth = 2,
  gitRootScanLoading = false,
  gitRootScanError = null,
  gitRootScanHasScanned = false,
  selectedPath = null,
  stagedFiles = [],
  unstagedFiles = [],
  onStageAllChanges,
  onStageFile,
  onUnstageFile,
  onRevertFile,
  onReviewUncommittedChanges,
  onGitRootScanDepthChange,
  onScanGitRoots,
  onSelectGitRoot,
  onClearGitRoot,
  onPickGitRoot,
  onInitGitRepo,
  initGitRepoLoading = false,
  commitMessage = "",
  commitMessageLoading = false,
  commitMessageError = null,
  onCommitMessageChange,
  onGenerateCommitMessage,
  onCommit,
  onCommitAndPush: _onCommitAndPush,
  onCommitAndSync: _onCommitAndSync,
  onPull,
  onFetch,
  onPush,
  onSync: _onSync,
  commitLoading = false,
  pullLoading = false,
  fetchLoading = false,
  pushLoading = false,
  syncLoading: _syncLoading = false,
  commitError = null,
  pullError = null,
  fetchError = null,
  pushError = null,
  syncError = null,
  commitsAhead = 0,
}: GitDiffPanelProps) {
  const { tx } = useI18n();
  const [dismissedErrorSignatures, setDismissedErrorSignatures] = useState<Set<string>>(
    new Set(),
  );
  const {
    selectedFiles,
    handleFileClick,
    handleDiffListClick,
    selectOnlyFile,
  } = useDiffFileSelection({
    stagedFiles,
    unstagedFiles,
    onSelectFile,
  });

  const ModeIcon = useMemo(() => {
    switch (mode) {
      case "log":
        return ScrollText;
      case "issues":
        return Search;
      case "prs":
        return GitBranch;
      default:
        return FileText;
    }
  }, [mode]);

  const pushNeedsSync = useMemo(() => hasPushSyncConflict(pushError), [pushError]);
  const pushErrorMessage = useMemo(() => {
    if (!pushError) {
      return null;
    }
    if (!pushNeedsSync) {
      return pushError;
    }
    return `${tx("Remote has new commits. Sync (pull then push) before retrying.")}\n\n${pushError}`;
  }, [pushError, pushNeedsSync, tx]);

  const handleSyncFromError = useCallback(() => {
    void _onSync?.();
  }, [_onSync]);

  const pushErrorAction = useMemo<SidebarErrorAction | null>(() => {
    if (!pushNeedsSync || !_onSync) {
      return null;
    }
    return {
      label: _syncLoading ? tx("Syncing...") : tx("Sync (pull then push)"),
      onAction: handleSyncFromError,
      disabled: _syncLoading,
      loading: _syncLoading,
    };
  }, [pushNeedsSync, _onSync, _syncLoading, handleSyncFromError, tx]);

  const githubBaseUrl = useMemo(() => getGitHubBaseUrl(gitRemoteUrl), [gitRemoteUrl]);

  const showLogMenu = useCallback(
    async (event: ReactMouseEvent<HTMLDivElement>, entry: GitLogEntry) => {
      event.preventDefault();
      event.stopPropagation();

      const copyItem = await MenuItem.new({
        text: tx("Copy SHA"),
        action: async () => {
          await navigator.clipboard.writeText(entry.sha);
        },
      });

      const items = [copyItem];
      if (githubBaseUrl) {
        const openItem = await MenuItem.new({
          text: tx("Open on GitHub"),
          action: async () => {
            await openUrl(`${githubBaseUrl}/commit/${entry.sha}`);
          },
        });
        items.push(openItem);
      }

      const menu = await Menu.new({ items });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [githubBaseUrl, tx],
  );

  const showPullRequestMenu = useCallback(
    async (event: ReactMouseEvent<HTMLDivElement>, pullRequest: GitHubPullRequest) => {
      event.preventDefault();
      event.stopPropagation();

      const openItem = await MenuItem.new({
        text: tx("Open on GitHub"),
        action: async () => {
          await openUrl(pullRequest.url);
        },
      });

      const menu = await Menu.new({ items: [openItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [tx],
  );

  const discardFiles = useCallback(
    async (paths: string[]) => {
      if (!onRevertFile) {
        return;
      }

      const isSingle = paths.length === 1;
      const previewLimit = 6;
      const preview = paths.slice(0, previewLimit).join("\n");
      const more =
        paths.length > previewLimit
          ? tx("\n… and {count} more", { count: paths.length - previewLimit })
          : "";
      const message = isSingle
        ? tx("Discard changes in:\n\n{path}\n\nThis cannot be undone.", {
            path: paths[0],
          })
        : tx("Discard changes in these files?\n\n{preview}{more}\n\nThis cannot be undone.", {
            preview,
            more,
          });
      const confirmed = await ask(message, {
        title: tx("Discard changes"),
        kind: "warning",
      });
      if (!confirmed) {
        return;
      }

      for (const path of paths) {
        await onRevertFile(path);
      }
    },
    [onRevertFile, tx],
  );

  const discardFile = useCallback(
    async (path: string) => {
      await discardFiles([path]);
    },
    [discardFiles],
  );

  const showFileMenu = useCallback(
    async (
      event: ReactMouseEvent<HTMLDivElement>,
      path: string,
      _section: "staged" | "unstaged",
    ) => {
      event.preventDefault();
      event.stopPropagation();

      const isInSelection = selectedFiles.has(path);
      const targetPaths = isInSelection && selectedFiles.size > 1 ? Array.from(selectedFiles) : [path];

      if (!isInSelection) {
        selectOnlyFile(path);
      }

      const fileCount = targetPaths.length;
      const normalizedRoot = resolveRootPath(gitRoot, workspacePath);
      const inferredRoot =
        !normalizedRoot && gitRootCandidates.length === 1
          ? resolveRootPath(gitRootCandidates[0], workspacePath)
          : "";
      const fallbackRoot = normalizeRootPath(workspacePath);
      const resolvedRoot = normalizedRoot || inferredRoot || fallbackRoot;

      const stagedPaths = targetPaths.filter((targetPath) =>
        stagedFiles.some((file) => file.path === targetPath),
      );
      const unstagedPaths = targetPaths.filter((targetPath) =>
        unstagedFiles.some((file) => file.path === targetPath),
      );

      const items: MenuItem[] = [];

      if (stagedPaths.length > 0 && onUnstageFile) {
        items.push(
          await MenuItem.new({
            text:
              stagedPaths.length > 1
                ? tx("Unstage files ({count})", { count: stagedPaths.length })
                : tx("Unstage file"),
            action: async () => {
              for (const stagedPath of stagedPaths) {
                await onUnstageFile(stagedPath);
              }
            },
          }),
        );
      }

      if (unstagedPaths.length > 0 && onStageFile) {
        items.push(
          await MenuItem.new({
            text:
              unstagedPaths.length > 1
                ? tx("Stage files ({count})", { count: unstagedPaths.length })
                : tx("Stage file"),
            action: async () => {
              for (const unstagedPath of unstagedPaths) {
                await onStageFile(unstagedPath);
              }
            },
          }),
        );
      }

      if (targetPaths.length === 1) {
        const fileManagerLabel = fileManagerName();
        const rawPath = targetPaths[0];
        const absolutePath = resolvedRoot ? joinRootAndPath(resolvedRoot, rawPath) : rawPath;
        const relativeRoot =
          workspacePath && resolvedRoot ? getRelativePathWithin(workspacePath, resolvedRoot) : null;
        const projectRelativePath =
          relativeRoot !== null ? joinRootAndPath(relativeRoot, rawPath) : rawPath;
        const fileName = getFileName(rawPath);

        items.push(
          await MenuItem.new({
            text: tx("Show in {app}", { app: fileManagerLabel }),
            action: async () => {
              try {
                if (!resolvedRoot && !isAbsolutePathForPlatform(absolutePath)) {
                  pushErrorToast({
                    title: tx("Couldn't show file in {app}", { app: fileManagerLabel }),
                    message: tx("Select a git root first."),
                  });
                  return;
                }
                const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
                await revealItemInDir(absolutePath);
              } catch (menuError) {
                const message = menuError instanceof Error ? menuError.message : String(menuError);
                pushErrorToast({
                  title: tx("Couldn't show file in {app}", { app: fileManagerLabel }),
                  message,
                });
                console.warn("Failed to reveal file", {
                  message,
                  path: absolutePath,
                });
              }
            },
          }),
        );

        items.push(
          await MenuItem.new({
            text: tx("Copy file name"),
            action: async () => {
              await navigator.clipboard.writeText(fileName);
            },
          }),
          await MenuItem.new({
            text: tx("Copy file path"),
            action: async () => {
              await navigator.clipboard.writeText(projectRelativePath);
            },
          }),
        );
      }

      if (onRevertFile) {
        items.push(
          await MenuItem.new({
            text:
              fileCount > 1
                ? tx("Discard changes ({count})", { count: fileCount })
                : tx("Discard change"),
            action: async () => {
              await discardFiles(targetPaths);
            },
          }),
        );
      }

      if (!items.length) {
        return;
      }

      const menu = await Menu.new({ items });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [
      selectedFiles,
      selectOnlyFile,
      stagedFiles,
      unstagedFiles,
      onUnstageFile,
      onStageFile,
      onRevertFile,
      discardFiles,
      gitRoot,
      gitRootCandidates,
      workspacePath,
      tx,
    ],
  );

  const logCountLabel = logTotal
    ? logTotal === 1
      ? tx("{count} commit", { count: logTotal })
      : tx("{count} commits", { count: logTotal })
    : logEntries.length
      ? logEntries.length === 1
        ? tx("{count} commit", { count: logEntries.length })
        : tx("{count} commits", { count: logEntries.length })
      : tx("No commits");
  const logSyncLabel = logUpstream ? `↑${logAhead} ↓${logBehind}` : tx("No upstream configured");
  const logUpstreamLabel = logUpstream ? tx("Upstream {upstream}", { upstream: logUpstream }) : "";
  const showAheadSection = Boolean(logUpstream && logAhead > 0);
  const showBehindSection = Boolean(logUpstream && logBehind > 0);
  const hasDiffTotals = totalAdditions > 0 || totalDeletions > 0;
  const perFileEditCount = perFileDiffGroups.reduce(
    (total, group) => total + group.edits.length,
    0,
  );
  const perFileDiffStatusLabel = tx("{files} files · {edits} edits", {
    files: perFileDiffGroups.length,
    edits: perFileEditCount,
  });
  const diffTotalsLabel = `+${totalAdditions} / -${totalDeletions}`;
  const diffStatusLabel = hasDiffTotals
    ? [logUpstream ? logSyncLabel : null, diffTotalsLabel].filter(Boolean).join(" · ")
    : logUpstream
      ? `${logSyncLabel} · ${fileStatus}`
      : fileStatus;
  const hasGitRoot = Boolean(gitRoot && gitRoot.trim());
  const showGitRootPanel =
    isMissingRepo(error) ||
    gitRootScanLoading ||
    gitRootScanHasScanned ||
    Boolean(gitRootScanError) ||
    gitRootCandidates.length > 0;
  const normalizedGitRoot = normalizeRootPath(gitRoot);
  const errorScope = `${workspaceId ?? "no-workspace"}:${normalizedGitRoot || "no-git-root"}:${mode}`;
  const hasAnyChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;
  const showApplyWorktree = mode === "diff" && Boolean(onApplyWorktreeChanges) && hasAnyChanges;
  const canGenerateCommitMessage = hasAnyChanges;
  const showGenerateCommitMessage = mode === "diff" && Boolean(onGenerateCommitMessage) && hasAnyChanges;
  const commitsBehind = logBehind;

  const sidebarErrorCandidates = useMemo(() => {
    const options: Array<{
      key: string;
      message: string | null | undefined;
      action?: SidebarErrorAction;
    }> =
      mode === "diff" || mode === "perFile"
        ? [
            { key: "push", message: pushErrorMessage, action: pushErrorAction ?? undefined },
            { key: "pull", message: pullError },
            { key: "fetch", message: fetchError },
            { key: "commit", message: commitError },
            { key: "sync", message: syncError },
            { key: "commitMessage", message: commitMessageError },
            { key: "git", message: error },
            { key: "worktreeApply", message: worktreeApplyError },
            { key: "gitRootScan", message: gitRootScanError },
          ]
        : mode === "log"
          ? [{ key: "log", message: logError }]
          : mode === "issues"
            ? [{ key: "issues", message: issuesError }]
            : [{ key: "pullRequests", message: pullRequestsError }];

    return options
      .filter((entry) => Boolean(entry.message))
      .map((entry) => ({
        ...entry,
        signature: `${errorScope}:${entry.key}:${entry.message}`,
        message: entry.message as string,
      }));
  }, [
    commitError,
    commitMessageError,
    error,
    fetchError,
    gitRootScanError,
    issuesError,
    logError,
    pullRequestsError,
    pullError,
    pushErrorAction,
    pushErrorMessage,
    syncError,
    worktreeApplyError,
    errorScope,
    mode,
  ]);

  const sidebarError = useMemo(
    () =>
      sidebarErrorCandidates.find((entry) => !dismissedErrorSignatures.has(entry.signature)) ??
      null,
    [dismissedErrorSignatures, sidebarErrorCandidates],
  );

  useEffect(() => {
    const activeSignatures = new Set(sidebarErrorCandidates.map((entry) => entry.signature));
    setDismissedErrorSignatures((previous) => {
      let changed = false;
      const next = new Set<string>();
      previous.forEach((signature) => {
        if (activeSignatures.has(signature)) {
          next.add(signature);
        } else {
          changed = true;
        }
      });
      return changed || next.size !== previous.size ? next : previous;
    });
  }, [sidebarErrorCandidates]);

  const showSidebarError = Boolean(sidebarError);

  return (
    <PanelShell
      filePanelMode={filePanelMode}
      onFilePanelModeChange={onFilePanelModeChange}
      headerClassName="git-panel-header"
      headerRight={
        <div className="git-panel-actions" role="group" aria-label={tx("Git panel")}>
          <div className="git-panel-select">
            <span className="git-panel-select-icon" aria-hidden>
              <ModeIcon />
            </span>
            <select
              className="git-panel-select-input"
              value={mode}
              onChange={(event) => onModeChange(event.target.value as GitDiffPanelProps["mode"])}
              aria-label={tx("Git panel view")}
            >
              <option value="diff">{tx("Diff")}</option>
              <option value="perFile">{tx("Agent edits")}</option>
              <option value="log">{tx("Log")}</option>
              <option value="issues">{tx("Issues")}</option>
              <option value="prs">{tx("PRs")}</option>
            </select>
          </div>
        </div>
      }
    >
      <div className="git-panel-overview">
        <div className="git-panel-overview-status">
          <GitPanelModeStatus
            mode={mode}
            diffStatusLabel={diffStatusLabel}
            perFileDiffStatusLabel={perFileDiffStatusLabel}
            logCountLabel={logCountLabel}
            logSyncLabel={logSyncLabel}
            logUpstreamLabel={logUpstreamLabel}
            issuesLoading={issuesLoading}
            issuesTotal={issuesTotal}
            pullRequestsLoading={pullRequestsLoading}
            pullRequestsTotal={pullRequestsTotal}
          />
        </div>

        <GitBranchRow
          mode={mode}
          branchName={branchName}
          onFetch={onFetch}
          fetchLoading={fetchLoading}
        />

        <GitRootCurrentPath
          mode={mode}
          hasGitRoot={hasGitRoot}
          gitRoot={gitRoot}
          onScanGitRoots={onScanGitRoots}
          gitRootScanLoading={gitRootScanLoading}
        />
      </div>

      {mode === "diff" ? (
        <GitDiffModeContent
          error={error}
          showGitRootPanel={showGitRootPanel}
          onScanGitRoots={onScanGitRoots}
          gitRootScanLoading={gitRootScanLoading}
          gitRootScanDepth={gitRootScanDepth}
          onGitRootScanDepthChange={onGitRootScanDepthChange}
          onPickGitRoot={onPickGitRoot}
          onInitGitRepo={onInitGitRepo}
          initGitRepoLoading={initGitRepoLoading}
          hasGitRoot={hasGitRoot}
          onClearGitRoot={onClearGitRoot}
          gitRootScanError={gitRootScanError}
          gitRootScanHasScanned={gitRootScanHasScanned}
          gitRootCandidates={gitRootCandidates}
          gitRoot={gitRoot}
          onSelectGitRoot={onSelectGitRoot}
          showGenerateCommitMessage={showGenerateCommitMessage}
          showApplyWorktree={showApplyWorktree}
          commitMessage={commitMessage}
          onCommitMessageChange={onCommitMessageChange}
          commitMessageLoading={commitMessageLoading}
          canGenerateCommitMessage={canGenerateCommitMessage}
          onGenerateCommitMessage={onGenerateCommitMessage}
          worktreeApplyTitle={worktreeApplyTitle}
          worktreeApplyLoading={worktreeApplyLoading}
          worktreeApplySuccess={worktreeApplySuccess}
          onApplyWorktreeChanges={onApplyWorktreeChanges}
          stagedFiles={stagedFiles}
          unstagedFiles={unstagedFiles}
          commitLoading={commitLoading}
          onCommit={onCommit}
          commitsAhead={commitsAhead}
          commitsBehind={commitsBehind}
          onPull={onPull}
          pullLoading={pullLoading}
          onPush={onPush}
          pushLoading={pushLoading}
          onSync={_onSync}
          syncLoading={_syncLoading}
          onStageAllChanges={onStageAllChanges}
          onStageFile={onStageFile}
          onUnstageFile={onUnstageFile}
          onDiscardFile={onRevertFile ? discardFile : undefined}
          onDiscardFiles={onRevertFile ? discardFiles : undefined}
          onReviewUncommittedChanges={
            onReviewUncommittedChanges
              ? () => onReviewUncommittedChanges(workspaceId)
              : undefined
          }
          selectedFiles={selectedFiles}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          onFileClick={handleFileClick}
          onShowFileMenu={showFileMenu}
          onDiffListClick={handleDiffListClick}
        />
      ) : mode === "perFile" ? (
        <GitPerFileModeContent
          groups={perFileDiffGroups}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      ) : mode === "log" ? (
        <GitLogModeContent
          logError={logError}
          logLoading={logLoading}
          logEntries={logEntries}
          showAheadSection={showAheadSection}
          showBehindSection={showBehindSection}
          logAheadEntries={logAheadEntries}
          logBehindEntries={logBehindEntries}
          selectedCommitSha={selectedCommitSha}
          onSelectCommit={onSelectCommit}
          onShowLogMenu={showLogMenu}
        />
      ) : mode === "issues" ? (
        <GitIssuesModeContent
          issuesError={issuesError}
          issuesLoading={issuesLoading}
          issues={issues}
        />
      ) : (
        <GitPullRequestsModeContent
          pullRequestsError={pullRequestsError}
          pullRequestsLoading={pullRequestsLoading}
          pullRequests={pullRequests}
          selectedPullRequest={selectedPullRequest}
          onSelectPullRequest={onSelectPullRequest}
          onShowPullRequestMenu={showPullRequestMenu}
        />
      )}

      {showSidebarError && sidebarError && (
        <SidebarError
          message={sidebarError.message}
          action={sidebarError.action ?? null}
          onDismiss={() =>
            setDismissedErrorSignatures((previous) => {
              if (previous.has(sidebarError.signature)) {
                return previous;
              }
              const next = new Set(previous);
              next.add(sidebarError.signature);
              return next;
            })
          }
        />
      )}
    </PanelShell>
  );
}
