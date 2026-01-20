import type { GitHubPullRequest, GitHubPullRequestDiff } from "../types";

export function buildPullRequestDraft(pullRequest: GitHubPullRequest) {
  return `Question about PR #${pullRequest.number} (${pullRequest.title}):\n`;
}

export function buildPullRequestPrompt(
  pullRequest: GitHubPullRequest,
  diffs: GitHubPullRequestDiff[],
  question: string,
) {
  const author = pullRequest.author?.login ?? "unknown";
  const lines: string[] = [
    "You are reviewing a GitHub pull request.",
    `PR: #${pullRequest.number} ${pullRequest.title}`,
    `URL: ${pullRequest.url}`,
    `Author: @${author}`,
    `Branches: ${pullRequest.baseRefName} <- ${pullRequest.headRefName}`,
    `Updated: ${pullRequest.updatedAt}`,
  ];

  if (pullRequest.isDraft) {
    lines.push("State: draft");
  }

  const body = pullRequest.body?.trim();
  if (body) {
    lines.push("", "Description:", body);
  }

  const diffNote =
    diffs.length === 0
      ? "Diff: unavailable in this message."
      : `Diff: ${diffs.length} file${diffs.length === 1 ? "" : "s"} changed (not included).`;
  lines.push("", diffNote);

  const trimmedQuestion = question.trim();
  if (trimmedQuestion) {
    lines.push("", "Question:", trimmedQuestion);
  }

  return lines.join("\n");
}
