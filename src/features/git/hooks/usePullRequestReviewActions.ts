import { useCallback, useMemo, useRef, useState } from "react";
import type {
  GitHubPullRequest,
  GitHubPullRequestComment,
  GitHubPullRequestDiff,
  PullRequestReviewAction,
  PullRequestReviewIntent,
  PullRequestSelectionRange,
  WorkspaceInfo,
} from "@/types";
import { pushErrorToast } from "@services/toasts";
import { buildPullRequestReviewPrompt } from "@utils/pullRequestReviewPrompt";

const REVIEW_ACTIONS: PullRequestReviewAction[] = [
  { id: "pr-review-full", label: "Review PR", intent: "full" },
  { id: "pr-review-risks", label: "Risk Scan", intent: "risks" },
  { id: "pr-review-tests", label: "Test Plan", intent: "tests" },
  { id: "pr-review-summary", label: "Summarize", intent: "summary" },
];

type UsePullRequestReviewActionsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  pullRequest: GitHubPullRequest | null;
  pullRequestDiffs: GitHubPullRequestDiff[];
  pullRequestComments: GitHubPullRequestComment[];
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
  ) => Promise<void>;
};

type RunPullRequestReviewOptions = {
  intent: PullRequestReviewIntent;
  question?: string;
  selection?: PullRequestSelectionRange | null;
  images?: string[];
  activateThread?: boolean;
};

export function usePullRequestReviewActions({
  activeWorkspace,
  pullRequest,
  pullRequestDiffs,
  pullRequestComments,
  connectWorkspace,
  startThreadForWorkspace,
  sendUserMessageToThread,
}: UsePullRequestReviewActionsOptions) {
  const [isLaunchingReview, setIsLaunchingReview] = useState(false);
  const [lastReviewThreadId, setLastReviewThreadId] = useState<string | null>(null);
  const launchInFlightRef = useRef(false);

  const runPullRequestReview = useCallback(
    async ({
      intent,
      question,
      selection = null,
      images = [],
      activateThread = false,
    }: RunPullRequestReviewOptions): Promise<string | null> => {
      if (!activeWorkspace || !pullRequest) {
        return null;
      }
      if (launchInFlightRef.current) {
        return null;
      }

      launchInFlightRef.current = true;
      setIsLaunchingReview(true);
      try {
        if (!activeWorkspace.connected) {
          await connectWorkspace(activeWorkspace);
        }

        const reviewThreadId = await startThreadForWorkspace(activeWorkspace.id, {
          activate: activateThread,
        });
        if (!reviewThreadId) {
          throw new Error("Failed to start a review thread.");
        }

        const prompt = buildPullRequestReviewPrompt({
          pullRequest,
          diffs: pullRequestDiffs,
          comments: pullRequestComments,
          intent,
          question,
          selection,
        });

        await sendUserMessageToThread(activeWorkspace, reviewThreadId, prompt, images);
        setLastReviewThreadId(reviewThreadId);
        return reviewThreadId;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pushErrorToast({
          title: "PR review failed",
          message,
        });
        return null;
      } finally {
        launchInFlightRef.current = false;
        setIsLaunchingReview(false);
      }
    },
    [
      activeWorkspace,
      connectWorkspace,
      pullRequest,
      pullRequestComments,
      pullRequestDiffs,
      sendUserMessageToThread,
      startThreadForWorkspace,
    ],
  );

  const reviewActions = useMemo(() => REVIEW_ACTIONS, []);

  return {
    isLaunchingReview,
    lastReviewThreadId,
    reviewActions,
    runPullRequestReview,
  };
}
