// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { getGitStatus } from "../../../services/tauri";
import { useGitStatus } from "./useGitStatus";

vi.mock("../../../services/tauri", () => ({
  getGitStatus: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const secondaryWorkspace: WorkspaceInfo = {
  id: "workspace-2",
  name: "CodexMonitor Secondary",
  path: "/tmp/codex-secondary",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const makeStatus = (branchName: string, additions = 0, deletions = 0) => ({
  branchName,
  files: [],
  stagedFiles: [],
  unstagedFiles: [],
  totalAdditions: additions,
  totalDeletions: deletions,
});

describe("useGitStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("polls on interval and updates status", async () => {
    const getGitStatusMock = vi.mocked(getGitStatus);
    getGitStatusMock
      .mockResolvedValueOnce(makeStatus("main", 2, 1))
      .mockResolvedValueOnce(makeStatus("next", 3, 4));

    const { result, unmount } = renderHook(
      ({ active }: { active: WorkspaceInfo | null }) => useGitStatus(active),
      { initialProps: { active: workspace } },
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(getGitStatusMock).toHaveBeenCalledTimes(1);
    expect(result.current.status.branchName).toBe("main");
    expect(result.current.status.totalAdditions).toBe(2);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getGitStatusMock).toHaveBeenCalledTimes(2);
    expect(result.current.status.branchName).toBe("next");
    expect(result.current.status.totalDeletions).toBe(4);

    unmount();
  });

  it("refresh triggers a new fetch", async () => {
    const getGitStatusMock = vi.mocked(getGitStatus);
    getGitStatusMock
      .mockResolvedValueOnce(makeStatus("main", 1, 0))
      .mockResolvedValueOnce(makeStatus("manual", 5, 6));

    const { result, unmount } = renderHook(
      ({ active }: { active: WorkspaceInfo | null }) => useGitStatus(active),
      { initialProps: { active: workspace } },
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status.branchName).toBe("main");

    await act(async () => {
      await result.current.refresh();
    });

    expect(getGitStatusMock).toHaveBeenCalledTimes(2);
    expect(result.current.status.branchName).toBe("manual");
    expect(result.current.status.totalAdditions).toBe(5);

    unmount();
  });

  it("refreshes on workspace changes and ignores stale results", async () => {
    const getGitStatusMock = vi.mocked(getGitStatus);
    let resolveFirst: (value: ReturnType<typeof makeStatus>) => void;
    let resolveSecond: (value: ReturnType<typeof makeStatus>) => void;
    const firstPromise = new Promise<ReturnType<typeof makeStatus>>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    const secondPromise = new Promise<ReturnType<typeof makeStatus>>(
      (resolve) => {
        resolveSecond = resolve;
      },
    );
    getGitStatusMock
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    const { result, rerender, unmount } = renderHook(
      ({ active }: { active: WorkspaceInfo | null }) => useGitStatus(active),
      { initialProps: { active: workspace } },
    );

    await act(async () => {
      await Promise.resolve();
    });

    rerender({ active: secondaryWorkspace });

    await act(async () => {
      await Promise.resolve();
    });

    expect(getGitStatusMock).toHaveBeenCalledWith("workspace-1");
    expect(getGitStatusMock).toHaveBeenCalledWith("workspace-2");

    await act(async () => {
      resolveSecond(makeStatus("secondary", 4, 0));
      await Promise.resolve();
    });

    expect(result.current.status.branchName).toBe("secondary");

    await act(async () => {
      resolveFirst(makeStatus("primary", 1, 1));
      await Promise.resolve();
    });

    expect(result.current.status.branchName).toBe("secondary");

    unmount();
  });

  it("keeps cached branch on error", async () => {
    const getGitStatusMock = vi.mocked(getGitStatus);
    getGitStatusMock
      .mockResolvedValueOnce(makeStatus("main", 1, 0))
      .mockRejectedValueOnce(new Error("boom"));

    const { result, unmount } = renderHook(
      ({ active }: { active: WorkspaceInfo | null }) => useGitStatus(active),
      { initialProps: { active: workspace } },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status.branchName).toBe("main");

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.status.branchName).toBe("main");
    expect(result.current.status.error).toBe("boom");

    unmount();
  });
});
