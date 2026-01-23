// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORAGE_KEY_CUSTOM_NAMES,
  STORAGE_KEY_PINNED_THREADS,
  loadCustomNames,
  loadPinnedThreads,
  loadThreadActivity,
  savePinnedThreads,
  saveThreadActivity,
} from "../utils/threadStorage";
import { useThreadStorage } from "./useThreadStorage";

vi.mock("../utils/threadStorage", () => ({
  MAX_PINS_SOFT_LIMIT: 2,
  STORAGE_KEY_CUSTOM_NAMES: "custom-names",
  STORAGE_KEY_PINNED_THREADS: "pinned-threads",
  loadCustomNames: vi.fn(),
  loadPinnedThreads: vi.fn(),
  loadThreadActivity: vi.fn(),
  makeCustomNameKey: (workspaceId: string, threadId: string) =>
    `${workspaceId}:${threadId}`,
  makePinKey: (workspaceId: string, threadId: string) =>
    `${workspaceId}:${threadId}`,
  savePinnedThreads: vi.fn(),
  saveThreadActivity: vi.fn(),
}));

describe("useThreadStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads initial data and updates custom names on storage events", async () => {
    vi.mocked(loadThreadActivity).mockReturnValue({
      "ws-1": { "thread-1": 101 },
    });
    vi.mocked(loadPinnedThreads).mockReturnValue({ "ws-1:thread-1": 202 });
    vi
      .mocked(loadCustomNames)
      .mockReturnValueOnce({ "ws-1:thread-1": "Custom" })
      .mockReturnValueOnce({ "ws-1:thread-1": "Updated" });

    const { result } = renderHook(() => useThreadStorage());

    expect(result.current.threadActivityRef.current).toEqual({
      "ws-1": { "thread-1": 101 },
    });
    expect(result.current.pinnedThreadsRef.current).toEqual({
      "ws-1:thread-1": 202,
    });

    await waitFor(() => {
      expect(result.current.getCustomName("ws-1", "thread-1")).toBe("Custom");
    });

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY_CUSTOM_NAMES }),
      );
    });

    await waitFor(() => {
      expect(result.current.getCustomName("ws-1", "thread-1")).toBe("Updated");
    });
  });

  it("records thread activity and persists updates", () => {
    vi.mocked(loadThreadActivity).mockReturnValue({});
    vi.mocked(loadPinnedThreads).mockReturnValue({});
    vi.mocked(loadCustomNames).mockReturnValue({});

    const { result } = renderHook(() => useThreadStorage());

    act(() => {
      result.current.recordThreadActivity("ws-2", "thread-9", 999);
    });

    expect(result.current.threadActivityRef.current).toEqual({
      "ws-2": { "thread-9": 999 },
    });
    expect(saveThreadActivity).toHaveBeenCalledWith({
      "ws-2": { "thread-9": 999 },
    });
  });

  it("pins and unpins threads while updating persistence", () => {
    vi.mocked(loadThreadActivity).mockReturnValue({});
    vi.mocked(loadPinnedThreads).mockReturnValue({});
    vi.mocked(loadCustomNames).mockReturnValue({});

    const { result } = renderHook(() => useThreadStorage());

    let pinResult = false;
    act(() => {
      pinResult = result.current.pinThread("ws-1", "thread-1");
    });

    expect(pinResult).toBe(true);
    expect(result.current.isThreadPinned("ws-1", "thread-1")).toBe(true);
    expect(savePinnedThreads).toHaveBeenCalledWith({
      "ws-1:thread-1": expect.any(Number),
    });

    const versionAfterPin = result.current.pinnedThreadsVersion;

    act(() => {
      result.current.unpinThread("ws-1", "thread-1");
    });

    expect(result.current.isThreadPinned("ws-1", "thread-1")).toBe(false);
    expect(savePinnedThreads).toHaveBeenCalledWith({});
    expect(result.current.pinnedThreadsVersion).toBe(versionAfterPin + 1);
  });

  it("ignores duplicate pins and reacts to pinned storage changes", async () => {
    vi.mocked(loadThreadActivity).mockReturnValue({});
    vi.mocked(loadPinnedThreads).mockReturnValue({ "ws-1:thread-1": 123 });
    vi.mocked(loadCustomNames).mockReturnValue({});

    const { result } = renderHook(() => useThreadStorage());

    let pinResult = true;
    act(() => {
      pinResult = result.current.pinThread("ws-1", "thread-1");
    });

    expect(pinResult).toBe(false);
    expect(savePinnedThreads).not.toHaveBeenCalled();

    const versionBefore = result.current.pinnedThreadsVersion;

    vi.mocked(loadPinnedThreads).mockReturnValue({ "ws-1:thread-2": 456 });
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY_PINNED_THREADS }),
      );
    });

    await waitFor(() => {
      expect(result.current.pinnedThreadsVersion).toBe(versionBefore + 1);
    });
    expect(result.current.isThreadPinned("ws-1", "thread-2")).toBe(true);
  });
});
