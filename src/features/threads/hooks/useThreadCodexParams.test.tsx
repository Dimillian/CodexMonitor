// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEY_THREAD_CODEX_PARAMS } from "../utils/threadStorage";
import { useThreadCodexParams } from "./useThreadCodexParams";

describe("useThreadCodexParams", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("patches and retrieves thread-scoped Codex params", () => {
    const { result } = renderHook(() => useThreadCodexParams());

    act(() => {
      result.current.patchThreadCodexParams("ws-1", "thread-1", {
        modelId: "gpt-5.1",
        effort: "high",
        accessMode: "full-access",
        collaborationModeId: "plan",
      });
    });

    expect(result.current.getThreadCodexParams("ws-1", "thread-1")).toEqual(
      expect.objectContaining({
        modelId: "gpt-5.1",
        effort: "high",
        accessMode: "full-access",
        collaborationModeId: "plan",
      }),
    );

    const persisted = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY_THREAD_CODEX_PARAMS) ?? "{}",
    ) as Record<string, unknown>;
    expect(persisted["ws-1:thread-1"]).toBeTruthy();
  });

  it("sanitizes malformed persisted entries", () => {
    window.localStorage.setItem(
      STORAGE_KEY_THREAD_CODEX_PARAMS,
      JSON.stringify({
        "ws-1:thread-1": {
          modelId: "gpt-4.1",
          effort: "medium",
          accessMode: "nope",
          collaborationModeId: 99,
          updatedAt: "never",
        },
      }),
    );

    const { result } = renderHook(() => useThreadCodexParams());

    expect(result.current.getThreadCodexParams("ws-1", "thread-1")).toEqual({
      modelId: "gpt-4.1",
      effort: "medium",
      accessMode: null,
      collaborationModeId: null,
      updatedAt: 0,
    });
  });

  it("syncs from storage events", async () => {
    const { result } = renderHook(() => useThreadCodexParams());

    window.localStorage.setItem(
      STORAGE_KEY_THREAD_CODEX_PARAMS,
      JSON.stringify({
        "ws-1:thread-2": {
          modelId: "gpt-5",
          effort: "low",
          accessMode: "current",
          collaborationModeId: "default",
          updatedAt: 1,
        },
      }),
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY_THREAD_CODEX_PARAMS }),
      );
    });

    await waitFor(() => {
      expect(result.current.version).toBe(1);
    });

    expect(result.current.getThreadCodexParams("ws-1", "thread-2")).toEqual({
      modelId: "gpt-5",
      effort: "low",
      accessMode: "current",
      collaborationModeId: "default",
      updatedAt: 1,
    });
  });

  it("deletes per-thread overrides", () => {
    const { result } = renderHook(() => useThreadCodexParams());

    act(() => {
      result.current.patchThreadCodexParams("ws-1", "thread-3", {
        modelId: "gpt-5",
      });
    });
    expect(result.current.getThreadCodexParams("ws-1", "thread-3")).not.toBeNull();

    act(() => {
      result.current.deleteThreadCodexParams("ws-1", "thread-3");
    });

    expect(result.current.getThreadCodexParams("ws-1", "thread-3")).toBeNull();
  });
});
