// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  GitHubPullRequest,
  GitHubPullRequestDiff,
  WorkspaceInfo,
} from "../../../types";
import {
  buildPullRequestDraft,
  buildPullRequestPrompt,
} from "../../../utils/pullRequestPrompt";
import { usePullRequestComposer } from "./usePullRequestComposer";

vi.mock("../../../utils/pullRequestPrompt", () => ({
  buildPullRequestDraft: vi.fn(() => "Draft text"),
  buildPullRequestPrompt: vi.fn(() => "Prompt text"),
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

const diffs: GitHubPullRequestDiff[] = [
  { path: "src/App.tsx", status: "modified", diff: "diff" },
];

const connectedWorkspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const disconnectedWorkspace: WorkspaceInfo = {
  id: "workspace-2",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: false,
  settings: { sidebarCollapsed: false },
};

const makeOptions = (overrides: Partial<Parameters<typeof usePullRequestComposer>[0]> = {}) => ({
  activeWorkspace: connectedWorkspace,
  selectedPullRequest: null,
  gitPullRequestDiffs: diffs,
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
  connectWorkspace: vi.fn().mockResolvedValue(undefined),
  startThreadForWorkspace: vi.fn().mockResolvedValue("thread-1"),
  sendUserMessageToThread: vi.fn().mockResolvedValue(undefined),
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
    expect(options.startThreadForWorkspace).not.toHaveBeenCalled();
  });

  it("creates a new thread and sends PR prompt when in PR mode", async () => {
    const options = makeOptions({
      activeWorkspace: disconnectedWorkspace,
      selectedPullRequest: pullRequest,
    });
    const { result } = renderHook(() => usePullRequestComposer(options));

    await act(async () => {
      await result.current.handleComposerSend("  Question? ", ["img-1"]);
    });

    expect(options.connectWorkspace).toHaveBeenCalledWith(disconnectedWorkspace);
    expect(buildPullRequestPrompt).toHaveBeenCalledWith(
      pullRequest,
      diffs,
      "Question?",
    );
    expect(options.startThreadForWorkspace).toHaveBeenCalledWith(
      disconnectedWorkspace.id,
      { activate: false },
    );
    expect(options.sendUserMessageToThread).toHaveBeenCalledWith(
      disconnectedWorkspace,
      "thread-1",
      "Prompt text",
      ["img-1"],
    );
    expect(options.clearActiveImages).toHaveBeenCalled();
  });

  it("does nothing when PR send has no text or images", async () => {
    const options = makeOptions({ selectedPullRequest: pullRequest });
    const { result } = renderHook(() => usePullRequestComposer(options));

    await act(async () => {
      await result.current.handleComposerSend("  ", []);
    });

    expect(options.startThreadForWorkspace).not.toHaveBeenCalled();
    expect(options.sendUserMessageToThread).not.toHaveBeenCalled();
  });
});
