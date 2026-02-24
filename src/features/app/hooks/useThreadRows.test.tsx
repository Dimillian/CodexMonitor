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

  it("skips descendants when a thread is collapsed", () => {
    const threads: ThreadSummary[] = [
      { id: "thread-root", name: "Root", updatedAt: 3 },
      { id: "thread-child-a", name: "Child A", updatedAt: 2 },
      { id: "thread-child-b", name: "Child B", updatedAt: 1 },
    ];
    const getPinTimestamp = vi.fn(() => null);
    const { result } = renderHook(() =>
      useThreadRows({
        "thread-child-a": "thread-root",
        "thread-child-b": "thread-child-a",
      }),
    );

    const expanded = result.current.getThreadRows(
      threads,
      true,
      "ws-1",
      getPinTimestamp,
      0,
      0,
      () => false,
    );
    expect(expanded.unpinnedRows.map((row) => [row.thread.id, row.depth])).toEqual([
      ["thread-root", 0],
      ["thread-child-a", 1],
      ["thread-child-b", 2],
    ]);

    const collapsedRoot = result.current.getThreadRows(
      threads,
      true,
      "ws-1",
      getPinTimestamp,
      0,
      1,
      (_workspaceId, threadId) => threadId === "thread-root",
    );
    expect(collapsedRoot.unpinnedRows.map((row) => [row.thread.id, row.depth])).toEqual([
      ["thread-root", 0],
    ]);
    expect(collapsedRoot.unpinnedRows[0]).toMatchObject({
      hasChildren: true,
      isCollapsed: true,
    });

    const collapsedChild = result.current.getThreadRows(
      threads,
      true,
      "ws-1",
      getPinTimestamp,
      0,
      2,
      (_workspaceId, threadId) => threadId === "thread-child-a",
    );
    expect(collapsedChild.unpinnedRows.map((row) => [row.thread.id, row.depth])).toEqual([
      ["thread-root", 0],
      ["thread-child-a", 1],
    ]);
    expect(collapsedChild.unpinnedRows[1]).toMatchObject({
      hasChildren: true,
      isCollapsed: true,
    });
  });
});
