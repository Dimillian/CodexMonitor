// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  GitHubPullRequest,
  PullRequestReviewAction,
  WorkspaceInfo,
} from "../../../types";
import { buildPullRequestDraft } from "../../../utils/pullRequestPrompt";
import { usePullRequestComposer } from "./usePullRequestComposer";

vi.mock("../../../utils/pullRequestPrompt", () => ({
  buildPullRequestDraft: vi.fn(() => "Draft text"),
}));

const pullRequest: GitHubPullRequest = {
  number: 12,
  title: "Add PR composer",
  url: "https://example.com/pr/12",
  updatedAt: "2024-01-01T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
  body: "Details",
  headRefName: "feature/pr-composer",
  baseRefName: "main",
  isDraft: false,
  author: { login: "octocat" },
};

const reviewActions: PullRequestReviewAction[] = [
  { id: "pr-review-full", label: "Review PR", intent: "full" },
  { id: "pr-review-risks", label: "Risk Scan", intent: "risks" },
];

const connectedWorkspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const makeOptions = (overrides: Partial<Parameters<typeof usePullRequestComposer>[0]> = {}) => ({
  activeWorkspace: connectedWorkspace,
  selectedPullRequest: null,
  filePanelMode: "git" as const,
  gitPanelMode: "prs" as const,
  centerMode: "diff" as const,
  isCompact: false,
  setSelectedPullRequest: vi.fn(),
  setDiffSource: vi.fn(),
  setSelectedDiffPath: vi.fn(),
  setCenterMode: vi.fn(),
  setGitPanelMode: vi.fn(),
  setPrefillDraft: vi.fn(),
  setActiveTab: vi.fn(),
  pullRequestReviewActions: reviewActions,
  pullRequestReviewLaunching: false,
  runPullRequestReview: vi.fn().mockResolvedValue("thread-review-1"),
  clearActiveImages: vi.fn(),
  handleSend: vi.fn().mockResolvedValue(undefined),
  queueMessage: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("usePullRequestComposer", () => {
  it("prefills composer and switches to PR diff view", () => {
    const options = makeOptions({ isCompact: true });
    const { result } = renderHook(() => usePullRequestComposer(options));

    act(() => {
      result.current.handleSelectPullRequest(pullRequest);
    });

    expect(options.setSelectedPullRequest).toHaveBeenCalledWith(pullRequest);
    expect(options.setDiffSource).toHaveBeenCalledWith("pr");
    expect(options.setSelectedDiffPath).toHaveBeenCalledWith(null);
    expect(options.setCenterMode).toHaveBeenCalledWith("diff");
    expect(options.setGitPanelMode).toHaveBeenCalledWith("prs");
    expect(buildPullRequestDraft).toHaveBeenCalledWith(pullRequest);
    expect(options.setPrefillDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Draft text",
        createdAt: expect.any(Number),
      }),
    );
    expect(options.setActiveTab).toHaveBeenCalledWith("git");
  });

  it("resets PR selection when leaving PR flow", () => {
    const options = makeOptions();
    const { result } = renderHook(() => usePullRequestComposer(options));

    act(() => {
      result.current.resetPullRequestSelection();
    });

    expect(options.setDiffSource).toHaveBeenCalledWith("local");
    expect(options.setSelectedPullRequest).toHaveBeenCalledWith(null);
  });

  it("uses default send handler outside PR mode", async () => {
    const options = makeOptions({
      selectedPullRequest: null,
      filePanelMode: "files",
    });
    const { result } = renderHook(() => usePullRequestComposer(options));

    await act(async () => {
      await result.current.handleComposerSend("Hello", []);
    });

    expect(options.handleSend).toHaveBeenCalledWith("Hello", []);
    expect(options.runPullRequestReview).not.toHaveBeenCalled();
  });

  it("runs PR review for question text in PR mode", async () => {
    const options = makeOptions({ selectedPullRequest: pullRequest });
    const { result } = renderHook(() => usePullRequestComposer(options));

    await act(async () => {
      await result.current.handleComposerSend("  Question? ", ["img-1"]);
    });

    expect(options.runPullRequestReview).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "question",
        question: "Question?",
        images: ["img-1"],
        activateThread: true,
      }),
    );
    expect(options.clearActiveImages).toHaveBeenCalled();
  });

  it("does nothing when PR send has no text or images", async () => {
    const options = makeOptions({ selectedPullRequest: pullRequest });
    const { result } = renderHook(() => usePullRequestComposer(options));

    await act(async () => {
      await result.current.handleComposerSend("  ", []);
    });

    expect(options.runPullRequestReview).not.toHaveBeenCalled();
  });

  it("routes slash commands to the normal composer handler in PR mode", async () => {
    const options = makeOptions({ selectedPullRequest: pullRequest });
    const { result } = renderHook(() => usePullRequestComposer(options));

    await act(async () => {
      await result.current.handleComposerSend("/apps", []);
    });

    expect(options.handleSend).toHaveBeenCalledWith("/apps", []);
    expect(options.runPullRequestReview).not.toHaveBeenCalled();
  });

  it("maps /review to PR-wide review while in PR mode", async () => {
    const options = makeOptions({ selectedPullRequest: pullRequest });
    const { result } = renderHook(() => usePullRequestComposer(options));

    await act(async () => {
      await result.current.handleComposerSend("/review", []);
    });

    expect(options.runPullRequestReview).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "full",
        activateThread: true,
      }),
    );
    expect(options.handleSend).not.toHaveBeenCalled();
  });

  it("treats non-command slash-prefixed text as a PR prompt in PR mode", async () => {
    const options = makeOptions({ selectedPullRequest: pullRequest });
    const { result } = renderHook(() => usePullRequestComposer(options));

    await act(async () => {
      await result.current.handleComposerSend("/src-tauri/something", []);
    });

    expect(options.handleSend).not.toHaveBeenCalled();
    expect(options.runPullRequestReview).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "question",
        question: "/src-tauri/something",
        activateThread: true,
      }),
    );
  });

  it("exposes composer context actions in PR mode", () => {
    const options = makeOptions({ selectedPullRequest: pullRequest });
    const { result } = renderHook(() => usePullRequestComposer(options));

    expect(result.current.composerContextActions.length).toBeGreaterThan(0);
  });

  it("disables composer context actions while launching a PR review", () => {
    const options = makeOptions({
      selectedPullRequest: pullRequest,
      pullRequestReviewLaunching: true,
    });
    const { result } = renderHook(() => usePullRequestComposer(options));

    expect(result.current.composerContextActions.every((action) => action.disabled)).toBe(true);
  });

  it("runs composer context actions in a new active PR review thread", async () => {
    const options = makeOptions({ selectedPullRequest: pullRequest });
    const { result } = renderHook(() => usePullRequestComposer(options));

    await act(async () => {
      await result.current.composerContextActions[0]?.onSelect();
    });

    expect(options.runPullRequestReview).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: reviewActions[0]?.intent,
        activateThread: true,
      }),
    );
  });
});
