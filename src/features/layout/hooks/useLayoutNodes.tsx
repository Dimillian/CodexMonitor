import type { DragEvent, MouseEvent, ReactNode, RefObject } from "react";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import { Sidebar } from "../../app/components/Sidebar";
import { Home } from "../../home/components/Home";
import { MainHeader } from "../../app/components/MainHeader";
import { Messages } from "../../messages/components/Messages";
import { ApprovalToasts } from "../../app/components/ApprovalToasts";
import { UpdateToast } from "../../update/components/UpdateToast";
import { ErrorToasts } from "../../notifications/components/ErrorToasts";
import { Composer } from "../../composer/components/Composer";
import { GitDiffPanel } from "../../git/components/GitDiffPanel";
import { GitDiffViewer } from "../../git/components/GitDiffViewer";
import { FileTreePanel } from "../../files/components/FileTreePanel";
import { PromptPanel } from "../../prompts/components/PromptPanel";
import { DebugPanel } from "../../debug/components/DebugPanel";
import { PlanPanel } from "../../plan/components/PlanPanel";
import { TabBar } from "../../app/components/TabBar";
import { TabletNav } from "../../app/components/TabletNav";
import { TerminalDock } from "../../terminal/components/TerminalDock";
import { TerminalPanel } from "../../terminal/components/TerminalPanel";
import type {
  AccessMode,
  ApprovalRequest,
  BranchInfo,
  CollaborationModeOption,
  ConversationItem,
  ComposerEditorSettings,
  CustomPromptOption,
  DebugEntry,
  DictationSessionState,
  DictationTranscript,
  GitFileStatus,
  GitHubIssue,
  GitHubPullRequestComment,
  GitHubPullRequest,
  GitLogEntry,
  LocalUsageSnapshot,
  ModelOption,
  OpenAppTarget,
  QueuedMessage,
  RateLimitSnapshot,
  RequestUserInputRequest,
  RequestUserInputResponse,
  SkillOption,
  ThreadSummary,
  ThreadTokenUsage,
  TurnPlan,
  WorkspaceInfo,
} from "../../../types";
import type { UpdateState } from "../../update/hooks/useUpdater";
import type { TerminalSessionState } from "../../terminal/hooks/useTerminalSession";
import type { TerminalTab } from "../../terminal/hooks/useTerminalTabs";
import type { ErrorToast } from "../../../services/toasts";

type ThreadActivityStatus = {
  isProcessing: boolean;
  hasUnread: boolean;
  isReviewing: boolean;
  processingStartedAt?: number | null;
  lastDurationMs?: number | null;
};

type GitDiffViewerItem = {
  path: string;
  status: string;
  diff: string;
  isImage?: boolean;
  oldImageData?: string | null;
  newImageData?: string | null;
  oldImageMime?: string | null;
  newImageMime?: string | null;
};

type WorktreeRenameState = {
  name: string;
  error: string | null;
  notice: string | null;
  isSubmitting: boolean;
  isDirty: boolean;
  upstream?: {
    oldBranch: string;
    newBranch: string;
    error: string | null;
    isSubmitting: boolean;
    onConfirm: () => void;
  } | null;
  onFocus: () => void;
  onChange: (value: string) => void;
  onCancel: () => void;
  onCommit: () => void;
};

