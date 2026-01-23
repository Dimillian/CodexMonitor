// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import { useThreadSelectors } from "./useThreadSelectors";

const messageItem: ConversationItem = {
  id: "item-1",
  kind: "message",
  role: "user",
  text: "Hello",
};

describe("useThreadSelectors", () => {
  it("returns active thread id and items for the active workspace", () => {
    const { result } = renderHook(() =>
      useThreadSelectors({
        activeWorkspaceId: "workspace-1",
        activeThreadIdByWorkspace: { "workspace-1": "thread-1" },
        itemsByThread: { "thread-1": [messageItem] },
      }),
    );

    expect(result.current.activeThreadId).toBe("thread-1");
    expect(result.current.activeItems).toEqual([messageItem]);
  });

  it("returns null and empty items when there is no active workspace", () => {
    const { result } = renderHook(() =>
      useThreadSelectors({
        activeWorkspaceId: null,
        activeThreadIdByWorkspace: { "workspace-1": "thread-1" },
        itemsByThread: { "thread-1": [messageItem] },
      }),
    );

    expect(result.current.activeThreadId).toBeNull();
    expect(result.current.activeItems).toEqual([]);
  });

  it("returns empty items when the active thread has no entries", () => {
    const { result } = renderHook(() =>
      useThreadSelectors({
        activeWorkspaceId: "workspace-1",
        activeThreadIdByWorkspace: { "workspace-1": "thread-2" },
        itemsByThread: {},
      }),
    );

    expect(result.current.activeThreadId).toBe("thread-2");
    expect(result.current.activeItems).toEqual([]);
  });
});
