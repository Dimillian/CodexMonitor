// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { DebugEntry } from "../../../types";
import { useUpdater } from "./useUpdater";

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

describe("useUpdater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
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
});
