import type { DragEvent, MouseEvent, ReactNode, RefObject } from "react";
import type { ReviewPromptState, ReviewPromptStep } from "../../../threads/hooks/useReviewPrompt";
import type { WorkspaceLaunchScriptsState } from "../../../app/hooks/useWorkspaceLaunchScripts";
import type {
  AccessMode,
  ApprovalRequest,
  BranchInfo,
  CollaborationModeOption,
  ConversationItem,
  ComposerEditorSettings,
  CustomPromptOption,
  AccountSnapshot,
  AppMention,
  AppOption,
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
  PullRequestReviewAction,
  PullRequestReviewIntent,
  PullRequestSelectionRange,
  RateLimitSnapshot,
  RequestUserInputRequest,
  RequestUserInputResponse,
  SkillOption,
  ThreadListSortKey,
  ThreadSummary,
  ThreadTokenUsage,
  TurnPlan,
  WorkspaceInfo,
} from "../../../../types";
import type { UpdateState } from "../../../update/hooks/useUpdater";
import type { TerminalSessionState } from "../../../terminal/hooks/useTerminalSession";
import type { TerminalTab } from "../../../terminal/hooks/useTerminalTabs";
import type { ErrorToast } from "../../../../services/toasts";

export type ThreadActivityStatus = {
  isProcessing: boolean;
  hasUnread: boolean;
  isReviewing: boolean;
  processingStartedAt?: number | null;
  lastDurationMs?: number | null;
};

export type GitDiffViewerItem = {
  path: string;
  status: string;
  diff: string;
  isImage?: boolean;
  oldImageData?: string | null;
  newImageData?: string | null;
  oldImageMime?: string | null;
  newImageMime?: string | null;
};

export type WorktreeRenameState = {
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

export type ComposerContextAction = {
  id: string;
  label: string;
  title?: string;
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
};

export type LayoutNodesOptions = {
  workspaces: WorkspaceInfo[];
  groupedWorkspaces: Array<{
    id: string | null;
    name: string;
    workspaces: WorkspaceInfo[];
  }>;
  hasWorkspaceGroups: boolean;
  deletingWorktreeIds: Set<string>;
  newAgentDraftWorkspaceId?: string | null;
  startingDraftThreadWorkspaceId?: string | null;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadParentById: Record<string, string>;
  threadStatusById: Record<string, ThreadActivityStatus>;
  threadResumeLoadingById: Record<string, boolean>;
  threadListLoadingByWorkspace: Record<string, boolean>;
  threadListPagingByWorkspace: Record<string, boolean>;
  threadListCursorByWorkspace: Record<string, string | null>;
  threadListSortKey: ThreadListSortKey;
  onSetThreadListSortKey: (sortKey: ThreadListSortKey) => void;
  onRefreshAllThreads: () => void;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  activeItems: ConversationItem[];
  activeRateLimits: RateLimitSnapshot | null;
  usageShowRemaining: boolean;
  accountInfo: AccountSnapshot | null;
  onSwitchAccount: () => void;
  onCancelSwitchAccount: () => void;
  accountSwitching: boolean;
  codeBlockCopyUseModifier: boolean;
  showMessageFilePath: boolean;
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
  onPlanAccept?: () => void;
  onPlanExport?: () => void;
  onPlanSubmitChanges?: (changes: string) => void;
  sendUserMessageToThread: (
    workspace: WorkspaceInfo,
    threadId: string,
    message: string,
    imageIds: string[],
    options?: {
      collaborationMode?: Record<string, unknown> | null;
    },
  ) => Promise<void>;
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
  onOpenThreadLink: (threadId: string) => void;
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
  onCheckoutPullRequest: (
    pullRequest: GitHubPullRequest,
  ) => Promise<void> | void;
  onCreateBranch: (name: string) => Promise<void>;
  onCopyThread: () => void | Promise<void>;
  onToggleTerminal: () => void;
  showTerminalButton: boolean;
  showWorkspaceTools: boolean;
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
  launchScriptsState?: WorkspaceLaunchScriptsState;
  mainHeaderActionsNode?: ReactNode;
  centerMode: "chat" | "diff";
  onExitDiff: () => void;
  activeTab: "home" | "projects" | "codex" | "git" | "log";
  onSelectTab: (tab: "home" | "projects" | "codex" | "git" | "log") => void;
  tabletNavTab: "codex" | "git" | "log";
  gitPanelMode: "diff" | "log" | "issues" | "prs";
  onGitPanelModeChange: (mode: "diff" | "log" | "issues" | "prs") => void;
  isPhone: boolean;
  gitDiffViewStyle: "split" | "unified";
  gitDiffIgnoreWhitespaceChanges: boolean;
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
  pullRequestReviewActions: PullRequestReviewAction[];
  onRunPullRequestReview: (options: {
    intent: PullRequestReviewIntent;
    question?: string;
    selection?: PullRequestSelectionRange | null;
    images?: string[];
  }) => Promise<string | null>;
  pullRequestReviewLaunching: boolean;
  pullRequestReviewThreadId: string | null;
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
  diffSource: "local" | "pr" | "commit";
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
  onSend: (
    text: string,
    images: string[],
    appMentions?: AppMention[],
  ) => void | Promise<void>;
  onQueue: (
    text: string,
    images: string[],
    appMentions?: AppMention[],
  ) => void | Promise<void>;
  onStop: () => void;
  canStop: boolean;
  onFileAutocompleteActiveChange?: (active: boolean) => void;
  isReviewing: boolean;
  isProcessing: boolean;
  steerEnabled: boolean;
  reviewPrompt: ReviewPromptState;
  onReviewPromptClose: () => void;
  onReviewPromptShowPreset: () => void;
  onReviewPromptChoosePreset: (
    preset: Exclude<ReviewPromptStep, "preset"> | "uncommitted",
  ) => void;
  highlightedPresetIndex: number;
  onReviewPromptHighlightPreset: (index: number) => void;
  highlightedBranchIndex: number;
  onReviewPromptHighlightBranch: (index: number) => void;
  highlightedCommitIndex: number;
  onReviewPromptHighlightCommit: (index: number) => void;
  onReviewPromptKeyDown: (event: {
    key: string;
    shiftKey?: boolean;
    preventDefault: () => void;
  }) => boolean;
  onReviewPromptSelectBranch: (value: string) => void;
  onReviewPromptSelectBranchAtIndex: (index: number) => void;
  onReviewPromptConfirmBranch: () => Promise<void>;
  onReviewPromptSelectCommit: (sha: string, title: string) => void;
  onReviewPromptSelectCommitAtIndex: (index: number) => void;
  onReviewPromptConfirmCommit: () => Promise<void>;
  onReviewPromptUpdateCustomInstructions: (value: string) => void;
  onReviewPromptConfirmCustom: () => Promise<void>;
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
  appsEnabled: boolean;
  apps: AppOption[];
  prompts: CustomPromptOption[];
  files: string[];
  onInsertComposerText: (text: string) => void;
  canInsertComposerText: boolean;
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
  composerContextActions: ComposerContextAction[];
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
  onShowSelectedDiff: () => void;
  onGoProjects: () => void;
};

export type LayoutNodesResult = {
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
