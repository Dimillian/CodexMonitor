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
const pushErrorToastMock = vi.fn();
vi.mock("../../../services/toasts", () => ({
  pushErrorToast: (...args: unknown[]) => pushErrorToastMock(...args),
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
  pushErrorToastMock.mockReset();
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

  it("shows a user-facing toast for unsupported app-server methods", async () => {
    const { root } = await mount({});
    expect(listener).toBeTypeOf("function");

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "turn/newUnknownMethod",
          params: { foo: "bar" },
        },
      });
    });

    expect(pushErrorToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "协议事件不兼容",
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("passes through unknown codex/event notifications without incompatibility toast", async () => {
    const handlers: Handlers = {
      onAppServerEvent: vi.fn(),
    };
    const { root } = await mount(handlers);
    expect(listener).toBeTypeOf("function");

    act(() => {
      listener?.({
        workspace_id: "ws-compat-passthrough",
        message: {
          method: "codex/event/mcp_startup_update",
          params: { status: "warming_up", completed: 2, total: 5 },
        },
      });
    });

    expect(handlers.onAppServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-compat-passthrough",
        message: expect.objectContaining({
          method: "codex/event/mcp_startup_update",
        }),
      }),
    );
    expect(pushErrorToastMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("routes legacy codex/event aliases without incompatibility toast", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
      onItemStarted: vi.fn(),
      onReasoningSummaryBoundary: vi.fn(),
      onThreadTokenUsageUpdated: vi.fn(),
    };
    const { root } = await mount(handlers);
    expect(listener).toBeTypeOf("function");

    act(() => {
      listener?.({
        workspace_id: "ws-legacy",
        message: {
          method: "codex/event/agent_message_content_delta",
          params: {
            thread_id: "thread-legacy",
            item_id: "item-legacy",
            content_delta: "hello",
          },
        },
      });
    });
    await waitFor(() => {
      expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
        workspaceId: "ws-legacy",
        threadId: "thread-legacy",
        itemId: "item-legacy",
        delta: "hello",
        turnId: null,
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-legacy",
        message: {
          method: "codex/event/item_started",
          params: {
            payload: {
              thread_id: "thread-legacy",
              item: { id: "item-start", type: "commandExecution" },
            },
          },
        },
      });
    });
    expect(handlers.onItemStarted).toHaveBeenCalledWith(
      "ws-legacy",
      "thread-legacy",
      expect.objectContaining({ id: "item-start" }),
    );

    act(() => {
      listener?.({
        workspace_id: "ws-legacy",
        message: {
          method: "codex/event/agent_reasoning_section_break",
          params: {
            thread_id: "thread-legacy",
            item_id: "reason-1",
          },
        },
      });
    });
    expect(handlers.onReasoningSummaryBoundary).toHaveBeenCalledWith(
      "ws-legacy",
      "thread-legacy",
      "reason-1",
    );

    act(() => {
      listener?.({
        workspace_id: "ws-legacy",
        message: {
          method: "codex/event/token_count",
          params: {
            thread_id: "thread-legacy",
            turn_id: "turn-legacy",
            info: {
              total_token_usage: {
                input_tokens: 3,
                cached_input_tokens: 0,
                output_tokens: 2,
              },
            },
          },
        },
      });
    });
    expect(handlers.onThreadTokenUsageUpdated).toHaveBeenCalledWith(
      "ws-legacy",
      "thread-legacy",
      {
        turnId: "turn-legacy",
        tokenUsage: {
          input_tokens: 3,
          cached_input_tokens: 0,
          output_tokens: 2,
        },
      },
    );
    expect(pushErrorToastMock).not.toHaveBeenCalled();

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

  it("routes detailed turn/account/item events and guards empty payload branches", async () => {
    const handlers: Handlers = {
      onAppServerEvent: vi.fn(),
      onIsAlive: vi.fn(),
      onTurnStarted: vi.fn(),
      onTurnCompleted: vi.fn(),
      onTurnError: vi.fn(),
      onTurnPlanUpdated: vi.fn(),
      onTurnDiffUpdated: vi.fn(),
      onThreadTokenUsageUpdated: vi.fn(),
      onAccountRateLimitsUpdated: vi.fn(),
      onAccountUpdated: vi.fn(),
      onAccountLoginCompleted: vi.fn(),
      onReasoningTextDelta: vi.fn(),
      onCommandOutputDelta: vi.fn(),
      onTerminalInteraction: vi.fn(),
      onFileChangeOutputDelta: vi.fn(),
      onItemStarted: vi.fn(),
      onItemCompleted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-2",
        message: {},
      });
    });
    expect(handlers.onAppServerEvent).toHaveBeenCalledTimes(1);
    expect(handlers.onIsAlive).not.toHaveBeenCalled();

    act(() => {
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "turn/started",
          params: {
            turn: {
              id: "turn-2",
              thread_id: "thread-2",
              model_slug: "gpt-5-codex",
            },
          },
        },
      });
    });
    expect(handlers.onIsAlive).toHaveBeenCalledWith("ws-2");
    expect(handlers.onTurnStarted).toHaveBeenCalledWith(
      "ws-2",
      "thread-2",
      "turn-2",
      { model: "gpt-5-codex" },
    );

    act(() => {
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "error",
          params: {
            thread_id: "thread-2",
            turn_id: "turn-2",
            error: { message: "boom" },
            will_retry: true,
          },
        },
      });
    });
    expect(handlers.onTurnError).toHaveBeenCalledWith(
      "ws-2",
      "thread-2",
      "turn-2",
      { message: "boom", willRetry: true },
    );

    act(() => {
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "turn/plan/updated",
          params: {
            thread_id: "thread-2",
            turn_id: "turn-2",
            explanation: "updated",
            plan: [{ step: "a" }],
          },
        },
      });
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "turn/diff/updated",
          params: {
            threadId: "thread-2",
            diff: "",
          },
        },
      });
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "turn/diff/updated",
          params: {
            threadId: "thread-2",
            diff: "diff-content",
          },
        },
      });
    });
    expect(handlers.onTurnPlanUpdated).toHaveBeenCalledWith(
      "ws-2",
      "thread-2",
      "turn-2",
      { explanation: "updated", plan: [{ step: "a" }] },
    );
    expect(handlers.onTurnDiffUpdated).toHaveBeenCalledTimes(1);
    expect(handlers.onTurnDiffUpdated).toHaveBeenCalledWith(
      "ws-2",
      "thread-2",
      "diff-content",
    );

    act(() => {
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "thread/tokenUsage/updated",
          params: {
            thread_id: "thread-2",
            turn: { id: "turn-2" },
            token_usage: null,
          },
        },
      });
    });
    expect(handlers.onThreadTokenUsageUpdated).toHaveBeenCalledWith(
      "ws-2",
      "thread-2",
      { turnId: "turn-2", tokenUsage: null },
    );

    act(() => {
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "account/rateLimits/updated",
          params: {
            rate_limits: { hourly: { used: 1 } },
          },
        },
      });
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "account/updated",
          params: {
            auth_mode: "   ",
          },
        },
      });
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "account/login/completed",
          params: {
            login_id: " ",
            success: false,
            error: "   ",
          },
        },
      });
    });
    expect(handlers.onAccountRateLimitsUpdated).toHaveBeenCalledWith("ws-2", {
      hourly: { used: 1 },
    });
    expect(handlers.onAccountUpdated).toHaveBeenCalledWith("ws-2", null);
    expect(handlers.onAccountLoginCompleted).toHaveBeenCalledWith("ws-2", {
      loginId: null,
      success: false,
      error: null,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "item/started",
          params: {
            threadId: "thread-2",
            item: { id: "cmd-2", type: "commandExecution" },
          },
        },
      });
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "item/reasoning/textDelta",
          params: {
            threadId: "thread-2",
            itemId: "reason-2",
            delta: "thinking...",
          },
        },
      });
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "item/commandExecution/outputDelta",
          params: {
            thread_id: "thread-2",
            item_id: "cmd-2",
            delta: "stdout",
          },
        },
      });
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "item/commandExecution/terminalInteraction",
          params: {
            thread_id: "thread-2",
            item_id: "cmd-2",
            stdin: "y\n",
          },
        },
      });
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "item/fileChange/outputDelta",
          params: {
            threadId: "thread-2",
            itemId: "patch-2",
            delta: "applied",
          },
        },
      });
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-2",
            itemId: "cmd-2",
            item: { id: "cmd-2", type: "commandExecution" },
          },
        },
      });
      listener?.({
        workspace_id: "ws-2",
        message: {
          method: "turn/completed",
          params: {
            threadId: "thread-2",
            turnId: "turn-2",
          },
        },
      });
    });
    expect(handlers.onReasoningTextDelta).toHaveBeenCalledWith(
      "ws-2",
      "thread-2",
      "reason-2",
      "thinking...",
    );
    expect(handlers.onCommandOutputDelta).toHaveBeenCalledWith(
      "ws-2",
      "thread-2",
      "cmd-2",
      "stdout",
    );
    expect(handlers.onTerminalInteraction).toHaveBeenCalledWith(
      "ws-2",
      "thread-2",
      "cmd-2",
      "y\n",
    );
    expect(handlers.onFileChangeOutputDelta).toHaveBeenCalledWith(
      "ws-2",
      "thread-2",
      "patch-2",
      "applied",
    );
    expect(handlers.onItemStarted).toHaveBeenCalledWith("ws-2", "thread-2", {
      id: "cmd-2",
      type: "commandExecution",
    });
    expect(handlers.onItemCompleted).toHaveBeenCalledWith("ws-2", "thread-2", {
      id: "cmd-2",
      type: "commandExecution",
    });
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith("ws-2", "thread-2", "turn-2");

    await act(async () => {
      root.unmount();
    });
  });

  it("throttles unsupported-method toasts and re-emits after the window", async () => {
    vi.useFakeTimers();
    const { root } = await mount({});

    act(() => {
      listener?.({
        workspace_id: "ws-throttle",
        message: { method: "turn/unsupportedOne", params: {} },
      });
      listener?.({
        workspace_id: "ws-throttle",
        message: { method: "turn/unsupportedTwo", params: {} },
      });
    });
    expect(pushErrorToastMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30_001);
    });

    act(() => {
      listener?.({
        workspace_id: "ws-throttle",
        message: { method: "turn/unsupportedThree", params: {} },
      });
    });
    expect(pushErrorToastMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
    vi.useRealTimers();
  });

  it("forces fallback completion after max wait even if pending items never finish", async () => {
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
        workspace_id: "ws-maxwait",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-maxwait",
            turnId: "turn-maxwait",
            item: { type: "agentMessage", id: "msg-maxwait", text: "Done" },
          },
        },
      });
      listener?.({
        workspace_id: "ws-maxwait",
        message: {
          method: "item/started",
          params: {
            threadId: "thread-maxwait",
            item: { type: "commandExecution", id: "cmd-stuck" },
          },
        },
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(91_000);
    });

    expect(handlers.onTurnCompleted).toHaveBeenCalledWith(
      "ws-maxwait",
      "thread-maxwait",
      "turn-maxwait",
    );
    expect(handlers.onAppServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-maxwait",
        message: {
          method: "codex/turnCompletionFallback",
          params: expect.objectContaining({
            maxWaitReached: true,
            pendingItems: 1,
          }),
        },
      }),
    );

    await act(async () => {
      root.unmount();
    });
    vi.useRealTimers();
  });

  it("extracts nested agent-message text chunks across all supported shapes", async () => {
    const handlers: Handlers = {
      onAgentMessageCompleted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-text",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-text",
            turnId: "turn-text",
            item: {
              id: "item-text",
              type: "agentMessage",
              content: [
                "A",
                { text: ["B", { value: "C" }] },
                { content: ["D", { content: [{ text: "E" }] }] },
                { content: "F" },
                { value: "G" },
                { text: [{ text: "H" }] },
                123,
              ],
            },
          },
        },
      });
    });

    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledWith({
      workspaceId: "ws-text",
      threadId: "thread-text",
      itemId: "item-text",
      text: "ABCDEFGH",
      turnId: "turn-text",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("covers edge payload branches for text extraction, summary deltas, and thread-name normalization", async () => {
    const handlers: Handlers = {
      onThreadNameUpdated: vi.fn(),
      onAgentMessageCompleted: vi.fn(),
      onReasoningSummaryDelta: vi.fn(),
      onReasoningSummaryBoundary: vi.fn(),
      onReasoningTextDelta: vi.fn(),
      onPlanDelta: vi.fn(),
      onCommandOutputDelta: vi.fn(),
      onTerminalInteraction: vi.fn(),
      onFileChangeOutputDelta: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "thread/name/updated",
          params: { threadId: "thread-edges", threadName: "   " },
        },
      });
    });
    expect(handlers.onThreadNameUpdated).toHaveBeenCalledWith("ws-edges", {
      threadId: "thread-edges",
      threadName: null,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-edges",
            item: { id: "item-non-agent", type: { unexpected: true } },
          },
        },
      });
    });
    expect(handlers.onAgentMessageCompleted).not.toHaveBeenCalled();

    act(() => {
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-edges",
            turnId: "turn-content-string",
            item: { id: "item-content-string", type: "agentMessage", content: "plain-content" },
          },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-edges",
            turnId: "turn-content-empty",
            item: {
              id: "item-content-empty",
              type: "agentMessage",
              content: [{ unknown: true }],
            },
          },
        },
      });
    });
    expect(handlers.onAgentMessageCompleted).toHaveBeenNthCalledWith(1, {
      workspaceId: "ws-edges",
      threadId: "thread-edges",
      itemId: "item-content-string",
      text: "plain-content",
      turnId: "turn-content-string",
    });
    expect(handlers.onAgentMessageCompleted).toHaveBeenNthCalledWith(2, {
      workspaceId: "ws-edges",
      threadId: "thread-edges",
      itemId: "item-content-empty",
      text: "",
      turnId: "turn-content-empty",
    });

    act(() => {
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/reasoning/summaryTextDelta",
          params: { threadId: "thread-edges", itemId: "reason-1", delta: "" },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/reasoning/summaryTextDelta",
          params: { threadId: "thread-edges", itemId: "reason-1", delta: "summary+" },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/reasoning/summaryPartAdded",
          params: { threadId: "thread-edges" },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/reasoning/summaryPartAdded",
          params: { threadId: "thread-edges", itemId: "reason-1" },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/reasoning/textDelta",
          params: { threadId: "thread-edges", itemId: "reason-1", delta: "" },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/reasoning/textDelta",
          params: { threadId: "thread-edges", itemId: "reason-1", delta: "think+" },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/plan/delta",
          params: { threadId: "thread-edges", itemId: "plan-1", delta: "" },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/plan/delta",
          params: { threadId: "thread-edges", itemId: "plan-1", delta: "plan+" },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/commandExecution/outputDelta",
          params: { threadId: "thread-edges", itemId: "cmd-1", delta: "" },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/commandExecution/outputDelta",
          params: { threadId: "thread-edges", itemId: "cmd-1", delta: "stdout+" },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/commandExecution/terminalInteraction",
          params: { threadId: "thread-edges", stdin: "ignored" },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/commandExecution/terminalInteraction",
          params: { threadId: "thread-edges", itemId: "cmd-1", stdin: "accept\n" },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/fileChange/outputDelta",
          params: { threadId: "thread-edges", itemId: "patch-1", delta: "" },
        },
      });
      listener?.({
        workspace_id: "ws-edges",
        message: {
          method: "item/fileChange/outputDelta",
          params: { threadId: "thread-edges", itemId: "patch-1", delta: "patch+" },
        },
      });
    });

    expect(handlers.onReasoningSummaryDelta).toHaveBeenCalledTimes(1);
    expect(handlers.onReasoningSummaryDelta).toHaveBeenCalledWith(
      "ws-edges",
      "thread-edges",
      "reason-1",
      "summary+",
    );
    expect(handlers.onReasoningSummaryBoundary).toHaveBeenCalledTimes(1);
    expect(handlers.onReasoningSummaryBoundary).toHaveBeenCalledWith(
      "ws-edges",
      "thread-edges",
      "reason-1",
    );
    expect(handlers.onReasoningTextDelta).toHaveBeenCalledTimes(1);
    expect(handlers.onReasoningTextDelta).toHaveBeenCalledWith(
      "ws-edges",
      "thread-edges",
      "reason-1",
      "think+",
    );
    expect(handlers.onPlanDelta).toHaveBeenCalledTimes(1);
    expect(handlers.onPlanDelta).toHaveBeenCalledWith(
      "ws-edges",
      "thread-edges",
      "plan-1",
      "plan+",
    );
    expect(handlers.onCommandOutputDelta).toHaveBeenCalledTimes(1);
    expect(handlers.onCommandOutputDelta).toHaveBeenCalledWith(
      "ws-edges",
      "thread-edges",
      "cmd-1",
      "stdout+",
    );
    expect(handlers.onTerminalInteraction).toHaveBeenCalledTimes(1);
    expect(handlers.onTerminalInteraction).toHaveBeenCalledWith(
      "ws-edges",
      "thread-edges",
      "cmd-1",
      "accept\n",
    );
    expect(handlers.onFileChangeOutputDelta).toHaveBeenCalledTimes(1);
    expect(handlers.onFileChangeOutputDelta).toHaveBeenCalledWith(
      "ws-edges",
      "thread-edges",
      "patch-1",
      "patch+",
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("clears fallback timers and pending items by thread/workspace without cross-thread bleed", async () => {
    vi.useFakeTimers();
    const onWorkspaceDisconnected = vi.fn();
    const onTurnCompleted = vi.fn();
    const onAppServerEvent = vi.fn();
    const onItemStarted = vi.fn();
    const onItemCompleted = vi.fn();
    const onAgentMessageCompleted = vi.fn();
    const handlers: Handlers = {
      onWorkspaceDisconnected,
      onTurnCompleted,
      onAppServerEvent,
      onItemStarted,
      onItemCompleted,
      onAgentMessageCompleted,
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-a",
        message: {
          method: "item/started",
          params: { threadId: "thread-a", item: { id: "cmd-a-1", type: "commandExecution" } },
        },
      });
      listener?.({
        workspace_id: "ws-a",
        message: {
          method: "item/started",
          params: { threadId: "thread-a", item: { id: "cmd-a-2", type: "commandExecution" } },
        },
      });
      listener?.({
        workspace_id: "ws-a",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-a",
            turnId: "turn-a",
            item: { id: "msg-a", type: "agentMessage", text: "A" },
          },
        },
      });
      listener?.({
        workspace_id: "ws-a",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-z",
            turnId: "turn-z",
            item: { id: "msg-z", type: "agentMessage", text: "Z" },
          },
        },
      });
      listener?.({
        workspace_id: "ws-b",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-b",
            turnId: "turn-b",
            item: { id: "msg-b", type: "agentMessage", text: "B" },
          },
        },
      });
      // Re-schedule on same key to cover existing-timer replacement.
      listener?.({
        workspace_id: "ws-b",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-b",
            turnId: "turn-b",
            item: { id: "msg-b-2", type: "agentMessage", text: "B2" },
          },
        },
      });
      listener?.({
        workspace_id: "ws-b",
        message: {
          method: "item/started",
          params: { threadId: "thread-b", item: { id: "cmd-b", type: "commandExecution" } },
        },
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-a",
        message: {
          method: "turn/completed",
          params: { threadId: "thread-a", turnId: "turn-a" },
        },
      });
      listener?.({
        workspace_id: "ws-a",
        message: { method: "codex/disconnected" },
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(91_000);
    });

    expect(onWorkspaceDisconnected).toHaveBeenCalledWith("ws-a");
    const completionCalls = onTurnCompleted.mock.calls;
    expect(
      completionCalls.some(
        (call) => call[0] === "ws-a" && call[1] === "thread-z" && call[2] === "turn-z",
      ),
    ).toBe(false);
    expect(
      completionCalls.some(
        (call) => call[0] === "ws-b" && call[1] === "thread-b" && call[2] === "turn-b",
      ),
    ).toBe(true);

    await act(async () => {
      root.unmount();
    });
    vi.useRealTimers();
  });

  it("ignores malformed guarded payloads without triggering handlers", async () => {
    const handlers: Handlers = {
      onApprovalRequest: vi.fn(),
      onAgentMessageDelta: vi.fn(),
      onItemStarted: vi.fn(),
      onItemCompleted: vi.fn(),
      onThreadTokenUsageUpdated: vi.fn(),
      onAccountRateLimitsUpdated: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-guard",
        message: {
          method: "workspace/requestApproval",
          params: { mode: "full" },
        },
      });
      listener?.({
        workspace_id: "ws-guard",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "thread-guard", itemId: "item-guard" },
        },
      });
      listener?.({
        workspace_id: "ws-guard",
        message: {
          method: "item/started",
          params: { threadId: "thread-guard" },
        },
      });
      listener?.({
        workspace_id: "ws-guard",
        message: {
          method: "item/completed",
          params: { threadId: "thread-guard" },
        },
      });
      listener?.({
        workspace_id: "ws-guard",
        message: {
          method: "thread/tokenUsage/updated",
          params: { threadId: "thread-guard", turnId: "turn-guard" },
        },
      });
      listener?.({
        workspace_id: "ws-guard",
        message: {
          method: "account/rateLimits/updated",
          params: {},
        },
      });
    });

    expect(handlers.onApprovalRequest).not.toHaveBeenCalled();
    expect(handlers.onAgentMessageDelta).not.toHaveBeenCalled();
    expect(handlers.onItemStarted).not.toHaveBeenCalled();
    expect(handlers.onItemCompleted).not.toHaveBeenCalled();
    expect(handlers.onThreadTokenUsageUpdated).not.toHaveBeenCalled();
    expect(handlers.onAccountRateLimitsUpdated).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
