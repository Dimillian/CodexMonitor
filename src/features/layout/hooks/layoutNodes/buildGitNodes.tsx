import { FileTreePanel } from "../../../files/components/FileTreePanel";
import { GitDiffPanel } from "../../../git/components/GitDiffPanel";
import { GitDiffViewer } from "../../../git/components/GitDiffViewer";
import { PromptPanel } from "../../../prompts/components/PromptPanel";
import type { LayoutNodesOptions, LayoutNodesResult } from "./types";

type GitLayoutNodes = Pick<LayoutNodesResult, "gitDiffPanelNode" | "gitDiffViewerNode">;

export function buildGitNodes(options: LayoutNodesOptions): GitLayoutNodes {
  const sidebarSelectedDiffPath =
    options.centerMode === "diff" ? options.selectedDiffPath : null;

  let gitDiffPanelNode;
  if (options.filePanelMode === "files" && options.activeWorkspace) {
    gitDiffPanelNode = (
      <FileTreePanel
        workspaceId={options.activeWorkspace.id}
        workspacePath={options.activeWorkspace.path}
        files={options.files}
        modifiedFiles={[
          ...new Set([
            ...options.gitStatus.stagedFiles.map((file) => file.path),
            ...options.gitStatus.unstagedFiles.map((file) => file.path),
          ]),
        ]}
        isLoading={options.fileTreeLoading}
        filePanelMode={options.filePanelMode}
        onFilePanelModeChange={options.onFilePanelModeChange}
        onInsertText={options.onInsertComposerText}
        canInsertText={options.canInsertComposerText}
        openTargets={options.openAppTargets}
        openAppIconById={options.openAppIconById}
        selectedOpenAppId={options.selectedOpenAppId}
        onSelectOpenAppId={options.onSelectOpenAppId}
      />
    );
  } else if (options.filePanelMode === "prompts") {
    gitDiffPanelNode = (
      <PromptPanel
        prompts={options.prompts}
        workspacePath={options.activeWorkspace?.path ?? null}
        filePanelMode={options.filePanelMode}
        onFilePanelModeChange={options.onFilePanelModeChange}
        onSendPrompt={options.onSendPrompt}
        onSendPromptToNewAgent={options.onSendPromptToNewAgent}
        onCreatePrompt={options.onCreatePrompt}
        onUpdatePrompt={options.onUpdatePrompt}
        onDeletePrompt={options.onDeletePrompt}
        onMovePrompt={options.onMovePrompt}
        onRevealWorkspacePrompts={options.onRevealWorkspacePrompts}
        onRevealGeneralPrompts={options.onRevealGeneralPrompts}
        canRevealGeneralPrompts={options.canRevealGeneralPrompts}
      />
    );
  } else {
    gitDiffPanelNode = (
      <GitDiffPanel
        workspaceId={options.activeWorkspace?.id ?? null}
        workspacePath={options.activeWorkspace?.path ?? null}
        mode={options.gitPanelMode}
        onModeChange={options.onGitPanelModeChange}
        filePanelMode={options.filePanelMode}
        onFilePanelModeChange={options.onFilePanelModeChange}
        worktreeApplyLabel={options.worktreeApplyLabel}
        worktreeApplyTitle={options.worktreeApplyTitle}
        worktreeApplyLoading={options.worktreeApplyLoading}
        worktreeApplyError={options.worktreeApplyError}
        worktreeApplySuccess={options.worktreeApplySuccess}
        onApplyWorktreeChanges={options.onApplyWorktreeChanges}
        branchName={options.gitStatus.branchName || "unknown"}
        totalAdditions={options.gitStatus.totalAdditions}
        totalDeletions={options.gitStatus.totalDeletions}
        fileStatus={options.fileStatus}
        error={options.gitStatus.error}
        logError={options.gitLogError}
        logLoading={options.gitLogLoading}
        stagedFiles={options.gitStatus.stagedFiles}
        unstagedFiles={options.gitStatus.unstagedFiles}
        onSelectFile={options.onSelectDiff}
        selectedPath={sidebarSelectedDiffPath}
        logEntries={options.gitLogEntries}
        logTotal={options.gitLogTotal}
        logAhead={options.gitLogAhead}
        logBehind={options.gitLogBehind}
        logAheadEntries={options.gitLogAheadEntries}
        logBehindEntries={options.gitLogBehindEntries}
        logUpstream={options.gitLogUpstream}
        selectedCommitSha={options.selectedCommitSha}
        onSelectCommit={options.onSelectCommit}
        issues={options.gitIssues}
        issuesTotal={options.gitIssuesTotal}
        issuesLoading={options.gitIssuesLoading}
        issuesError={options.gitIssuesError}
        pullRequests={options.gitPullRequests}
        pullRequestsTotal={options.gitPullRequestsTotal}
        pullRequestsLoading={options.gitPullRequestsLoading}
        pullRequestsError={options.gitPullRequestsError}
        selectedPullRequest={options.selectedPullRequestNumber}
        onSelectPullRequest={options.onSelectPullRequest}
        gitRemoteUrl={options.gitRemoteUrl}
        gitRoot={options.gitRoot}
        gitRootCandidates={options.gitRootCandidates}
        gitRootScanDepth={options.gitRootScanDepth}
        gitRootScanLoading={options.gitRootScanLoading}
        gitRootScanError={options.gitRootScanError}
        gitRootScanHasScanned={options.gitRootScanHasScanned}
        onGitRootScanDepthChange={options.onGitRootScanDepthChange}
        onScanGitRoots={options.onScanGitRoots}
        onSelectGitRoot={options.onSelectGitRoot}
        onClearGitRoot={options.onClearGitRoot}
        onPickGitRoot={options.onPickGitRoot}
        onStageAllChanges={options.onStageGitAll}
        onStageFile={options.onStageGitFile}
        onUnstageFile={options.onUnstageGitFile}
        onRevertFile={options.onRevertGitFile}
        onRevertAllChanges={options.onRevertAllGitChanges}
        commitMessage={options.commitMessage}
        commitMessageLoading={options.commitMessageLoading}
        commitMessageError={options.commitMessageError}
        onCommitMessageChange={options.onCommitMessageChange}
        onGenerateCommitMessage={options.onGenerateCommitMessage}
        onCommit={options.onCommit}
        onCommitAndPush={options.onCommitAndPush}
        onCommitAndSync={options.onCommitAndSync}
        onPull={options.onPull}
        onFetch={options.onFetch}
        onPush={options.onPush}
        onSync={options.onSync}
        commitLoading={options.commitLoading}
        pullLoading={options.pullLoading}
        fetchLoading={options.fetchLoading}
        pushLoading={options.pushLoading}
        syncLoading={options.syncLoading}
        commitError={options.commitError}
        pullError={options.pullError}
        fetchError={options.fetchError}
        pushError={options.pushError}
        syncError={options.syncError}
        commitsAhead={options.commitsAhead}
      />
    );
  }

  const gitDiffViewerNode = (
    <GitDiffViewer
      diffs={options.gitDiffs}
      selectedPath={options.selectedDiffPath}
      scrollRequestId={options.diffScrollRequestId}
      isLoading={options.gitDiffLoading}
      error={options.gitDiffError}
      diffStyle={options.isPhone ? "unified" : options.gitDiffViewStyle}
      ignoreWhitespaceChanges={options.gitDiffIgnoreWhitespaceChanges}
      pullRequest={options.selectedPullRequest}
      pullRequestComments={options.selectedPullRequestComments}
      pullRequestCommentsLoading={options.selectedPullRequestCommentsLoading}
      pullRequestCommentsError={options.selectedPullRequestCommentsError}
      pullRequestReviewActions={options.pullRequestReviewActions}
      onRunPullRequestReview={options.onRunPullRequestReview}
      pullRequestReviewLaunching={options.pullRequestReviewLaunching}
      pullRequestReviewThreadId={options.pullRequestReviewThreadId}
      onCheckoutPullRequest={options.onCheckoutPullRequest}
      canRevert={options.diffSource === "local"}
      onRevertFile={options.onRevertGitFile}
      onActivePathChange={options.onDiffActivePathChange}
    />
  );

  return {
    gitDiffPanelNode,
    gitDiffViewerNode,
  };
}
