import { useCallback, useMemo } from "react";
import type {
  AppMention,
  PullRequestReviewAction,
  PullRequestReviewIntent,
  GitHubPullRequest,
  WorkspaceInfo,
} from "../../../types";
import { buildPullRequestDraft } from "../../../utils/pullRequestPrompt";
import { parsePullRequestReviewCommand } from "../utils/pullRequestReviewCommands";

const KNOWN_SLASH_COMMAND_REGEX = /^\/(?:apps|fork|mcp|new|resume|status)\b/i;

type ComposerContextAction = {
  id: string;
  label: string;
  title?: string;
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
};

type UsePullRequestComposerOptions = {
  activeWorkspace: WorkspaceInfo | null;
  selectedPullRequest: GitHubPullRequest | null;
  filePanelMode: "git" | "files" | "prompts";
  gitPanelMode: "diff" | "log" | "issues" | "prs";
  centerMode: "chat" | "diff";
  isCompact: boolean;
  setSelectedPullRequest: (pullRequest: GitHubPullRequest | null) => void;
  setDiffSource: (source: "local" | "pr" | "commit") => void;
  setSelectedDiffPath: (path: string | null) => void;
  setCenterMode: (mode: "chat" | "diff") => void;
  setGitPanelMode: (mode: "diff" | "log" | "issues" | "prs") => void;
  setPrefillDraft: (draft: { id: string; text: string; createdAt: number }) => void;
  setActiveTab: (tab: "home" | "projects" | "codex" | "git" | "log") => void;
  pullRequestReviewActions: PullRequestReviewAction[];
  pullRequestReviewLaunching: boolean;
  runPullRequestReview: (options: {
    intent: PullRequestReviewIntent;
    question?: string;
    images?: string[];
    activateThread?: boolean;
  }) => Promise<string | null>;
  clearActiveImages: () => void;
  handleSend: (
    text: string,
    images: string[],
    appMentions?: AppMention[],
  ) => Promise<void>;
  queueMessage: (
    text: string,
    images: string[],
    appMentions?: AppMention[],
  ) => Promise<void>;
};

export function usePullRequestComposer({
  activeWorkspace,
  selectedPullRequest,
  filePanelMode,
  gitPanelMode,
  centerMode,
  isCompact,
  setSelectedPullRequest,
  setDiffSource,
  setSelectedDiffPath,
  setCenterMode,
  setGitPanelMode,
  setPrefillDraft,
  setActiveTab,
  pullRequestReviewActions,
  pullRequestReviewLaunching,
  runPullRequestReview,
  clearActiveImages,
  handleSend,
  queueMessage,
}: UsePullRequestComposerOptions) {
  const isPullRequestComposer = useMemo(
    () =>
      Boolean(selectedPullRequest) &&
      filePanelMode === "git" &&
      gitPanelMode === "prs" &&
      centerMode === "diff",
    [centerMode, filePanelMode, gitPanelMode, selectedPullRequest],
  );

  const handleSelectPullRequest = useCallback(
    (pullRequest: GitHubPullRequest) => {
      setSelectedPullRequest(pullRequest);
      setDiffSource("pr");
      setSelectedDiffPath(null);
      setCenterMode("diff");
      setGitPanelMode("prs");
      setPrefillDraft({
        id: `pr-prefill-${pullRequest.number}-${Date.now()}`,
        text: buildPullRequestDraft(pullRequest),
        createdAt: Date.now(),
      });
      if (isCompact) {
        setActiveTab("git");
      }
    },
    [
      isCompact,
      setActiveTab,
      setCenterMode,
      setDiffSource,
      setGitPanelMode,
      setPrefillDraft,
      setSelectedDiffPath,
      setSelectedPullRequest,
    ],
  );

  const resetPullRequestSelection = useCallback(() => {
    setDiffSource("local");
    setSelectedPullRequest(null);
  }, [setDiffSource, setSelectedPullRequest]);

  const handleSendPullRequestQuestion = useCallback(
    async (
      text: string,
      images: string[] = [],
      appMentions: AppMention[] = [],
    ) => {
      if (pullRequestReviewLaunching) {
        return;
      }
      const trimmed = text.trim();
      const reviewCommand = parsePullRequestReviewCommand(trimmed);
      if (reviewCommand) {
        const reviewThreadId = await runPullRequestReview({
          intent: reviewCommand.intent,
          question: reviewCommand.question,
          images,
          activateThread: true,
        });
        if (reviewThreadId) {
          clearActiveImages();
        }
        return;
      }
      if (KNOWN_SLASH_COMMAND_REGEX.test(trimmed)) {
        if (appMentions.length > 0) {
          await handleSend(trimmed, images, appMentions);
        } else {
          await handleSend(trimmed, images);
        }
        return;
      }
      if (!activeWorkspace || !selectedPullRequest) {
        return;
      }
      if (!trimmed && images.length === 0) {
        return;
      }
      const reviewThreadId = await runPullRequestReview({
        intent: "question",
        question: trimmed,
        images,
        activateThread: true,
      });
      if (reviewThreadId) {
        clearActiveImages();
      }
    },
    [
      activeWorkspace,
      clearActiveImages,
      handleSend,
      selectedPullRequest,
      pullRequestReviewLaunching,
      runPullRequestReview,
    ],
  );

  const composerContextActions = useMemo<ComposerContextAction[]>(() => {
    if (!isPullRequestComposer || !activeWorkspace || !selectedPullRequest) {
      return [];
    }
    return pullRequestReviewActions.map((action) => ({
      id: action.id,
      label: action.label,
      title: `${action.label} for PR #${selectedPullRequest.number}`,
      disabled: pullRequestReviewLaunching,
      onSelect: async () => {
        const reviewThreadId = await runPullRequestReview({
          intent: action.intent,
          activateThread: true,
        });
        if (reviewThreadId) {
          clearActiveImages();
        }
      },
    }));
  }, [
    activeWorkspace,
    clearActiveImages,
    isPullRequestComposer,
    pullRequestReviewLaunching,
    pullRequestReviewActions,
    runPullRequestReview,
    selectedPullRequest,
  ]);

  const composerSendLabel = isPullRequestComposer ? "Ask PR" : undefined;
  const handleComposerSend = isPullRequestComposer
    ? handleSendPullRequestQuestion
    : handleSend;
  const handleComposerQueue = isPullRequestComposer
    ? handleSendPullRequestQuestion
    : queueMessage;

  return {
    handleSelectPullRequest,
    resetPullRequestSelection,
    isPullRequestComposer,
    composerContextActions,
    composerSendLabel,
    handleComposerSend,
    handleComposerQueue,
  };
}
