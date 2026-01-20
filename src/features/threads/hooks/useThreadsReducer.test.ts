import { describe, expect, it, vi } from "vitest";
import type { ConversationItem, ThreadSummary } from "../../../types";
import { initialState, threadReducer } from "./useThreadsReducer";
import type { ThreadState } from "./useThreadsReducer";

describe("threadReducer", () => {
  it("ensures thread with default name and active selection", () => {
    const next = threadReducer(initialState, {
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    const threads = next.threadsByWorkspace["ws-1"] ?? [];
    expect(threads).toHaveLength(1);
    expect(threads[0].name).toBe("Agent 1");
    expect(next.activeThreadIdByWorkspace["ws-1"]).toBe("thread-1");
    expect(next.threadStatusById["thread-1"]?.isProcessing).toBe(false);
  });

  it("renames auto-generated thread on first user message", () => {
    const threads: ThreadSummary[] = [
      { id: "thread-1", name: "Agent 1", updatedAt: 1 },
    ];
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1234);
    const next = threadReducer(
      {
        ...initialState,
        threadsByWorkspace: { "ws-1": threads },
      },
      {
        type: "addUserMessage",
        workspaceId: "ws-1",
        threadId: "thread-1",
        text: "Hello there",
        hasCustomName: false,
      },
    );
    nowSpy.mockRestore();
    expect(next.threadsByWorkspace["ws-1"]?.[0]?.name).toBe("Hello there");
    const items = next.itemsByThread["thread-1"] ?? [];
    expect(items).toHaveLength(1);
    if (items[0]?.kind === "message") {
      expect(items[0].id).toBe("1234-user");
      expect(items[0].text).toBe("Hello there");
    }
  });

  it("renames auto-generated thread from assistant output when no user message", () => {
    const threads: ThreadSummary[] = [
      { id: "thread-1", name: "Agent 1", updatedAt: 1 },
    ];
    const next = threadReducer(
      {
        ...initialState,
        threadsByWorkspace: { "ws-1": threads },
        itemsByThread: { "thread-1": [] },
      },
      {
        type: "appendAgentDelta",
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "assistant-1",
        delta: "Assistant note",
        hasCustomName: false,
      },
    );
    expect(next.threadsByWorkspace["ws-1"]?.[0]?.name).toBe("Assistant note");
  });

  it("tracks processing durations", () => {
    const started = threadReducer(
      {
        ...initialState,
        threadStatusById: {
          "thread-1": {
            isProcessing: false,
            hasUnread: false,
            isReviewing: false,
            processingStartedAt: null,
            lastDurationMs: null,
          },
        },
      },
      {
        type: "markProcessing",
        threadId: "thread-1",
        isProcessing: true,
        timestamp: 1000,
      },
    );
    const stopped = threadReducer(started, {
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: false,
      timestamp: 1600,
    });
    expect(stopped.threadStatusById["thread-1"]?.lastDurationMs).toBe(600);
  });

  it("drops local review-start items when server review starts", () => {
    const localReview: ConversationItem = {
      id: "review-start-1",
      kind: "review",
      state: "started",
      text: "",
    };
    const incomingReview: ConversationItem = {
      id: "remote-review-1",
      kind: "review",
      state: "started",
      text: "",
    };
    const next = threadReducer(
      {
        ...initialState,
        itemsByThread: { "thread-1": [localReview] },
      },
      {
        type: "upsertItem",
        threadId: "thread-1",
        item: incomingReview,
      },
    );
    const items = next.itemsByThread["thread-1"] ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("remote-review-1");
  });

  it("appends reasoning summary and content when missing", () => {
    const withSummary = threadReducer(initialState, {
      type: "appendReasoningSummary",
      threadId: "thread-1",
      itemId: "reasoning-1",
      delta: "Short plan",
    });
    const summaryItem = withSummary.itemsByThread["thread-1"]?.[0];
    expect(summaryItem?.kind).toBe("reasoning");
    if (summaryItem?.kind === "reasoning") {
      expect(summaryItem.summary).toBe("Short plan");
      expect(summaryItem.content).toBe("");
    }

    const withContent = threadReducer(withSummary, {
      type: "appendReasoningContent",
      threadId: "thread-1",
      itemId: "reasoning-1",
      delta: "More detail",
    });
    const contentItem = withContent.itemsByThread["thread-1"]?.[0];
    expect(contentItem?.kind).toBe("reasoning");
    if (contentItem?.kind === "reasoning") {
      expect(contentItem.summary).toBe("Short plan");
      expect(contentItem.content).toBe("More detail");
    }
  });

  it("ignores tool output deltas when the item is not a tool", () => {
    const message: ConversationItem = {
      id: "tool-1",
      kind: "message",
      role: "assistant",
      text: "Hi",
    };
    const base: ThreadState = {
      ...initialState,
      itemsByThread: { "thread-1": [message] },
    };
    const next = threadReducer(base, {
      type: "appendToolOutput",
      threadId: "thread-1",
      itemId: "tool-1",
      delta: "delta",
    });
    expect(next).toBe(base);
  });
});
