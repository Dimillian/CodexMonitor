// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServerEvent } from "../../../types";
import { subscribeAppServerEvents } from "../../../services/events";
import { useAppServerEvents } from "./useAppServerEvents";

vi.mock("../../../services/events", () => ({
  subscribeAppServerEvents: vi.fn(),
}));

type Handlers = Parameters<typeof useAppServerEvents>[0];

function TestHarness({ handlers }: { handlers: Handlers }) {
  useAppServerEvents(handlers);
  return null;
}

let listener: ((event: AppServerEvent) => void) | null = null;
const unlisten = vi.fn();

beforeEach(() => {
  listener = null;
  unlisten.mockReset();
  vi.mocked(subscribeAppServerEvents).mockImplementation((cb) => {
    listener = cb;
    return unlisten;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function mount(handlers: Handlers) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(<TestHarness handlers={handlers} />);
  });
  return { root };
}

describe("useAppServerEvents", () => {
  it("keeps a single subscription across rerenders and uses latest handlers", async () => {
    const firstOnDelta = vi.fn();
    const firstHandlers: Handlers = {
      onAgentMessageDelta: firstOnDelta,
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<TestHarness handlers={firstHandlers} />);
    });

    expect(listener).toBeTypeOf("function");
    expect(subscribeAppServerEvents).toHaveBeenCalledTimes(1);

    const secondOnDelta = vi.fn();
    const secondHandlers: Handlers = {
      onAgentMessageDelta: secondOnDelta,
    };

    await act(async () => {
      root.render(<TestHarness handlers={secondHandlers} />);
    });

    expect(subscribeAppServerEvents).toHaveBeenCalledTimes(1);
    expect(unlisten).not.toHaveBeenCalled();

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "thread-1", itemId: "item-1", delta: "Hello" },
        },
      });
    });

    expect(firstOnDelta).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(secondOnDelta).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "item-1",
        delta: "Hello",
        turnId: null,
      });
    });

    await act(async () => {
      root.unmount();
    });
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("routes app-server events to handlers", async () => {
    const handlers: Handlers = {
      onAppServerEvent: vi.fn(),
      onWorkspaceConnected: vi.fn(),
      onThreadStarted: vi.fn(),
      onThreadNameUpdated: vi.fn(),
      onBackgroundThreadAction: vi.fn(),
      onAgentMessageDelta: vi.fn(),
      onReasoningSummaryBoundary: vi.fn(),
      onPlanDelta: vi.fn(),
      onApprovalRequest: vi.fn(),
      onRequestUserInput: vi.fn(),
      onItemCompleted: vi.fn(),
      onAgentMessageCompleted: vi.fn(),
      onAccountUpdated: vi.fn(),
      onAccountLoginCompleted: vi.fn(),
    };
    const { root } = await mount(handlers);

    expect(listener).toBeTypeOf("function");

    act(() => {
      listener?.({ workspace_id: "ws-1", message: { method: "codex/connected" } });
    });
    expect(handlers.onWorkspaceConnected).toHaveBeenCalledWith("ws-1");

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "thread-1", itemId: "item-1", delta: "Hello" },
        },
      });
    });
    await waitFor(() => {
      expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "item-1",
        delta: "Hello",
        turnId: null,
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/reasoning/summaryPartAdded",
          params: { threadId: "thread-1", itemId: "reasoning-1", summaryIndex: 1 },
        },
      });
    });
    expect(handlers.onReasoningSummaryBoundary).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "reasoning-1",
    );

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/plan/delta",
          params: { threadId: "thread-1", itemId: "plan-1", delta: "- Step 1" },
        },
      });
    });
    expect(handlers.onPlanDelta).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "plan-1",
      "- Step 1",
    );

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "thread/started",
          params: { thread: { id: "thread-2", preview: "New thread" } },
        },
      });
    });
    expect(handlers.onThreadStarted).toHaveBeenCalledWith("ws-1", {
      id: "thread-2",
      preview: "New thread",
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "thread/name/updated",
          params: { threadId: "thread-2", threadName: "Renamed from server" },
        },
      });
    });
    expect(handlers.onThreadNameUpdated).toHaveBeenCalledWith("ws-1", {
      threadId: "thread-2",
      threadName: "Renamed from server",
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "codex/backgroundThread",
          params: { threadId: "thread-2", action: "hide" },
        },
      });
    });
    expect(handlers.onBackgroundThreadAction).toHaveBeenCalledWith(
      "ws-1",
      "thread-2",
      "hide",
    );

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "workspace/requestApproval",
          id: 7,
          params: { mode: "full" },
        },
      });
    });
    expect(handlers.onApprovalRequest).toHaveBeenCalledWith({
      workspace_id: "ws-1",
      request_id: 7,
      method: "workspace/requestApproval",
      params: { mode: "full" },
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/tool/requestUserInput",
          id: 11,
          params: {
            thread_id: "thread-1",
            turn_id: "turn-1",
            item_id: "call-1",
            questions: [
              {
                id: "confirm_path",
                header: "Confirm",
                question: "Proceed?",
                options: [
                  { label: "Yes", description: "Continue." },
                  { label: "No", description: "Stop." },
                ],
              },
            ],
          },
        },
      });
    });
    expect(handlers.onRequestUserInput).toHaveBeenCalledWith({
      workspace_id: "ws-1",
      request_id: 11,
      params: {
        thread_id: "thread-1",
        turn_id: "turn-1",
        item_id: "call-1",
        questions: [
          {
            id: "confirm_path",
            header: "Confirm",
            question: "Proceed?",
            isOther: false,
            options: [
              { label: "Yes", description: "Continue." },
              { label: "No", description: "Stop." },
            ],
          },
        ],
      },
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            item: { type: "agentMessage", id: "item-2", text: "Done" },
          },
        },
      });
    });
    expect(handlers.onItemCompleted).toHaveBeenCalledWith("ws-1", "thread-1", {
      type: "agentMessage",
      id: "item-2",
      text: "Done",
    });
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId: "item-2",
      text: "Done",
      turnId: null,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "account/updated",
          params: { authMode: "chatgpt" },
        },
      });
    });
    expect(handlers.onAccountUpdated).toHaveBeenCalledWith("ws-1", "chatgpt");

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "account/login/completed",
          params: { loginId: "login-1", success: true, error: null },
        },
      });
    });
    expect(handlers.onAccountLoginCompleted).toHaveBeenCalledWith("ws-1", {
      loginId: "login-1",
      success: true,
      error: null,
    });

    await act(async () => {
      root.unmount();
    });
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("recognizes compatible snake_case method aliases and item types", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
      onAgentMessageCompleted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-compat",
        message: {
          method: "item/agent_message/delta",
          params: { thread_id: "thread-1", item_id: "item-1", text_delta: "Hi" },
        },
      });
    });

    await waitFor(() => {
      expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
        workspaceId: "ws-compat",
        threadId: "thread-1",
        itemId: "item-1",
        delta: "Hi",
        turnId: null,
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-compat",
        message: {
          method: "item/completed",
          params: {
            thread_id: "thread-1",
            item: {
              type: "agent_message",
              id: "item-2",
              content: [
                { type: "output_text", text: "Hello " },
                { type: "output_text", text: "compat" },
              ],
            },
          },
        },
      });
    });

    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledWith({
      workspaceId: "ws-compat",
      threadId: "thread-1",
      itemId: "item-2",
      text: "Hello compat",
      turnId: null,
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("normalizes request user input questions and options", async () => {
    const handlers: Handlers = {
      onRequestUserInput: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-9",
        message: {
          method: "item/tool/requestUserInput",
          id: 55,
          params: {
            threadId: "thread-9",
            turnId: "turn-9",
            itemId: "item-9",
            questions: [
              {
                id: "",
                header: "",
                question: "",
                options: [
                  { label: "", description: "" },
                  { label: "  ", description: " " },
                ],
              },
              {
                id: "q-1",
                header: "",
                question: "Choose",
                options: [
                  { label: "", description: "" },
                  { label: "Yes", description: "" },
                  { label: "", description: "No label" },
                ],
              },
            ],
          },
        },
      });
    });

    expect(handlers.onRequestUserInput).toHaveBeenCalledWith({
      workspace_id: "ws-9",
      request_id: 55,
      params: {
        thread_id: "thread-9",
        turn_id: "turn-9",
        item_id: "item-9",
        questions: [
          {
            id: "q-1",
            header: "",
            question: "Choose",
            isOther: false,
            options: [
              { label: "Yes", description: "" },
              { label: "", description: "No label" },
            ],
          },
        ],
      },
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("coalesces consecutive agent deltas for the same message", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "thread-1", itemId: "item-1", delta: "Hel" },
        },
      });
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "thread-1", itemId: "item-1", delta: "lo " },
        },
      });
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "thread-1", itemId: "item-1", delta: "World" },
        },
      });
    });

    await waitFor(() => {
      expect(handlers.onAgentMessageDelta).toHaveBeenCalledTimes(1);
      expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "item-1",
        delta: "Hello World",
        turnId: null,
      });
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("ignores delta events missing required ids", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "", itemId: "item-1", delta: "Hello" },
        },
      });
    });
    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "thread-1", itemId: "", delta: "Hello" },
        },
      });
    });
    expect(handlers.onAgentMessageDelta).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("flushes pending agent deltas when workspace disconnects", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
      onWorkspaceDisconnected: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "thread-1", itemId: "item-1", delta: "pending" },
        },
      });
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "codex/disconnected",
        },
      });
    });

    expect(handlers.onWorkspaceDisconnected).toHaveBeenCalledWith("ws-1");
    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId: "item-1",
      delta: "pending",
      turnId: null,
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("falls back to degraded turn completion when turn/completed is missing", async () => {
    vi.useFakeTimers();
    const handlers: Handlers = {
      onTurnCompleted: vi.fn(),
      onAppServerEvent: vi.fn(),
      onItemCompleted: vi.fn(),
      onAgentMessageCompleted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: { type: "agentMessage", id: "item-1", text: "Done" },
          },
        },
      });
    });
    expect(handlers.onTurnCompleted).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    expect(handlers.onTurnCompleted).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "turn-1",
    );
    expect(handlers.onAppServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-1",
        message: {
          method: "codex/turnCompletionFallback",
          params: expect.objectContaining({
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "item-1",
            timeoutMs: 15_000,
          }),
        },
      }),
    );

    await act(async () => {
      root.unmount();
    });
    vi.useRealTimers();
  });

  it("does not fallback while there are pending items", async () => {
    vi.useFakeTimers();
    const handlers: Handlers = {
      onTurnCompleted: vi.fn(),
      onAppServerEvent: vi.fn(),
      onItemStarted: vi.fn(),
      onItemCompleted: vi.fn(),
      onAgentMessageCompleted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: { type: "agentMessage", id: "msg-1", text: "Done" },
          },
        },
      });
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/started",
          params: {
            threadId: "thread-1",
            item: { type: "commandExecution", id: "cmd-1" },
          },
        },
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(handlers.onTurnCompleted).not.toHaveBeenCalled();

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            item: { type: "commandExecution", id: "cmd-1" },
          },
        },
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "turn-1",
    );

    await act(async () => {
      root.unmount();
    });
    vi.useRealTimers();
  });

  it("waits for a quiet window before fallback completion", async () => {
    vi.useFakeTimers();
    const handlers: Handlers = {
      onTurnCompleted: vi.fn(),
      onAppServerEvent: vi.fn(),
      onPlanDelta: vi.fn(),
      onItemCompleted: vi.fn(),
      onAgentMessageCompleted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: { type: "agentMessage", id: "msg-1", text: "Done" },
          },
        },
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(14_900);
    });
    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/plan/delta",
          params: { threadId: "thread-1", itemId: "plan-1", delta: "- step" },
        },
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(handlers.onTurnCompleted).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "turn-1",
    );

    await act(async () => {
      root.unmount();
    });
    vi.useRealTimers();
  });
});
