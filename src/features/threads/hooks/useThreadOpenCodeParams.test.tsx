// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEY_THREAD_OPENCODE_PARAMS } from "@threads/utils/threadStorage";
import { useThreadOpenCodeParams } from "./useThreadOpenCodeParams";

describe("useThreadOpenCodeParams", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("patches and retrieves thread-scoped Codex params", () => {
    const { result } = renderHook(() => useThreadOpenCodeParams());

    act(() => {
      result.current.patchThreadOpenCodeParams("ws-1", "thread-1", {
        modelId: "gpt-5.1",
        effort: "high",
        serviceTier: "fast",
        accessMode: "full-access",
        collaborationModeId: "plan",
        opencodeArgsOverride: "--profile dev",
      });
    });

    expect(result.current.getThreadOpenCodeParams("ws-1", "thread-1")).toEqual(
      expect.objectContaining({
        modelId: "gpt-5.1",
        effort: "high",
        serviceTier: "fast",
        accessMode: "full-access",
        collaborationModeId: "plan",
        opencodeArgsOverride: "--profile dev",
      }),
    );

    const persisted = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY_THREAD_OPENCODE_PARAMS) ?? "{}",
    ) as Record<string, unknown>;
    expect(persisted["ws-1:thread-1"]).toBeTruthy();
  });

  it("sanitizes malformed persisted entries", () => {
    window.localStorage.setItem(
      STORAGE_KEY_THREAD_OPENCODE_PARAMS,
      JSON.stringify({
        "ws-1:thread-1": {
          modelId: "gpt-4.1",
          effort: "medium",
          serviceTier: "nope",
          accessMode: "nope",
          collaborationModeId: 99,
          opencodeArgsOverride: 12,
          updatedAt: "never",
        },
      }),
    );

    const { result } = renderHook(() => useThreadOpenCodeParams());

    expect(result.current.getThreadOpenCodeParams("ws-1", "thread-1")).toEqual({
      modelId: "gpt-4.1",
      effort: "medium",
      serviceTier: null,
      accessMode: null,
      collaborationModeId: null,
      opencodeArgsOverride: null,
      updatedAt: 0,
    });
  });

  it("preserves missing opencodeArgsOverride for legacy persisted entries", () => {
    window.localStorage.setItem(
      STORAGE_KEY_THREAD_OPENCODE_PARAMS,
      JSON.stringify({
        "ws-1:thread-legacy": {
          modelId: "gpt-4.1",
          effort: "medium",
          accessMode: "current",
          collaborationModeId: "default",
          updatedAt: 123,
        },
      }),
    );

    const { result } = renderHook(() => useThreadOpenCodeParams());
    const legacy = result.current.getThreadOpenCodeParams("ws-1", "thread-legacy");
    expect(legacy).toEqual(
      expect.objectContaining({
        modelId: "gpt-4.1",
        effort: "medium",
        accessMode: "current",
        collaborationModeId: "default",
        updatedAt: 123,
      }),
    );
    expect(legacy?.serviceTier).toBeUndefined();
    expect(legacy?.opencodeArgsOverride).toBeUndefined();
  });

  it("syncs from storage events", async () => {
    const { result } = renderHook(() => useThreadOpenCodeParams());

    window.localStorage.setItem(
      STORAGE_KEY_THREAD_OPENCODE_PARAMS,
      JSON.stringify({
        "ws-1:thread-2": {
          modelId: "gpt-5",
          effort: "low",
          serviceTier: "fast",
          accessMode: "current",
          collaborationModeId: "default",
          opencodeArgsOverride: "--profile ws",
          updatedAt: 1,
        },
      }),
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY_THREAD_OPENCODE_PARAMS }),
      );
    });

    await waitFor(() => {
      expect(result.current.version).toBe(1);
    });

    expect(result.current.getThreadOpenCodeParams("ws-1", "thread-2")).toEqual({
      modelId: "gpt-5",
      effort: "low",
      serviceTier: "fast",
      accessMode: "current",
      collaborationModeId: "default",
      opencodeArgsOverride: "--profile ws",
      updatedAt: 1,
    });
  });

  it("deletes per-thread overrides", () => {
    const { result } = renderHook(() => useThreadOpenCodeParams());

    act(() => {
      result.current.patchThreadOpenCodeParams("ws-1", "thread-3", {
        modelId: "gpt-5",
      });
    });
    expect(result.current.getThreadOpenCodeParams("ws-1", "thread-3")).not.toBeNull();

    act(() => {
      result.current.deleteThreadOpenCodeParams("ws-1", "thread-3");
    });

    expect(result.current.getThreadOpenCodeParams("ws-1", "thread-3")).toBeNull();
  });

  it("keeps explicit undefined opencodeArgsOverride as inherit in memory", () => {
    const { result } = renderHook(() => useThreadOpenCodeParams());

    act(() => {
      result.current.patchThreadOpenCodeParams("ws-1", "thread-4", {
        modelId: "gpt-5",
        opencodeArgsOverride: undefined,
      });
    });

    expect(result.current.getThreadOpenCodeParams("ws-1", "thread-4")).toEqual(
      expect.objectContaining({
        modelId: "gpt-5",
      }),
    );
    expect(
      result.current.getThreadOpenCodeParams("ws-1", "thread-4")?.opencodeArgsOverride,
    ).toBeUndefined();
  });
});
