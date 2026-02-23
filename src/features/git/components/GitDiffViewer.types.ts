import type {
  GitHubPullRequest,
  GitHubPullRequestComment,
  PullRequestReviewAction,
  PullRequestReviewIntent,
  PullRequestSelectionRange,
} from "../../../types";

export type GitDiffViewerItem = {
  path: string;
  displayPath?: string;
  status: string;
  diff: string;
  oldLines?: string[];
  newLines?: string[];
  isImage?: boolean;
  oldImageData?: string | null;
  newImageData?: string | null;
  oldImageMime?: string | null;
  newImageMime?: string | null;
};

export type DiffStats = {
  additions: number;
  deletions: number;
};

export type GitDiffViewerProps = {
  diffs: GitDiffViewerItem[];
  selectedPath: string | null;
  scrollRequestId?: number;
  isLoading: boolean;
  error: string | null;
  diffStyle?: "split" | "unified";
  ignoreWhitespaceChanges?: boolean;
  pullRequest?: GitHubPullRequest | null;
  pullRequestComments?: GitHubPullRequestComment[];
  pullRequestCommentsLoading?: boolean;
  pullRequestCommentsError?: string | null;
  pullRequestReviewActions?: PullRequestReviewAction[];
  onRunPullRequestReview?: (options: {
    intent: PullRequestReviewIntent;
    question?: string;
    selection?: PullRequestSelectionRange | null;
    images?: string[];
  }) => Promise<string | null>;
  pullRequestReviewLaunching?: boolean;
  pullRequestReviewThreadId?: string | null;
  onCheckoutPullRequest?: (
    pullRequest: GitHubPullRequest,
  ) => Promise<void> | void;
  canRevert?: boolean;
  onRevertFile?: (path: string) => Promise<void> | void;
  onActivePathChange?: (path: string) => void;
};