type LayoutNodesOptions = {
  workspaces: WorkspaceInfo[];
  groupedWorkspaces: Array<{
    id: string | null;
    name: string;
    workspaces: WorkspaceInfo[];
  }>;
  hasWorkspaceGroups: boolean;
  deletingWorktreeIds: Set<string>;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadParentById: Record<string, string>;
  threadStatusById: Record<string, ThreadActivityStatus>;
  threadListLoadingByWorkspace: Record<string, boolean>;
  threadListPagingByWorkspace: Record<string, boolean>;
  threadListCursorByWorkspace: Record<string, string | null>;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  activeItems: ConversationItem[];
  activeRateLimits: RateLimitSnapshot | null;
  codeBlockCopyUseModifier: boolean;
  openAppTargets: OpenAppTarget[];
  openAppIconById: Record<string, string>;
  selectedOpenAppId: string;
  onSelectOpenAppId: (id: string) => void;
  approvals: ApprovalRequest[];
  userInputRequests: RequestUserInputRequest[];
  handleApprovalDecision: (
    request: ApprovalRequest,
    decision: "accept" | "decline",
  ) => void;
  handleApprovalRemember: (
    request: ApprovalRequest,
    command: string[],
  ) => void;
  handleUserInputSubmit: (
    request: RequestUserInputRequest,
    response: RequestUserInputResponse,
  ) => void;
  onOpenSettings: () => void;
  onOpenDictationSettings?: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  onAddWorkspace: () => void;
  onSelectHome: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  onAddAgent: (workspace: WorkspaceInfo) => Promise<void>;
  onAddWorktreeAgent: (workspace: WorkspaceInfo) => Promise<void>;
  onAddCloneAgent: (workspace: WorkspaceInfo) => Promise<void>;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onSyncThread: (workspaceId: string, threadId: string) => void;
  pinThread: (workspaceId: string, threadId: string) => boolean;
  unpinThread: (workspaceId: string, threadId: string) => void;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  getPinTimestamp: (workspaceId: string, threadId: string) => number | null;
  onRenameThread: (workspaceId: string, threadId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onDeleteWorktree: (workspaceId: string) => void;
  onLoadOlderThreads: (workspaceId: string) => void;
  onReloadWorkspaceThreads: (workspaceId: string) => void;
  workspaceDropTargetRef: RefObject<HTMLElement | null>;
  isWorkspaceDropActive: boolean;
  workspaceDropText: string;
  onWorkspaceDragOver: (event: DragEvent<HTMLElement>) => void;
  onWorkspaceDragEnter: (event: DragEvent<HTMLElement>) => void;
  onWorkspaceDragLeave: (event: DragEvent<HTMLElement>) => void;
  onWorkspaceDrop: (event: DragEvent<HTMLElement>) => void;
  updaterState: UpdateState;
  onUpdate: () => void;
  onDismissUpdate: () => void;
  errorToasts: ErrorToast[];
  onDismissErrorToast: (id: string) => void;
  latestAgentRuns: Array<{
    threadId: string;
    message: string;
    timestamp: number;
    projectName: string;
    groupName?: string | null;
    workspaceId: string;
    isProcessing: boolean;
  }>;
  isLoadingLatestAgents: boolean;
  localUsageSnapshot: LocalUsageSnapshot | null;
  isLoadingLocalUsage: boolean;
  localUsageError: string | null;
  onRefreshLocalUsage: () => void;
  usageMetric: "tokens" | "time";
  onUsageMetricChange: (metric: "tokens" | "time") => void;
  usageWorkspaceId: string | null;
  usageWorkspaceOptions: Array<{ id: string; label: string }>;
  onUsageWorkspaceChange: (workspaceId: string | null) => void;
  onSelectHomeThread: (workspaceId: string, threadId: string) => void;
  activeWorkspace: WorkspaceInfo | null;
  activeParentWorkspace: WorkspaceInfo | null;
  worktreeLabel: string | null;
  worktreeRename?: WorktreeRenameState;
  isWorktreeWorkspace: boolean;
  branchName: string;
  branches: BranchInfo[];
  onCheckoutBranch: (name: string) => Promise<void>;
  onCreateBranch: (name: string) => Promise<void>;
  onCopyThread: () => void | Promise<void>;
  onToggleTerminal: () => void;
  showTerminalButton: boolean;
  launchScript: string | null;
  launchScriptEditorOpen: boolean;
  launchScriptDraft: string;
  launchScriptSaving: boolean;
  launchScriptError: string | null;
  onRunLaunchScript: () => void;
  onOpenLaunchScriptEditor: () => void;
  onCloseLaunchScriptEditor: () => void;
  onLaunchScriptDraftChange: (value: string) => void;
  onSaveLaunchScript: () => void;
  mainHeaderActionsNode?: ReactNode;
  centerMode: "chat" | "diff";
  onExitDiff: () => void;
  activeTab: "projects" | "codex" | "git" | "log";
  onSelectTab: (tab: "projects" | "codex" | "git" | "log") => void;
  tabletNavTab: "codex" | "git" | "log";
  gitPanelMode: "diff" | "log" | "issues" | "prs";
  onGitPanelModeChange: (mode: "diff" | "log" | "issues" | "prs") => void;
  gitDiffViewStyle: "split" | "unified";
  worktreeApplyLabel: string;
  worktreeApplyTitle: string | null;
  worktreeApplyLoading: boolean;
  worktreeApplyError: string | null;
  worktreeApplySuccess: boolean;
  onApplyWorktreeChanges?: () => void | Promise<void>;
  filePanelMode: "git" | "files" | "prompts";
  onFilePanelModeChange: (mode: "git" | "files" | "prompts") => void;
  fileTreeLoading: boolean;
  gitStatus: {
    branchName: string;
    files: GitFileStatus[];
    stagedFiles: GitFileStatus[];
    unstagedFiles: GitFileStatus[];
    totalAdditions: number;
    totalDeletions: number;
    error: string | null;
  };
  fileStatus: string;
  selectedDiffPath: string | null;
  diffScrollRequestId: number;
  onSelectDiff: (path: string) => void;
  gitLogEntries: GitLogEntry[];
  gitLogTotal: number;
  gitLogAhead: number;
  gitLogBehind: number;
  gitLogAheadEntries: GitLogEntry[];
  gitLogBehindEntries: GitLogEntry[];
  gitLogUpstream: string | null;
  selectedCommitSha: string | null;
  onSelectCommit: (entry: GitLogEntry) => void;
  gitLogError: string | null;
  gitLogLoading: boolean;
  gitIssues: GitHubIssue[];
  gitIssuesTotal: number;
  gitIssuesLoading: boolean;
  gitIssuesError: string | null;
  gitPullRequests: GitHubPullRequest[];
  gitPullRequestsTotal: number;
  gitPullRequestsLoading: boolean;
  gitPullRequestsError: string | null;
  selectedPullRequestNumber: number | null;
  selectedPullRequest: GitHubPullRequest | null;
  selectedPullRequestComments: GitHubPullRequestComment[];
  selectedPullRequestCommentsLoading: boolean;
  selectedPullRequestCommentsError: string | null;
  onSelectPullRequest: (pullRequest: GitHubPullRequest) => void;
  gitRemoteUrl: string | null;
  gitRoot: string | null;
  gitRootCandidates: string[];
  gitRootScanDepth: number;
  gitRootScanLoading: boolean;
  gitRootScanError: string | null;
  gitRootScanHasScanned: boolean;
  onGitRootScanDepthChange: (depth: number) => void;
  onScanGitRoots: () => void;
  onSelectGitRoot: (path: string) => void;
  onClearGitRoot: () => void;
  onPickGitRoot: () => void | Promise<void>;
  onStageGitAll: () => Promise<void>;
  onStageGitFile: (path: string) => Promise<void>;
  onUnstageGitFile: (path: string) => Promise<void>;
  onRevertGitFile: (path: string) => Promise<void>;
  onRevertAllGitChanges: () => Promise<void>;
  gitDiffs: GitDiffViewerItem[];
  gitDiffLoading: boolean;
  gitDiffError: string | null;
  onDiffActivePathChange?: (path: string) => void;
  commitMessage: string;
  commitMessageLoading: boolean;
  commitMessageError: string | null;
  onCommitMessageChange: (value: string) => void;
  onGenerateCommitMessage: () => void | Promise<void>;
  onCommit?: () => void | Promise<void>;
  onCommitAndPush?: () => void | Promise<void>;
  onCommitAndSync?: () => void | Promise<void>;
  onPush?: () => void | Promise<void>;
  onSync?: () => void | Promise<void>;
  commitLoading?: boolean;
  pushLoading?: boolean;
  syncLoading?: boolean;
  commitError?: string | null;
  pushError?: string | null;
  syncError?: string | null;
  commitsAhead?: number;
  onSendPrompt: (text: string) => void | Promise<void>;
  onSendPromptToNewAgent: (text: string) => void | Promise<void>;
  onCreatePrompt: (data: {
    scope: "workspace" | "global";
    name: string;
    description?: string | null;
    argumentHint?: string | null;
    content: string;
  }) => void | Promise<void>;
  onUpdatePrompt: (data: {
    path: string;
    name: string;
    description?: string | null;
    argumentHint?: string | null;
    content: string;
  }) => void | Promise<void>;
  onDeletePrompt: (path: string) => void | Promise<void>;
  onMovePrompt: (data: { path: string; scope: "workspace" | "global" }) => void | Promise<void>;
  onRevealWorkspacePrompts: () => void | Promise<void>;
  onRevealGeneralPrompts: () => void | Promise<void>;
  canRevealGeneralPrompts: boolean;
  onSend: (text: string, images: string[]) => void | Promise<void>;
  onQueue: (text: string, images: string[]) => void | Promise<void>;
  onStop: () => void;
  canStop: boolean;
  isReviewing: boolean;
  isProcessing: boolean;
  steerEnabled: boolean;
  activeTokenUsage: ThreadTokenUsage | null;
  activeQueue: QueuedMessage[];
  draftText: string;
  onDraftChange: (next: string) => void;
  activeImages: string[];
  onPickImages: () => void | Promise<void>;
  onAttachImages: (paths: string[]) => void;
  onRemoveImage: (path: string) => void;
  prefillDraft: QueuedMessage | null;
  onPrefillHandled: (id: string) => void;
  insertText: QueuedMessage | null;
  onInsertHandled: (id: string) => void;
  onEditQueued: (item: QueuedMessage) => void;
  onDeleteQueued: (id: string) => void;
  collaborationModes: CollaborationModeOption[];
  selectedCollaborationModeId: string | null;
  onSelectCollaborationMode: (id: string | null) => void;
  models: ModelOption[];
  selectedModelId: string | null;
  onSelectModel: (id: string | null) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string | null) => void;
  reasoningSupported: boolean;
  accessMode: AccessMode;
  onSelectAccessMode: (mode: AccessMode) => void;
  skills: SkillOption[];
  prompts: CustomPromptOption[];
  files: string[];
  onInsertComposerText: (text: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  composerEditorSettings: ComposerEditorSettings;
  composerEditorExpanded: boolean;
  onToggleComposerEditorExpanded: () => void;
  dictationEnabled: boolean;
  dictationState: DictationSessionState;
  dictationLevel: number;
  onToggleDictation: () => void;
  dictationTranscript: DictationTranscript | null;
  onDictationTranscriptHandled: (id: string) => void;
  dictationError: string | null;
  onDismissDictationError: () => void;
  dictationHint: string | null;
  onDismissDictationHint: () => void;
  showComposer: boolean;
  composerSendLabel?: string;
  plan: TurnPlan | null;
  debugEntries: DebugEntry[];
  debugOpen: boolean;
  terminalOpen: boolean;
  terminalTabs: TerminalTab[];
  activeTerminalId: string | null;
  onSelectTerminal: (terminalId: string) => void;
  onNewTerminal: () => void;
  onCloseTerminal: (terminalId: string) => void;
  terminalState: TerminalSessionState | null;
  onClearDebug: () => void;
  onCopyDebug: () => void;
  onResizeDebug: (event: MouseEvent<Element>) => void;
  onResizeTerminal: (event: MouseEvent<Element>) => void;
  onBackFromDiff: () => void;
  onGoProjects: () => void;
};

type LayoutNodesResult = {
  sidebarNode: ReactNode;
  messagesNode: ReactNode;
  composerNode: ReactNode;
  approvalToastsNode: ReactNode;
  updateToastNode: ReactNode;
  errorToastsNode: ReactNode;
  homeNode: ReactNode;
  mainHeaderNode: ReactNode;
  desktopTopbarLeftNode: ReactNode;
  tabletNavNode: ReactNode;
  tabBarNode: ReactNode;
  gitDiffPanelNode: ReactNode;
  gitDiffViewerNode: ReactNode;
  planPanelNode: ReactNode;
  debugPanelNode: ReactNode;
  debugPanelFullNode: ReactNode;
  terminalDockNode: ReactNode;
  compactEmptyCodexNode: ReactNode;
  compactEmptyGitNode: ReactNode;
  compactGitBackNode: ReactNode;
};

export function useLayoutNodes(options: LayoutNodesOptions): LayoutNodesResult {
  const activeThreadStatus = options.activeThreadId
    ? options.threadStatusById[options.activeThreadId] ?? null
    : null;

  const sidebarNode = (
    <Sidebar
      workspaces={options.workspaces}
      groupedWorkspaces={options.groupedWorkspaces}
      hasWorkspaceGroups={options.hasWorkspaceGroups}
      deletingWorktreeIds={options.deletingWorktreeIds}
      threadsByWorkspace={options.threadsByWorkspace}
      threadParentById={options.threadParentById}
      threadStatusById={options.threadStatusById}
      threadListLoadingByWorkspace={options.threadListLoadingByWorkspace}
      threadListPagingByWorkspace={options.threadListPagingByWorkspace}
      threadListCursorByWorkspace={options.threadListCursorByWorkspace}
      activeWorkspaceId={options.activeWorkspaceId}
      activeThreadId={options.activeThreadId}
      accountRateLimits={options.activeRateLimits}
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
      userInputRequests={options.userInputRequests}
      onUserInputSubmit={options.handleUserInputSubmit}
      isThinking={
        options.activeThreadId
          ? options.threadStatusById[options.activeThreadId]?.isProcessing ?? false
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

  const sidebarSelectedDiffPath =
    options.centerMode === "diff" ? options.selectedDiffPath : null;

  let gitDiffPanelNode: ReactNode;
  if (options.filePanelMode === "files" && options.activeWorkspace) {
    gitDiffPanelNode = (
      <FileTreePanel
        workspaceId={options.activeWorkspace.id}
        workspacePath={options.activeWorkspace.path}
        files={options.files}
        isLoading={options.fileTreeLoading}
        filePanelMode={options.filePanelMode}
        onFilePanelModeChange={options.onFilePanelModeChange}
        onInsertText={options.onInsertComposerText}
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
        onPush={options.onPush}
        onSync={options.onSync}
        commitLoading={options.commitLoading}
        pushLoading={options.pushLoading}
        syncLoading={options.syncLoading}
        commitError={options.commitError}
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
      diffStyle={options.gitDiffViewStyle}
      pullRequest={options.selectedPullRequest}
      pullRequestComments={options.selectedPullRequestComments}
      pullRequestCommentsLoading={options.selectedPullRequestCommentsLoading}
      pullRequestCommentsError={options.selectedPullRequestCommentsError}
      onActivePathChange={options.onDiffActivePathChange}
    />
  );

  const planPanelNode = <PlanPanel plan={options.plan} isProcessing={options.isProcessing} />;

  const terminalPanelNode = options.terminalState ? (
    <TerminalPanel
      containerRef={options.terminalState.containerRef}
      status={options.terminalState.status}
      message={options.terminalState.message}
    />
  ) : null;

  const terminalDockNode = (
    <TerminalDock
      isOpen={options.terminalOpen}
      terminals={options.terminalTabs}
      activeTerminalId={options.activeTerminalId}
      onSelectTerminal={options.onSelectTerminal}
      onNewTerminal={options.onNewTerminal}
      onCloseTerminal={options.onCloseTerminal}
      onResizeStart={options.onResizeTerminal}
      terminalNode={terminalPanelNode}
    />
  );

  const debugPanelNode = (
    <DebugPanel
      entries={options.debugEntries}
      isOpen={options.debugOpen}
      onClear={options.onClearDebug}
      onCopy={options.onCopyDebug}
      onResizeStart={options.onResizeDebug}
    />
  );

  const debugPanelFullNode = (
    <DebugPanel
      entries={options.debugEntries}
      isOpen
      onClear={options.onClearDebug}
      onCopy={options.onCopyDebug}
      variant="full"
    />
  );

  const compactEmptyCodexNode = (
    <div className="compact-empty">
      <h3>No workspace selected</h3>
      <p>Choose a project to start chatting.</p>
      <button className="ghost" onClick={options.onGoProjects}>
        Go to Projects
      </button>
    </div>
  );

  const compactEmptyGitNode = (
    <div className="compact-empty">
      <h3>No workspace selected</h3>
      <p>Select a project to inspect diffs.</p>
      <button className="ghost" onClick={options.onGoProjects}>
        Go to Projects
      </button>
    </div>
  );

  const compactGitBackNode = (
    <div className="compact-git-back">
      <button onClick={options.onBackFromDiff}>‹ Back</button>
      <span className="workspace-title">Diff</span>
    </div>
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
    gitDiffPanelNode,
    gitDiffViewerNode,
    planPanelNode,
    debugPanelNode,
    debugPanelFullNode,
    terminalDockNode,
    compactEmptyCodexNode,
    compactEmptyGitNode,
    compactGitBackNode,
  };
}
