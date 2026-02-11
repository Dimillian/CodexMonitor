import type { GitHubPullRequest, GitHubPullRequestDiff } from "../types";
import { buildPullRequestReviewPrompt } from "./pullRequestReviewPrompt";

export function buildPullRequestDraft(pullRequest: GitHubPullRequest) {
  return `Question about PR #${pullRequest.number} (${pullRequest.title}):\n`;
}

export function buildPullRequestPrompt(
  pullRequest: GitHubPullRequest,
  diffs: GitHubPullRequestDiff[],
  question: string,
) {
  return buildPullRequestReviewPrompt({
    pullRequest,
    diffs,
    intent: "question",
    question,
  });
}
