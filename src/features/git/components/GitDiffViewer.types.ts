import type {
  GitSelectionApplyResult,
  GitSelectionLine,
  GitHubPullRequest,
  GitHubPullRequestComment,
  PullRequestReviewAction,
  PullRequestReviewIntent,
  PullRequestSelectionRange,
} from "../../../types";
import type { GitDiffSource } from "../types";

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
  diffSource?: GitDiffSource;
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
  stagedPaths?: string[];
  unstagedPaths?: string[];
  onStageSelection?: (options: {
    path: string;
    op: "stage" | "unstage";
    source: "unstaged" | "staged";
    lines: GitSelectionLine[];
  }) => Promise<GitSelectionApplyResult | null>;
  onActivePathChange?: (path: string) => void;
  onInsertComposerText?: (text: string) => void;
};
