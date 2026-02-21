// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceRefreshOnFocus } from "./useWorkspaceRefreshOnFocus";

describe("useWorkspaceRefreshOnFocus", () => {
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    vi.useFakeTimers();
    visibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes workspaces and connected threads on focus", async () => {
    const refreshWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "ws-1",
        name: "Workspace",
        path: "/tmp/ws-1",
        connected: true,
        settings: { sidebarCollapsed: false },
      },
    ]);
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useWorkspaceRefreshOnFocus({
        workspaces: [],
        refreshWorkspaces,
        listThreadsForWorkspace,
      }),
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(refreshWorkspaces).toHaveBeenCalledTimes(1);
    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(1);
    expect(listThreadsForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ws-1" }),
      { preserveState: true },
    );
  });

  it("polls automatically in remote mode", async () => {
    const refreshWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "ws-1",
        name: "Workspace",
        path: "/tmp/ws-1",
        connected: true,
        settings: { sidebarCollapsed: false },
      },
    ]);
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useWorkspaceRefreshOnFocus({
        workspaces: [],
        refreshWorkspaces,
        listThreadsForWorkspace,
        backendMode: "remote",
        pollIntervalMs: 2000,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(1999);
      await Promise.resolve();
    });
    expect(refreshWorkspaces).toHaveBeenCalledTimes(0);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(refreshWorkspaces).toHaveBeenCalledTimes(1);
    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(1);
  });

  it("does not poll when backend mode is local", async () => {
    const refreshWorkspaces = vi.fn().mockResolvedValue([]);
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useWorkspaceRefreshOnFocus({
        workspaces: [],
        refreshWorkspaces,
        listThreadsForWorkspace,
        backendMode: "local",
        pollIntervalMs: 1000,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });

    expect(refreshWorkspaces).toHaveBeenCalledTimes(0);
    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(0);
  });

  it("starts polling when backend mode changes from local to remote", async () => {
    const refreshWorkspaces = vi.fn().mockResolvedValue([]);
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);

    const { rerender } = renderHook(
      (props: { backendMode: string }) =>
        useWorkspaceRefreshOnFocus({
          workspaces: [],
          refreshWorkspaces,
          listThreadsForWorkspace,
          backendMode: props.backendMode,
          pollIntervalMs: 1000,
        }),
      {
        initialProps: { backendMode: "local" },
      },
    );

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    expect(refreshWorkspaces).toHaveBeenCalledTimes(0);

    rerender({ backendMode: "remote" });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(refreshWorkspaces).toHaveBeenCalledTimes(1);
  });

  it("stops polling while hidden and resumes when visible again", async () => {
    const refreshWorkspaces = vi.fn().mockResolvedValue([]);
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useWorkspaceRefreshOnFocus({
        workspaces: [],
        refreshWorkspaces,
        listThreadsForWorkspace,
        backendMode: "remote",
        pollIntervalMs: 1000,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(refreshWorkspaces).toHaveBeenCalledTimes(1);

    await act(async () => {
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    expect(refreshWorkspaces).toHaveBeenCalledTimes(1);

    await act(async () => {
      visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(refreshWorkspaces).toHaveBeenCalledTimes(2);
  });
});
