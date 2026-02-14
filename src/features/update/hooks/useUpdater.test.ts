// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { DebugEntry } from "../../../types";
import { useUpdater } from "./useUpdater";
import { STORAGE_KEY_PENDING_POST_UPDATE_VERSION } from "../utils/postUpdateRelease";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

const checkMock = vi.mocked(check);
const relaunchMock = vi.mocked(relaunch);
const fetchMock = vi.fn();

describe("useUpdater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sets error state when update check fails", async () => {
    checkMock.mockRejectedValue(new Error("nope"));
    const onDebug = vi.fn();
    const { result } = renderHook(() => useUpdater({ onDebug }));

    await act(async () => {
      await result.current.startUpdate();
    });

    expect(result.current.state.stage).toBe("error");
    expect(result.current.state.error).toBe("nope");
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        timestamp: expect.any(Number),
        label: "updater/error",
        source: "error",
        payload: "nope",
      } satisfies Partial<DebugEntry>),
    );
  });

  it("returns to idle when no update is available", async () => {
    checkMock.mockResolvedValue(null);
    const { result } = renderHook(() => useUpdater({}));

    await act(async () => {
      await result.current.startUpdate();
    });

    expect(result.current.state.stage).toBe("idle");
  });

  it("announces when no update is available for manual checks", async () => {
    vi.useFakeTimers();
    checkMock.mockResolvedValue(null);
    const { result } = renderHook(() => useUpdater({}));

    await act(async () => {
      await result.current.checkForUpdates({ announceNoUpdate: true });
    });

    expect(result.current.state.stage).toBe("latest");

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.state.stage).toBe("idle");
  });

  it("downloads and restarts when update is available", async () => {
    const close = vi.fn();
    const downloadAndInstall = vi.fn(async (onEvent) => {
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 40 } });
      onEvent({ event: "Progress", data: { chunkLength: 60 } });
      onEvent({ event: "Finished", data: {} });
    });
    checkMock.mockResolvedValue({
      version: "1.2.3",
      downloadAndInstall,
      close,
    } as any);

    const { result } = renderHook(() => useUpdater({}));

    await act(async () => {
      await result.current.startUpdate();
    });

    expect(result.current.state.stage).toBe("available");
    expect(result.current.state.version).toBe("1.2.3");

    await act(async () => {
      await result.current.startUpdate();
    });

    await waitFor(() => expect(result.current.state.stage).toBe("restarting"));
    expect(result.current.state.progress?.totalBytes).toBe(100);
    expect(result.current.state.progress?.downloadedBytes).toBe(100);
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(relaunchMock).toHaveBeenCalledTimes(1);
    expect(
      window.localStorage.getItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION),
    ).toBe("1.2.3");
  });

  it("resets to idle and closes update on dismiss", async () => {
    const close = vi.fn();
    checkMock.mockResolvedValue({
      version: "1.0.0",
      downloadAndInstall: vi.fn(),
      close,
    } as any);
    const { result } = renderHook(() => useUpdater({}));

    await act(async () => {
      await result.current.startUpdate();
    });

    await act(async () => {
      await result.current.dismiss();
    });

    expect(result.current.state.stage).toBe("idle");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("surfaces download errors and keeps progress", async () => {
    const close = vi.fn();
    const downloadAndInstall = vi.fn(async (onEvent) => {
      onEvent({ event: "Started", data: { contentLength: 50 } });
      onEvent({ event: "Progress", data: { chunkLength: 20 } });
      throw new Error("download failed");
    });
    checkMock.mockResolvedValue({
      version: "2.0.0",
      downloadAndInstall,
      close,
    } as any);
    const onDebug = vi.fn();
    const { result } = renderHook(() => useUpdater({ onDebug }));

    await act(async () => {
      await result.current.startUpdate();
    });

    await act(async () => {
      await result.current.startUpdate();
    });

    await waitFor(() => expect(result.current.state.stage).toBe("error"));
    expect(result.current.state.error).toBe("download failed");
    expect(result.current.state.progress?.downloadedBytes).toBe(20);
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        timestamp: expect.any(Number),
        label: "updater/error",
        source: "error",
        payload: "download failed",
      } satisfies Partial<DebugEntry>),
    );
  });

  it("does not run updater workflow when disabled", async () => {
    checkMock.mockResolvedValue({
      version: "9.9.9",
      downloadAndInstall: vi.fn(),
      close: vi.fn(),
    } as any);
    const { result } = renderHook(() => useUpdater({ enabled: false }));

    await act(async () => {
      await result.current.checkForUpdates({ announceNoUpdate: true });
      await result.current.startUpdate();
    });

    expect(checkMock).not.toHaveBeenCalled();
    expect(result.current.state.stage).toBe("idle");
  });

  it("loads post-update release notes after restart when marker matches current version", async () => {
    window.localStorage.setItem(
      STORAGE_KEY_PENDING_POST_UPDATE_VERSION,
      __APP_VERSION__,
    );
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: `v${__APP_VERSION__}`,
        html_url: `https://github.com/Dimillian/CodexMonitor/releases/tag/v${__APP_VERSION__}`,
        body: "## New\n- Added updater notes",
      }),
    } as Response);

    const { result } = renderHook(() => useUpdater({}));

    await waitFor(() =>
      expect(result.current.postUpdateNotice?.stage).toBe("ready"),
    );

    expect(result.current.postUpdateNotice).toMatchObject({
      stage: "ready",
      version: __APP_VERSION__,
      htmlUrl: `https://github.com/Dimillian/CodexMonitor/releases/tag/v${__APP_VERSION__}`,
      body: "## New\n- Added updater notes",
    });

    await act(async () => {
      result.current.dismissPostUpdateNotice();
    });
    expect(result.current.postUpdateNotice).toBeNull();
    expect(
      window.localStorage.getItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION),
    ).toBeNull();
  });

  it("shows post-update fallback when release notes fetch fails", async () => {
    window.localStorage.setItem(
      STORAGE_KEY_PENDING_POST_UPDATE_VERSION,
      __APP_VERSION__,
    );
    fetchMock.mockRejectedValue(new Error("offline"));
    const onDebug = vi.fn();
    const { result } = renderHook(() => useUpdater({ onDebug }));

    await waitFor(() =>
      expect(result.current.postUpdateNotice?.stage).toBe("fallback"),
    );

    expect(result.current.postUpdateNotice).toMatchObject({
      stage: "fallback",
      version: __APP_VERSION__,
      htmlUrl: `https://github.com/Dimillian/CodexMonitor/releases/tag/v${__APP_VERSION__}`,
    });
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "updater/release-notes-error",
        source: "error",
      }),
    );
  });

  it("clears stale post-update marker when version does not match current app", async () => {
    window.localStorage.setItem(
      STORAGE_KEY_PENDING_POST_UPDATE_VERSION,
      "0.0.1",
    );

    const { result } = renderHook(() => useUpdater({}));

    await waitFor(() =>
      expect(
        window.localStorage.getItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION),
      ).toBeNull(),
    );
    expect(result.current.postUpdateNotice).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
