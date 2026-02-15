import type { GitHubIssue, GitHubPullRequest, GitLogEntry } from "../../../types";
import type { MouseEvent as ReactMouseEvent } from "react";
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
import { PanelTabs, type PanelTabId } from "../../layout/components/PanelTabs";
import {
  PanelFrame,
  PanelHeader,
} from "../../design-system/components/panel/PanelPrimitives";
import { pushErrorToast } from "../../../services/toasts";
import {
  fileManagerName,
  isAbsolutePath as isAbsolutePathForPlatform,
} from "../../../utils/platformPaths";
import {
  GitBranchRow,
  GitDiffModeContent,
  GitIssuesModeContent,
  type DiffReviewScope,
  GitLogModeContent,
  GitPanelModeStatus,
  GitPullRequestsModeContent,
  GitRootCurrentPath,
} from "./GitDiffPanelModeContent";
import {
  SidebarError,
  type SidebarErrorAction,
  WorktreeApplyIcon,
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

type GitDiffPanelProps = {
  workspaceId?: string | null;
  workspacePath?: string | null;
  mode: "diff" | "log" | "issues" | "prs";
  onModeChange: (mode: "diff" | "log" | "issues" | "prs") => void;
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
  onGitRootScanDepthChange,
  onScanGitRoots,
  onSelectGitRoot,
  onClearGitRoot,
  onPickGitRoot,
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
  const [dismissedErrorSignatures, setDismissedErrorSignatures] = useState<Set<string>>(
    new Set(),
  );
  const diffScopeStorageKey = workspaceId ? `codex-diff-scope:${workspaceId}` : null;
  const [diffScope, setDiffScopeRaw] = useState<DiffReviewScope>(() => {
    if (diffScopeStorageKey) {
      const saved = sessionStorage.getItem(diffScopeStorageKey);
      if (saved === "uncommitted" || saved === "staged" || saved === "unstaged") {
        return saved;
      }
    }
    return "uncommitted";
  });
  const setDiffScope = useCallback(
    (next: DiffReviewScope) => {
      setDiffScopeRaw(next);
      if (diffScopeStorageKey) {
        sessionStorage.setItem(diffScopeStorageKey, next);
      }
    },
    [diffScopeStorageKey],
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
    return `远端有新提交。请先同步（先拉取再推送）后重试。\n\n${pushError}`;
  }, [pushError, pushNeedsSync]);

  const handleSyncFromError = useCallback(() => {
    void _onSync?.();
  }, [_onSync]);

  const pushErrorAction = useMemo<SidebarErrorAction | null>(() => {
    if (!pushNeedsSync || !_onSync) {
      return null;
    }
    return {
      label: _syncLoading ? "同步中..." : "同步（先拉取再推送）",
      onAction: handleSyncFromError,
      disabled: _syncLoading,
      loading: _syncLoading,
    };
  }, [pushNeedsSync, _onSync, _syncLoading, handleSyncFromError]);

  const githubBaseUrl = useMemo(() => getGitHubBaseUrl(gitRemoteUrl), [gitRemoteUrl]);

  const showLogMenu = useCallback(
    async (event: ReactMouseEvent<HTMLElement>, entry: GitLogEntry) => {
      event.preventDefault();
      event.stopPropagation();

      const copyItem = await MenuItem.new({
        text: "复制 SHA",
        action: async () => {
          await navigator.clipboard.writeText(entry.sha);
        },
      });

      const items = [copyItem];
      if (githubBaseUrl) {
        const openItem = await MenuItem.new({
          text: "在 GitHub 打开",
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
    [githubBaseUrl],
  );

  const showPullRequestMenu = useCallback(
    async (event: ReactMouseEvent<HTMLElement>, pullRequest: GitHubPullRequest) => {
      event.preventDefault();
      event.stopPropagation();

      const openItem = await MenuItem.new({
        text: "在 GitHub 打开",
        action: async () => {
          await openUrl(pullRequest.url);
        },
      });

      const menu = await Menu.new({ items: [openItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [],
  );

  const discardFiles = useCallback(
    async (paths: string[]) => {
      if (!onRevertFile) {
        return;
      }

      const isSingle = paths.length === 1;
      const previewLimit = 6;
      const preview = paths.slice(0, previewLimit).join("\n");
      const more = paths.length > previewLimit ? `\n……以及另外 ${paths.length - previewLimit} 个文件` : "";
      const message = isSingle
        ? `确认丢弃以下文件的更改吗？\n\n${paths[0]}\n\n此操作无法撤销。`
        : `确认丢弃以下文件的更改吗？\n\n${preview}${more}\n\n此操作无法撤销。`;
      const confirmed = await ask(message, {
        title: "丢弃更改",
        kind: "warning",
      });
      if (!confirmed) {
        return;
      }

      for (const path of paths) {
        await onRevertFile(path);
      }
    },
    [onRevertFile],
  );

  const discardFile = useCallback(
    async (path: string) => {
      await discardFiles([path]);
    },
    [discardFiles],
  );

  const showFileMenu = useCallback(
    async (
      event: ReactMouseEvent<HTMLElement>,
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
      const countSuffix = fileCount > 1 ? `（${fileCount} 个）` : "";
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
            text: `取消暂存${stagedPaths.length > 1 ? `（${stagedPaths.length} 个）` : ""}`,
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
            text: `暂存文件${unstagedPaths.length > 1 ? `（${unstagedPaths.length} 个）` : ""}`,
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
            text: `在 ${fileManagerLabel} 中显示`,
            action: async () => {
              try {
                if (!resolvedRoot && !isAbsolutePathForPlatform(absolutePath)) {
                  pushErrorToast({
                    title: `无法在 ${fileManagerLabel} 中显示文件`,
                    message: "请先选择 Git 根目录。",
                  });
                  return;
                }
                const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
                await revealItemInDir(absolutePath);
              } catch (menuError) {
                const message = menuError instanceof Error ? menuError.message : String(menuError);
                pushErrorToast({
                  title: `无法在 ${fileManagerLabel} 中显示文件`,
                  message,
                });
                console.warn("显示文件失败", {
                  message,
                  path: absolutePath,
                });
              }
            },
          }),
        );

        items.push(
          await MenuItem.new({
            text: "复制文件名",
            action: async () => {
              await navigator.clipboard.writeText(fileName);
            },
          }),
          await MenuItem.new({
            text: "复制文件路径",
            action: async () => {
              await navigator.clipboard.writeText(projectRelativePath);
            },
          }),
        );
      }

      if (onRevertFile) {
        items.push(
          await MenuItem.new({
            text: `丢弃更改${countSuffix}`,
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
    ],
  );

  const logCountLabel = logTotal
    ? `${logTotal} 个提交`
    : logEntries.length
      ? `${logEntries.length} 个提交`
      : "暂无提交";
  const logSyncLabel = logUpstream ? `↑${logAhead} ↓${logBehind}` : "未配置上游分支";
  const logUpstreamLabel = logUpstream ? `上游 ${logUpstream}` : "";
  const showAheadSection = Boolean(logUpstream && logAhead > 0);
  const showBehindSection = Boolean(logUpstream && logBehind > 0);
  const hasDiffTotals = totalAdditions > 0 || totalDeletions > 0;
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
      mode === "diff"
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
    <PanelFrame>
      <PanelHeader className="git-panel-header">
        <PanelTabs active={filePanelMode} onSelect={onFilePanelModeChange} />
        <div className="git-panel-actions" role="group" aria-label="Git 面板">
          <div className="git-panel-select">
            <span className="git-panel-select-icon" aria-hidden>
              <ModeIcon />
            </span>
            <select
              className="git-panel-select-input"
              value={mode}
              onChange={(event) => onModeChange(event.target.value as GitDiffPanelProps["mode"])}
              aria-label="Git 面板视图"
            >
              <option value="diff">差异</option>
              <option value="log">日志</option>
              <option value="issues">Issue</option>
              <option value="prs">PR</option>
            </select>
          </div>
          {showApplyWorktree && (
            <button
              type="button"
              className="diff-row-action diff-row-action--apply"
              onClick={() => {
                void onApplyWorktreeChanges?.();
              }}
              disabled={worktreeApplyLoading || worktreeApplySuccess}
              data-tooltip={worktreeApplyTitle ?? "将更改应用到父工作区"}
              aria-label="应用工作树更改"
            >
              <WorktreeApplyIcon success={worktreeApplySuccess} />
            </button>
          )}
        </div>
      </PanelHeader>

      <GitPanelModeStatus
        mode={mode}
        diffStatusLabel={diffStatusLabel}
        logCountLabel={logCountLabel}
        logSyncLabel={logSyncLabel}
        logUpstreamLabel={logUpstreamLabel}
        issuesLoading={issuesLoading}
        issuesTotal={issuesTotal}
        pullRequestsLoading={pullRequestsLoading}
        pullRequestsTotal={pullRequestsTotal}
      />

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

      {mode === "diff" ? (
        <GitDiffModeContent
          error={error}
          showGitRootPanel={showGitRootPanel}
          onScanGitRoots={onScanGitRoots}
          gitRootScanLoading={gitRootScanLoading}
          gitRootScanDepth={gitRootScanDepth}
          onGitRootScanDepthChange={onGitRootScanDepthChange}
          onPickGitRoot={onPickGitRoot}
          hasGitRoot={hasGitRoot}
          onClearGitRoot={onClearGitRoot}
          gitRootScanError={gitRootScanError}
          gitRootScanHasScanned={gitRootScanHasScanned}
          gitRootCandidates={gitRootCandidates}
          gitRoot={gitRoot}
          onSelectGitRoot={onSelectGitRoot}
          showGenerateCommitMessage={showGenerateCommitMessage}
          commitMessage={commitMessage}
          onCommitMessageChange={onCommitMessageChange}
          commitMessageLoading={commitMessageLoading}
          canGenerateCommitMessage={canGenerateCommitMessage}
          onGenerateCommitMessage={onGenerateCommitMessage}
          stagedFiles={stagedFiles}
          unstagedFiles={unstagedFiles}
          diffScope={diffScope}
          onDiffScopeChange={setDiffScope}
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
          selectedFiles={selectedFiles}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          onFileClick={handleFileClick}
          onShowFileMenu={showFileMenu}
          onDiffListClick={handleDiffListClick}
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
    </PanelFrame>
  );
}
