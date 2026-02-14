// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ThreadSummary } from "../../../types";
import { useThreadRows } from "./useThreadRows";

describe("useThreadRows", () => {
  it("reuses cached results for identical inputs and cache version", () => {
    const threads: ThreadSummary[] = [
      { id: "thread-a", name: "A", updatedAt: 1 },
      { id: "thread-b", name: "B", updatedAt: 2 },
      { id: "thread-c", name: "C", updatedAt: 3 },
    ];
    const getPinTimestamp = vi.fn((workspaceId: string, threadId: string) => {
      if (workspaceId === "ws-1" && threadId === "thread-a") {
        return 100;
      }
      return null;
    });
    const { result } = renderHook(() => useThreadRows({}));

    const first = result.current.getThreadRows(
      threads,
      true,
      "ws-1",
      getPinTimestamp,
      7,
    );
    const second = result.current.getThreadRows(
      threads,
      true,
      "ws-1",
      getPinTimestamp,
      7,
    );

    expect(second).toBe(first);
    expect(getPinTimestamp).toHaveBeenCalledTimes(3);

    const third = result.current.getThreadRows(
      threads,
      true,
      "ws-1",
      getPinTimestamp,
      8,
    );
    expect(third).not.toBe(first);
    expect(getPinTimestamp).toHaveBeenCalledTimes(6);

    const thirdRepeat = result.current.getThreadRows(
      threads,
      true,
      "ws-1",
      getPinTimestamp,
      8,
    );
    expect(thirdRepeat).toBe(third);
    expect(getPinTimestamp).toHaveBeenCalledTimes(6);
  });

  it("does not retain stale pin-version cache entries", () => {
    const threads: ThreadSummary[] = [
      { id: "thread-a", name: "A", updatedAt: 1 },
      { id: "thread-b", name: "B", updatedAt: 2 },
      { id: "thread-c", name: "C", updatedAt: 3 },
    ];
    const getPinTimestamp = vi.fn((workspaceId: string, threadId: string) => {
      if (workspaceId === "ws-1" && threadId === "thread-a") {
        return 100;
      }
      return null;
    });
    const { result } = renderHook(() => useThreadRows({}));

    result.current.getThreadRows(threads, true, "ws-1", getPinTimestamp, 1);
    result.current.getThreadRows(threads, true, "ws-1", getPinTimestamp, 2);
    result.current.getThreadRows(threads, true, "ws-1", getPinTimestamp, 3);
    expect(getPinTimestamp).toHaveBeenCalledTimes(9);

    // Reusing the latest version should be cached.
    result.current.getThreadRows(threads, true, "ws-1", getPinTimestamp, 3);
    expect(getPinTimestamp).toHaveBeenCalledTimes(9);

    // Returning to an older version recomputes, proving stale versions are not retained.
    result.current.getThreadRows(threads, true, "ws-1", getPinTimestamp, 1);
    expect(getPinTimestamp).toHaveBeenCalledTimes(12);
  });

  it("drops cached rows when thread parent relationships change", () => {
    const threads: ThreadSummary[] = [
      { id: "thread-root", name: "Root", updatedAt: 1 },
      { id: "thread-child", name: "Child", updatedAt: 2 },
    ];
    const getPinTimestamp = vi.fn(() => null);
    const { result, rerender } = renderHook(
      ({ threadParentById }: { threadParentById: Record<string, string> }) =>
        useThreadRows(threadParentById),
      {
        initialProps: { threadParentById: {} },
      },
    );

    const beforeParenting = result.current.getThreadRows(
      threads,
      true,
      "ws-1",
      getPinTimestamp,
      0,
    );
    rerender({
      threadParentById: { "thread-child": "thread-root" },
    });
    const afterParenting = result.current.getThreadRows(
      threads,
      true,
      "ws-1",
      getPinTimestamp,
      0,
    );

    expect(afterParenting).not.toBe(beforeParenting);
    expect(afterParenting.unpinnedRows.map((row) => [row.thread.id, row.depth])).toEqual([
      ["thread-root", 0],
      ["thread-child", 1],
    ]);
  });
});
