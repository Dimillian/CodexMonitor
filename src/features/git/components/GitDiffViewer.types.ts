import type {
  GitFileDisplayHunk,
  GitSelectionApplyResult,
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
  stagedDiff?: string | null;
  unstagedDiff?: string | null;
  displayHunks?: GitFileDisplayHunk[];
  oldLines?: string[];
  newLines?: string[];
  isImage?: boolean;
  oldImageData?: string | null;
  newImageData?: string | null;
  oldImageMime?: string | null;
  newImageMime?: string | null;
};

export type LocalLineAction = Pick<GitFileDisplayHunk, "id" | "source" | "action"> & {
  label: "Stage" | "Unstage";
  title: string;
  disabledReason?: string;
};

export type LocalLineActionContext = {
  displayHunks: GitFileDisplayHunk[];
  disabledReason?: string;
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
  onApplyDisplayHunk?: (options: {
    path: string;
    displayHunkId: string;
  }) => Promise<GitSelectionApplyResult | null>;
  onActivePathChange?: (path: string) => void;
  onInsertComposerText?: (text: string) => void;
};
