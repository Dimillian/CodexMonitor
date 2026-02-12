// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  GitHubPullRequest,
  GitHubPullRequestComment,
  GitHubPullRequestDiff,
  WorkspaceInfo,
} from "@/types";
import { usePullRequestReviewActions } from "./usePullRequestReviewActions";

const pushErrorToastMock = vi.fn();

vi.mock("@services/toasts", () => ({
  pushErrorToast: (...args: unknown[]) => pushErrorToastMock(...args),
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "CodexMonitor",
  path: "/tmp/codex-monitor",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const pullRequest: GitHubPullRequest = {
  number: 10,
  title: "Add PR review actions",
  url: "https://example.com/pr/10",
  updatedAt: "2026-02-11T00:00:00.000Z",
  createdAt: "2026-02-10T00:00:00.000Z",
  body: "Body",
  headRefName: "feature",
  baseRefName: "main",
  isDraft: false,
  author: { login: "octocat" },
};

const diffs: GitHubPullRequestDiff[] = [
  { path: "src/App.tsx", status: "M", diff: "@@ -1,1 +1,1 @@\n-old\n+new" },
];

const comments: GitHubPullRequestComment[] = [
  {
    id: 1,
    body: "Looks fine",
    createdAt: "2026-02-11T00:00:00.000Z",
    url: "https://example.com/comment/1",
    author: { login: "reviewer" },
  },
];

function renderActions(
  overrides: Partial<Parameters<typeof usePullRequestReviewActions>[0]> = {},
) {
  const options: Parameters<typeof usePullRequestReviewActions>[0] = {
    activeWorkspace: workspace,
    pullRequest,
    pullRequestDiffs: diffs,
    pullRequestComments: comments,
    connectWorkspace: vi.fn().mockResolvedValue(undefined),
    startThreadForWorkspace: vi.fn().mockResolvedValue("thread-new"),
    sendUserMessageToThread: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const rendered = renderHook(() => usePullRequestReviewActions(options));
  return { ...rendered, options };
}

describe("usePullRequestReviewActions", () => {
  it("always starts a new thread for PR review", async () => {
    const { result, options } = renderActions();

    await act(async () => {
      await result.current.runPullRequestReview({ intent: "full" });
    });

    expect(options.startThreadForWorkspace).toHaveBeenCalledWith(workspace.id, {
      activate: false,
    });
    expect(options.sendUserMessageToThread).toHaveBeenCalledWith(
      workspace,
      "thread-new",
      expect.any(String),
      [],
    );
  });

  it("returns null when no workspace or PR is selected", async () => {
    const { result } = renderActions({ activeWorkspace: null, pullRequest: null });

    let threadId: string | null = "placeholder";
    await act(async () => {
      threadId = await result.current.runPullRequestReview({ intent: "full" });
    });

    expect(threadId).toBeNull();
  });

  it("activates the review thread when requested", async () => {
    const { result, options } = renderActions();

    await act(async () => {
      await result.current.runPullRequestReview({
        intent: "question",
        question: "What changed?",
        activateThread: true,
      });
    });

    expect(options.startThreadForWorkspace).toHaveBeenCalledWith(workspace.id, {
      activate: true,
    });
  });

  it("prevents concurrent review launches from creating duplicate threads", async () => {
    const startThreadForWorkspace = vi
      .fn()
      .mockImplementation(() => new Promise<string>((resolve) => {
        setTimeout(() => resolve("thread-new"), 30);
      }));
    const { result, options } = renderActions({ startThreadForWorkspace });

    await act(async () => {
      await Promise.all([
        result.current.runPullRequestReview({ intent: "full" }),
        result.current.runPullRequestReview({ intent: "risks" }),
      ]);
    });

    expect(options.startThreadForWorkspace).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessageToThread).toHaveBeenCalledTimes(1);
  });
});
