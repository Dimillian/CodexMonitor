// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useInitGitRepoPrompt } from "./useInitGitRepoPrompt";

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Repo",
  path: "/tmp/repo",
  connected: true,
  settings: {
    sidebarCollapsed: false,
  },
};

describe("useInitGitRepoPrompt", () => {
  it("does not set generic error when init confirmation is canceled", async () => {
    const initGitRepo = vi.fn().mockResolvedValue("cancelled");
    const createGitHubRepo = vi.fn().mockResolvedValue({ ok: true });
    const refreshGitRemote = vi.fn();

    const { result } = renderHook(() =>
      useInitGitRepoPrompt({
        activeWorkspace: workspace,
        initGitRepo,
        createGitHubRepo,
        refreshGitRemote,
        isBusy: false,
      }),
    );

    act(() => {
      result.current.openInitGitRepoPrompt();
    });

    await act(async () => {
      await result.current.handleInitGitRepoPromptConfirm();
    });

    expect(initGitRepo).toHaveBeenCalledWith("main");
    expect(createGitHubRepo).not.toHaveBeenCalled();
    expect(result.current.initGitRepoPrompt).not.toBeNull();
    expect(result.current.initGitRepoPrompt?.error).toBeNull();
  });

  it("sets generic error when init actually fails", async () => {
    const initGitRepo = vi.fn().mockResolvedValue("failed");
    const createGitHubRepo = vi.fn().mockResolvedValue({ ok: true });
    const refreshGitRemote = vi.fn();

    const { result } = renderHook(() =>
      useInitGitRepoPrompt({
        activeWorkspace: workspace,
        initGitRepo,
        createGitHubRepo,
        refreshGitRemote,
        isBusy: false,
      }),
    );

    act(() => {
      result.current.openInitGitRepoPrompt();
    });

    await act(async () => {
      await result.current.handleInitGitRepoPromptConfirm();
    });

    expect(result.current.initGitRepoPrompt?.error).toBe(
      "Failed to initialize Git repository.",
    );
  });
});

