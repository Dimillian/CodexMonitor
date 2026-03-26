// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadSummary, WorkspaceInfo } from "../../../types";
import {
  buildTrayRecentThreadEntries,
  useTrayRecentThreads,
} from "./useTrayRecentThreads";

const isTauriMock = vi.hoisted(() => vi.fn(() => true));
const setTrayRecentThreadsMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: isTauriMock,
}));

vi.mock("@services/tauri", () => ({
  setTrayRecentThreads: (...args: unknown[]) => setTrayRecentThreadsMock(...args),
}));

function makeWorkspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    id: "ws-1",
    name: "Workspace One",
    path: "/tmp/workspace-one",
    connected: true,
    settings: { sidebarCollapsed: false },
    ...overrides,
  };
}

function makeThread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread-1",
    name: "Thread One",
    updatedAt: 1,
    ...overrides,
  };
}

describe("useTrayRecentThreads", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    isTauriMock.mockReturnValue(true);
    setTrayRecentThreadsMock.mockReset();
    setTrayRecentThreadsMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds all visible tray entries ordered by updatedAt and excludes subagents", () => {
    const workspaces = [
      makeWorkspace(),
      makeWorkspace({
        id: "ws-2",
        name: "Workspace Two",
        path: "/tmp/workspace-two",
      }),
    ];
    const threadsByWorkspace = {
      "ws-1": Array.from({ length: 5 }, (_, index) =>
        makeThread({
          id: `ws-1-thread-${index + 1}`,
          name: `Workspace One ${index + 1}`,
          updatedAt: 100 - index,
        }),
      ),
      "ws-2": Array.from({ length: 5 }, (_, index) =>
        makeThread({
          id: `ws-2-thread-${index + 1}`,
          name: index === 0 ? "Hidden" : `Workspace Two ${index}`,
          updatedAt: 90 - index,
        }),
      ),
    };

    const entries = buildTrayRecentThreadEntries(
      workspaces,
      threadsByWorkspace,
      (workspaceId, threadId) => workspaceId === "ws-2" && threadId === "ws-2-thread-1",
    );

    expect(entries).toHaveLength(9);
    expect(entries).toEqual([
      {
        workspaceId: "ws-1",
        workspaceLabel: "Workspace One",
        threadId: "ws-1-thread-1",
        threadLabel: "Workspace One 1",
        updatedAt: 100,
      },
      {
        workspaceId: "ws-1",
        workspaceLabel: "Workspace One",
        threadId: "ws-1-thread-2",
        threadLabel: "Workspace One 2",
        updatedAt: 99,
      },
      {
        workspaceId: "ws-1",
        workspaceLabel: "Workspace One",
        threadId: "ws-1-thread-3",
        threadLabel: "Workspace One 3",
        updatedAt: 98,
      },
      {
        workspaceId: "ws-1",
        workspaceLabel: "Workspace One",
        threadId: "ws-1-thread-4",
        threadLabel: "Workspace One 4",
        updatedAt: 97,
      },
      {
        workspaceId: "ws-1",
        workspaceLabel: "Workspace One",
        threadId: "ws-1-thread-5",
        threadLabel: "Workspace One 5",
        updatedAt: 96,
      },
      {
        workspaceId: "ws-2",
        workspaceLabel: "Workspace Two",
        threadId: "ws-2-thread-2",
        threadLabel: "Workspace Two 1",
        updatedAt: 89,
      },
      {
        workspaceId: "ws-2",
        workspaceLabel: "Workspace Two",
        threadId: "ws-2-thread-3",
        threadLabel: "Workspace Two 2",
        updatedAt: 88,
      },
      {
        workspaceId: "ws-2",
        workspaceLabel: "Workspace Two",
        threadId: "ws-2-thread-4",
        threadLabel: "Workspace Two 3",
        updatedAt: 87,
      },
      {
        workspaceId: "ws-2",
        workspaceLabel: "Workspace Two",
        threadId: "ws-2-thread-5",
        threadLabel: "Workspace Two 4",
        updatedAt: 86,
      },
    ]);
  });

  it("syncs only when the derived recent list changes", async () => {
    const workspaces = [makeWorkspace()];
    const initialThreads = {
      "ws-1": [makeThread({ id: "thread-1", name: "Alpha", updatedAt: 10 })],
    };

    const { rerender } = renderHook(
      ({
        threadsByWorkspace,
      }: {
        threadsByWorkspace: Record<string, ThreadSummary[]>;
      }) =>
        useTrayRecentThreads({
          workspaces,
          threadsByWorkspace,
          isSubagentThread: () => false,
        }),
      {
        initialProps: {
          threadsByWorkspace: initialThreads,
        },
      },
    );

    await vi.runAllTimersAsync();
    expect(setTrayRecentThreadsMock).toHaveBeenCalledTimes(1);

    rerender({ threadsByWorkspace: initialThreads });
    await vi.runAllTimersAsync();
    expect(setTrayRecentThreadsMock).toHaveBeenCalledTimes(1);

    rerender({
      threadsByWorkspace: {
        "ws-1": [makeThread({ id: "thread-1", name: "Alpha", updatedAt: 20 })],
      },
    });
    await vi.runAllTimersAsync();

    expect(setTrayRecentThreadsMock).toHaveBeenCalledTimes(2);
    expect(setTrayRecentThreadsMock).toHaveBeenLastCalledWith([
      {
        workspaceId: "ws-1",
        workspaceLabel: "Workspace One",
        threadId: "thread-1",
        threadLabel: "Alpha",
        updatedAt: 20,
      },
    ]);
  });

  it("retries the same payload after a tray sync failure", async () => {
    setTrayRecentThreadsMock
      .mockRejectedValueOnce(new Error("tray bridge not ready"))
      .mockResolvedValueOnce(undefined);

    renderHook(() =>
      useTrayRecentThreads({
        workspaces: [makeWorkspace()],
        threadsByWorkspace: {
          "ws-1": [makeThread({ id: "thread-1", name: "Alpha", updatedAt: 10 })],
        },
        isSubagentThread: () => false,
      }),
    );

    await vi.advanceTimersByTimeAsync(150);
    expect(setTrayRecentThreadsMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(150);
    expect(setTrayRecentThreadsMock).toHaveBeenCalledTimes(2);
    expect(setTrayRecentThreadsMock).toHaveBeenNthCalledWith(1, [
      {
        workspaceId: "ws-1",
        workspaceLabel: "Workspace One",
        threadId: "thread-1",
        threadLabel: "Alpha",
        updatedAt: 10,
      },
    ]);
    expect(setTrayRecentThreadsMock).toHaveBeenNthCalledWith(2, [
      {
        workspaceId: "ws-1",
        workspaceLabel: "Workspace One",
        threadId: "thread-1",
        threadLabel: "Alpha",
        updatedAt: 10,
      },
    ]);
  });

  it("does not queue a duplicate sync while the same payload is still in flight", async () => {
    let resolveSync: (() => void) | null = null;
    setTrayRecentThreadsMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSync = resolve;
        }),
    );

    const { rerender } = renderHook(
      ({
        threadsByWorkspace,
      }: {
        threadsByWorkspace: Record<string, ThreadSummary[]>;
      }) =>
        useTrayRecentThreads({
          workspaces: [makeWorkspace()],
          threadsByWorkspace,
          isSubagentThread: () => false,
        }),
      {
        initialProps: {
          threadsByWorkspace: {
            "ws-1": [makeThread({ id: "thread-1", name: "Alpha", updatedAt: 10 })],
          },
        },
      },
    );

    await vi.advanceTimersByTimeAsync(150);
    expect(setTrayRecentThreadsMock).toHaveBeenCalledTimes(1);

    rerender({
      threadsByWorkspace: {
        "ws-1": [makeThread({ id: "thread-1", name: "Alpha", updatedAt: 10 })],
      },
    });
    await vi.advanceTimersByTimeAsync(150);

    expect(setTrayRecentThreadsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSync?.();
      await Promise.resolve();
    });

    rerender({
      threadsByWorkspace: {
        "ws-1": [makeThread({ id: "thread-1", name: "Alpha", updatedAt: 10 })],
      },
    });
    await vi.runAllTimersAsync();

    expect(setTrayRecentThreadsMock).toHaveBeenCalledTimes(1);
  });

  it("skips tray syncing outside the Tauri runtime", async () => {
    isTauriMock.mockReturnValue(false);

    renderHook(() =>
      useTrayRecentThreads({
        workspaces: [makeWorkspace()],
        threadsByWorkspace: {
          "ws-1": [makeThread({ id: "thread-1", name: "Alpha", updatedAt: 10 })],
        },
        isSubagentThread: () => false,
      }),
    );

    await vi.runAllTimersAsync();
    expect(setTrayRecentThreadsMock).not.toHaveBeenCalled();
  });
});
