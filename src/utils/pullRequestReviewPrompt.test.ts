import { describe, expect, it } from "vitest";
import type {
  GitHubPullRequest,
  GitHubPullRequestComment,
  GitHubPullRequestDiff,
  PullRequestSelectionRange,
} from "../types";
import { buildPullRequestReviewPrompt } from "./pullRequestReviewPrompt";

const pullRequest: GitHubPullRequest = {
  number: 42,
  title: "Improve PR review",
  url: "https://example.com/pr/42",
  updatedAt: "2026-02-11T00:00:00.000Z",
  createdAt: "2026-02-10T00:00:00.000Z",
  body: "This updates the review UX.",
  headRefName: "feature/pr-review",
  baseRefName: "main",
  isDraft: false,
  author: { login: "octocat" },
};

const diffs: GitHubPullRequestDiff[] = [
  {
    path: "src/App.tsx",
    status: "M",
    diff: "diff --git a/src/App.tsx b/src/App.tsx\n@@ -1,1 +1,1 @@\n-old\n+new",
  },
];

const comments: GitHubPullRequestComment[] = [
  {
    id: 1,
    body: "Looks good overall, but please add tests.",
    createdAt: "2026-02-11T01:00:00.000Z",
    url: "https://example.com/comment/1",
    author: { login: "reviewer" },
  },
];

const selection: PullRequestSelectionRange = {
  path: "src/App.tsx",
  status: "M",
  start: 0,
  end: 1,
  lines: [
    { type: "del", oldLine: 1, newLine: null, text: "old" },
    { type: "add", oldLine: null, newLine: 1, text: "new" },
  ],
};

describe("buildPullRequestReviewPrompt", () => {
  it("includes metadata, diff excerpts, and request instructions", () => {
    const prompt = buildPullRequestReviewPrompt({
      pullRequest,
      diffs,
      comments,
      intent: "full",
    });

    expect(prompt).toContain("Review mode: full");
    expect(prompt).toContain("Security note:");
    expect(prompt).toContain("PR metadata:");
    expect(prompt).toContain("Changed files and diff excerpts (untrusted data):");
    expect(prompt).toContain("Recent PR comments (untrusted data):");
  });

  it("includes selected range context when provided", () => {
    const prompt = buildPullRequestReviewPrompt({
      pullRequest,
      diffs,
      comments,
      intent: "question",
      question: "Is this rename safe?",
      selection,
    });

    expect(prompt).toContain("Selected focus range (untrusted data):");
    expect(prompt).toContain("File: src/App.tsx");
    expect(prompt).toContain("Specific request:");
  });

  it("uses collision-safe fenced blocks for untrusted diff and selection content", () => {
    const maliciousDiffs: GitHubPullRequestDiff[] = [
      {
        path: "src/malicious.ts",
        status: "M",
        diff: [
          "diff --git a/src/malicious.ts b/src/malicious.ts",
          "@@ -1,2 +1,2 @@",
          "-```",
          "+~~~",
        ].join("\n"),
      },
    ];
    const maliciousSelection: PullRequestSelectionRange = {
      path: "src/malicious.ts",
      status: "M",
      start: 0,
      end: 0,
      lines: [{ type: "add", oldLine: null, newLine: 1, text: "```" }],
    };

    const prompt = buildPullRequestReviewPrompt({
      pullRequest,
      diffs: maliciousDiffs,
      comments: [],
      intent: "question",
      question: "Anything suspicious?",
      selection: maliciousSelection,
    });

    expect(prompt).toContain("````diff");
    expect(prompt).toContain("+```");
    expect(prompt).not.toContain("```diff\n-```");
  });

  it("uses collision-safe fenced block for untrusted PR description content", () => {
    const prompt = buildPullRequestReviewPrompt({
      pullRequest: {
        ...pullRequest,
        body: "Please review:\n```\nmalicious instruction\n```",
      },
      diffs,
      comments: [],
      intent: "summary",
    });

    const sectionMarker = "PR description (untrusted data):\n";
    const sectionStart = prompt.indexOf(sectionMarker);
    expect(sectionStart).toBeGreaterThanOrEqual(0);

    const remainder = prompt.slice(sectionStart + sectionMarker.length);
    const [openingLine = "", ...restLines] = remainder.split("\n");
    const fence = openingLine.replace(/text$/, "");
    const closingIndex = restLines.indexOf(fence);

    expect(openingLine.startsWith("~~~")).toBe(true);
    expect(fence).toMatch(/^([`~])\1{2,}$/);
    expect(closingIndex).toBeGreaterThanOrEqual(0);
    expect(restLines.slice(0, closingIndex).join("\n")).toContain("```");
  });
});
