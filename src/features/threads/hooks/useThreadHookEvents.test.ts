// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "@/types";
import { useThreadHookEvents } from "./useThreadHookEvents";

type SetupOptions = {
  existingItems?: Record<string, ConversationItem[]>;
};

function setup(options: SetupOptions = {}) {
  const itemsByThread = options.existingItems ?? {};
  const dispatch = vi.fn();
  const safeMessageActivity = vi.fn();
  const { result } = renderHook(() =>
    useThreadHookEvents({
      dispatch,
      getItemsForThread: (threadId) => itemsByThread[threadId] ?? [],
      safeMessageActivity,
    }),
  );

  return {
    result,
    dispatch,
    safeMessageActivity,
  };
}

describe("useThreadHookEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a running hook row when started has a status message", () => {
    const { result, dispatch, safeMessageActivity } = setup();

    act(() => {
      result.current.onHookStarted("ws-1", "thread-1", "turn-1", {
        id: "hook-1",
        eventName: "session-start",
        handlerType: "command",
        executionMode: "sync",
        scope: "thread",
        sourcePath: "/tmp/session-start.sh",
        statusMessage: "Preparing context",
      });
    });

    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "thread-1",
      item: {
        id: "hook-hook-1",
        kind: "tool",
        toolType: "hook",
        title: "Hook: session-start",
        detail: "command • sync • thread • session-start.sh • Preparing context",
        status: "running",
        output: "",
        durationMs: null,
      },
      hasCustomName: false,
    });
    expect(safeMessageActivity).toHaveBeenCalledTimes(1);
  });

  it("ignores started events without a status message", () => {
    const { result, dispatch, safeMessageActivity } = setup();

    act(() => {
      result.current.onHookStarted("ws-1", "thread-1", null, {
        id: "hook-1",
        eventName: "session-start",
      });
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(safeMessageActivity).not.toHaveBeenCalled();
  });

  it("creates a completed hook row when entries are present", () => {
    const { result, dispatch } = setup();

    act(() => {
      result.current.onHookCompleted("ws-1", "thread-1", null, {
        id: "hook-1",
        eventName: "stop",
        handlerType: "agent",
        executionMode: "async",
        scope: "turn",
        sourcePath: "/tmp/stop.md",
        status: "completed",
        entries: [{ kind: "feedback", text: "Captured summary" }],
        durationMs: 1250,
      });
    });

    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "thread-1",
      item: {
        id: "hook-hook-1",
        kind: "tool",
        toolType: "hook",
        title: "Hook: stop",
        detail: "agent • async • turn • stop.md",
        status: "completed",
        output: "[feedback] Captured summary",
        durationMs: 1250,
      },
      hasCustomName: false,
    });
  });

  it("creates a completed hook row when the hook failed without entries", () => {
    const { result, dispatch } = setup();

    act(() => {
      result.current.onHookCompleted("ws-1", "thread-1", null, {
        id: "hook-1",
        eventName: "stop",
        status: "failed",
      });
    });

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "thread-1",
      item: {
        id: "hook-hook-1",
        kind: "tool",
        toolType: "hook",
        title: "Hook: stop",
        detail: "",
        status: "failed",
        output: "",
        durationMs: null,
      },
      hasCustomName: false,
    });
  });

  it("does not create a clean completed row when no visible started row exists", () => {
    const { result, dispatch } = setup();

    act(() => {
      result.current.onHookCompleted("ws-1", "thread-1", null, {
        id: "hook-1",
        eventName: "stop",
        status: "completed",
      });
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("updates an existing started row when a clean completion arrives", () => {
    const { result, dispatch } = setup({
      existingItems: {
        "thread-1": [
          {
            id: "hook-hook-1",
            kind: "tool",
            toolType: "hook",
            title: "Hook: session-start",
            detail: "command • sync • thread • session-start.sh • Preparing",
            status: "running",
            output: "",
            durationMs: null,
          },
        ],
      },
    });

    act(() => {
      result.current.onHookCompleted("ws-1", "thread-1", null, {
        id: "hook-1",
        eventName: "session-start",
        handlerType: "command",
        executionMode: "sync",
        scope: "thread",
        sourcePath: "/tmp/session-start.sh",
        status: "completed",
        durationMs: 3100,
      });
    });

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "thread-1",
      item: {
        id: "hook-hook-1",
        kind: "tool",
        toolType: "hook",
        title: "Hook: session-start",
        detail: "command • sync • thread • session-start.sh",
        status: "completed",
        output: "",
        durationMs: 3100,
      },
      hasCustomName: false,
    });
  });

  it("reuses the same synthetic item id across repeated completion events", () => {
    const { result, dispatch } = setup({
      existingItems: {
        "thread-1": [
          {
            id: "hook-hook-1",
            kind: "tool",
            toolType: "hook",
            title: "Hook: stop",
            detail: "agent • async • turn • stop.md",
            status: "failed",
            output: "[error] First failure",
            durationMs: null,
          },
        ],
      },
    });

    act(() => {
      result.current.onHookCompleted("ws-1", "thread-1", null, {
        id: "hook-1",
        eventName: "stop",
        handlerType: "agent",
        executionMode: "async",
        scope: "turn",
        sourcePath: "/tmp/stop.md",
        status: "failed",
        entries: [{ kind: "error", text: "Second failure" }],
      });
    });

    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "thread-1",
      item: expect.objectContaining({
        id: "hook-hook-1",
        output: "[error] Second failure",
      }),
      hasCustomName: false,
    });
  });
});
