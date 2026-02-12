import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import { Sidebar } from "../../../app/components/Sidebar";
import { Home } from "../../../home/components/Home";
import { MainHeader } from "../../../app/components/MainHeader";
import { Messages } from "../../../messages/components/Messages";
import { ApprovalToasts } from "../../../app/components/ApprovalToasts";
import { UpdateToast } from "../../../update/components/UpdateToast";
import { ErrorToasts } from "../../../notifications/components/ErrorToasts";
import { Composer } from "../../../composer/components/Composer";
import { TabBar } from "../../../app/components/TabBar";
import { TabletNav } from "../../../app/components/TabletNav";
import type { LayoutNodesOptions, LayoutNodesResult } from "./types";

type PrimaryLayoutNodes = Pick<
  LayoutNodesResult,
  | "sidebarNode"
  | "messagesNode"
  | "composerNode"
  | "approvalToastsNode"
  | "updateToastNode"
  | "errorToastsNode"
  | "homeNode"
  | "mainHeaderNode"
  | "desktopTopbarLeftNode"
  | "tabletNavNode"
  | "tabBarNode"
>;

export function buildPrimaryNodes(options: LayoutNodesOptions): PrimaryLayoutNodes {
  const activeThreadStatus = options.activeThreadId
    ? options.threadStatusById[options.activeThreadId] ?? null
    : null;

  const sidebarNode = (
    <Sidebar
      workspaces={options.workspaces}
      groupedWorkspaces={options.groupedWorkspaces}
      hasWorkspaceGroups={options.hasWorkspaceGroups}
      deletingWorktreeIds={options.deletingWorktreeIds}
      newAgentDraftWorkspaceId={options.newAgentDraftWorkspaceId}
      startingDraftThreadWorkspaceId={options.startingDraftThreadWorkspaceId}
      threadsByWorkspace={options.threadsByWorkspace}
      threadParentById={options.threadParentById}
      threadStatusById={options.threadStatusById}
      threadListLoadingByWorkspace={options.threadListLoadingByWorkspace}
      threadListPagingByWorkspace={options.threadListPagingByWorkspace}
      threadListCursorByWorkspace={options.threadListCursorByWorkspace}
      threadListSortKey={options.threadListSortKey}
      onSetThreadListSortKey={options.onSetThreadListSortKey}
      onRefreshAllThreads={options.onRefreshAllThreads}
      activeWorkspaceId={options.activeWorkspaceId}
      activeThreadId={options.activeThreadId}
      activeWorkspace={options.activeWorkspace}
      sendUserMessageToThread={options.sendUserMessageToThread}
      collaborationModes={options.collaborationModes}
      onSelectCollaborationMode={options.onSelectCollaborationMode}
      userInputRequests={options.userInputRequests}
      accountRateLimits={options.activeRateLimits}
      usageShowRemaining={options.usageShowRemaining}
      accountInfo={options.accountInfo}
      onSwitchAccount={options.onSwitchAccount}
      onCancelSwitchAccount={options.onCancelSwitchAccount}
      accountSwitching={options.accountSwitching}
      onOpenSettings={options.onOpenSettings}
      onOpenDebug={options.onOpenDebug}
      showDebugButton={options.showDebugButton}
      onAddWorkspace={options.onAddWorkspace}
      onSelectHome={options.onSelectHome}
      onSelectWorkspace={options.onSelectWorkspace}
      onConnectWorkspace={options.onConnectWorkspace}
      onAddAgent={options.onAddAgent}
      onAddWorktreeAgent={options.onAddWorktreeAgent}
      onAddCloneAgent={options.onAddCloneAgent}
      onToggleWorkspaceCollapse={options.onToggleWorkspaceCollapse}
      onSelectThread={options.onSelectThread}
      onDeleteThread={options.onDeleteThread}
      onSyncThread={options.onSyncThread}
      pinThread={options.pinThread}
      unpinThread={options.unpinThread}
      isThreadPinned={options.isThreadPinned}
      getPinTimestamp={options.getPinTimestamp}
      onRenameThread={options.onRenameThread}
      onDeleteWorkspace={options.onDeleteWorkspace}
      onDeleteWorktree={options.onDeleteWorktree}
      onLoadOlderThreads={options.onLoadOlderThreads}
      onReloadWorkspaceThreads={options.onReloadWorkspaceThreads}
      workspaceDropTargetRef={options.workspaceDropTargetRef}
      isWorkspaceDropActive={options.isWorkspaceDropActive}
      workspaceDropText={options.workspaceDropText}
      onWorkspaceDragOver={options.onWorkspaceDragOver}
      onWorkspaceDragEnter={options.onWorkspaceDragEnter}
      onWorkspaceDragLeave={options.onWorkspaceDragLeave}
      onWorkspaceDrop={options.onWorkspaceDrop}
    />
  );

  const messagesNode = (
    <Messages
      items={options.activeItems}
      threadId={options.activeThreadId ?? null}
      workspaceId={options.activeWorkspace?.id ?? null}
      workspacePath={options.activeWorkspace?.path ?? null}
      openTargets={options.openAppTargets}
      selectedOpenAppId={options.selectedOpenAppId}
      codeBlockCopyUseModifier={options.codeBlockCopyUseModifier}
      showMessageFilePath={options.showMessageFilePath}
      userInputRequests={options.userInputRequests}
      onUserInputSubmit={options.handleUserInputSubmit}
      onPlanAccept={options.onPlanAccept}
      onPlanSubmitChanges={options.onPlanSubmitChanges}
      onOpenThreadLink={options.onOpenThreadLink}
      isThinking={options.isProcessing}
      isLoadingMessages={
        options.activeThreadId
          ? options.threadResumeLoadingById[options.activeThreadId] ?? false
          : false
      }
      processingStartedAt={activeThreadStatus?.processingStartedAt ?? null}
      lastDurationMs={activeThreadStatus?.lastDurationMs ?? null}
    />
  );

  const composerNode = options.showComposer ? (
    <Composer
      onSend={options.onSend}
      onQueue={options.onQueue}
      onStop={options.onStop}
      canStop={options.canStop}
      disabled={options.isReviewing}
      onFileAutocompleteActiveChange={options.onFileAutocompleteActiveChange}
      contextUsage={options.activeTokenUsage}
      queuedMessages={options.activeQueue}
      sendLabel={
        options.composerSendLabel ??
        (options.isProcessing && !options.steerEnabled ? "Queue" : "Send")
      }
      steerEnabled={options.steerEnabled}
      isProcessing={options.isProcessing}
      draftText={options.draftText}
      onDraftChange={options.onDraftChange}
      attachedImages={options.activeImages}
      onPickImages={options.onPickImages}
      onAttachImages={options.onAttachImages}
      onRemoveImage={options.onRemoveImage}
      prefillDraft={options.prefillDraft}
      onPrefillHandled={options.onPrefillHandled}
      insertText={options.insertText}
      onInsertHandled={options.onInsertHandled}
      onEditQueued={options.onEditQueued}
      onDeleteQueued={options.onDeleteQueued}
      collaborationModes={options.collaborationModes}
      selectedCollaborationModeId={options.selectedCollaborationModeId}
      onSelectCollaborationMode={options.onSelectCollaborationMode}
      models={options.models}
      selectedModelId={options.selectedModelId}
      onSelectModel={options.onSelectModel}
      reasoningOptions={options.reasoningOptions}
      selectedEffort={options.selectedEffort}
      onSelectEffort={options.onSelectEffort}
      reasoningSupported={options.reasoningSupported}
      accessMode={options.accessMode}
      onSelectAccessMode={options.onSelectAccessMode}
      skills={options.skills}
      appsEnabled={options.appsEnabled}
      apps={options.apps}
      prompts={options.prompts}
      files={options.files}
      textareaRef={options.textareaRef}
      historyKey={options.activeWorkspace?.id ?? null}
      editorSettings={options.composerEditorSettings}
      editorExpanded={options.composerEditorExpanded}
      onToggleEditorExpanded={options.onToggleComposerEditorExpanded}
      dictationEnabled={options.dictationEnabled}
      dictationState={options.dictationState}
      dictationLevel={options.dictationLevel}
      onToggleDictation={options.onToggleDictation}
      onOpenDictationSettings={options.onOpenDictationSettings}
      dictationTranscript={options.dictationTranscript}
      onDictationTranscriptHandled={options.onDictationTranscriptHandled}
      dictationError={options.dictationError}
      onDismissDictationError={options.onDismissDictationError}
      dictationHint={options.dictationHint}
      onDismissDictationHint={options.onDismissDictationHint}
      contextActions={options.composerContextActions}
      reviewPrompt={options.reviewPrompt}
      onReviewPromptClose={options.onReviewPromptClose}
      onReviewPromptShowPreset={options.onReviewPromptShowPreset}
      onReviewPromptChoosePreset={options.onReviewPromptChoosePreset}
      highlightedPresetIndex={options.highlightedPresetIndex}
      onReviewPromptHighlightPreset={options.onReviewPromptHighlightPreset}
      highlightedBranchIndex={options.highlightedBranchIndex}
      onReviewPromptHighlightBranch={options.onReviewPromptHighlightBranch}
      highlightedCommitIndex={options.highlightedCommitIndex}
      onReviewPromptHighlightCommit={options.onReviewPromptHighlightCommit}
      onReviewPromptKeyDown={options.onReviewPromptKeyDown}
      onReviewPromptSelectBranch={options.onReviewPromptSelectBranch}
      onReviewPromptSelectBranchAtIndex={options.onReviewPromptSelectBranchAtIndex}
      onReviewPromptConfirmBranch={options.onReviewPromptConfirmBranch}
      onReviewPromptSelectCommit={options.onReviewPromptSelectCommit}
      onReviewPromptSelectCommitAtIndex={options.onReviewPromptSelectCommitAtIndex}
      onReviewPromptConfirmCommit={options.onReviewPromptConfirmCommit}
      onReviewPromptUpdateCustomInstructions={options.onReviewPromptUpdateCustomInstructions}
      onReviewPromptConfirmCustom={options.onReviewPromptConfirmCustom}
    />
  ) : null;

  const approvalToastsNode = (
    <ApprovalToasts
      approvals={options.approvals}
      workspaces={options.workspaces}
      onDecision={options.handleApprovalDecision}
      onRemember={options.handleApprovalRemember}
    />
  );

  const updateToastNode = (
    <UpdateToast
      state={options.updaterState}
      onUpdate={options.onUpdate}
      onDismiss={options.onDismissUpdate}
    />
  );

  const errorToastsNode = (
    <ErrorToasts toasts={options.errorToasts} onDismiss={options.onDismissErrorToast} />
  );

  const homeNode = (
    <Home
      onOpenProject={options.onAddWorkspace}
      onAddWorkspace={options.onAddWorkspace}
      latestAgentRuns={options.latestAgentRuns}
      isLoadingLatestAgents={options.isLoadingLatestAgents}
      localUsageSnapshot={options.localUsageSnapshot}
      isLoadingLocalUsage={options.isLoadingLocalUsage}
      localUsageError={options.localUsageError}
      onRefreshLocalUsage={options.onRefreshLocalUsage}
      usageMetric={options.usageMetric}
      onUsageMetricChange={options.onUsageMetricChange}
      usageWorkspaceId={options.usageWorkspaceId}
      usageWorkspaceOptions={options.usageWorkspaceOptions}
      onUsageWorkspaceChange={options.onUsageWorkspaceChange}
      onSelectThread={options.onSelectHomeThread}
    />
  );

  const mainHeaderNode = options.activeWorkspace ? (
    <MainHeader
      workspace={options.activeWorkspace}
      parentName={options.activeParentWorkspace?.name ?? null}
      worktreeLabel={options.worktreeLabel}
      worktreeRename={options.worktreeRename}
      disableBranchMenu={options.isWorktreeWorkspace}
      parentPath={options.activeParentWorkspace?.path ?? null}
      worktreePath={options.isWorktreeWorkspace ? options.activeWorkspace.path : null}
      openTargets={options.openAppTargets}
      openAppIconById={options.openAppIconById}
      selectedOpenAppId={options.selectedOpenAppId}
      onSelectOpenAppId={options.onSelectOpenAppId}
      branchName={options.branchName}
      branches={options.branches}
      onCheckoutBranch={options.onCheckoutBranch}
      onCreateBranch={options.onCreateBranch}
      canCopyThread={options.activeItems.length > 0}
      onCopyThread={options.onCopyThread}
      onToggleTerminal={options.onToggleTerminal}
      isTerminalOpen={options.terminalOpen}
      showTerminalButton={options.showTerminalButton}
      showWorkspaceTools={options.showWorkspaceTools}
      launchScript={options.launchScript}
      launchScriptEditorOpen={options.launchScriptEditorOpen}
      launchScriptDraft={options.launchScriptDraft}
      launchScriptSaving={options.launchScriptSaving}
      launchScriptError={options.launchScriptError}
      onRunLaunchScript={options.onRunLaunchScript}
      onOpenLaunchScriptEditor={options.onOpenLaunchScriptEditor}
      onCloseLaunchScriptEditor={options.onCloseLaunchScriptEditor}
      onLaunchScriptDraftChange={options.onLaunchScriptDraftChange}
      onSaveLaunchScript={options.onSaveLaunchScript}
      launchScriptsState={options.launchScriptsState}
      extraActionsNode={options.mainHeaderActionsNode}
    />
  ) : null;

  const desktopTopbarLeftNode = (
    <>
      {options.centerMode === "diff" && (
        <button
          className="icon-button back-button"
          onClick={options.onExitDiff}
          aria-label="Back to chat"
        >
          <ArrowLeft aria-hidden />
        </button>
      )}
      {mainHeaderNode}
    </>
  );

  const tabletNavNode = (
    <TabletNav activeTab={options.tabletNavTab} onSelect={options.onSelectTab} />
  );

  const tabBarNode = (
    <TabBar activeTab={options.activeTab} onSelect={options.onSelectTab} />
  );

  return {
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
  };
}
