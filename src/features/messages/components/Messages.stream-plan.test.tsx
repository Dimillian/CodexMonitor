// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";
import { Messages } from "./Messages";

const useFileLinkOpenerMock = vi.fn(
  (_workspacePath: string | null, _openTargets: unknown[], _selectedOpenAppId: string) => ({
    openFileLink: openFileLinkMock,
    showFileLinkMenu: showFileLinkMenuMock,
  }),
);
const openFileLinkMock = vi.fn();
const showFileLinkMenuMock = vi.fn();
const readWorkspaceFileMock = vi.hoisted(() => vi.fn());

vi.mock("../../../services/tauri", async () => {
  const actual = await vi.importActual<typeof import("../../../services/tauri")>(
    "../../../services/tauri",
  );
  return {
    ...actual,
    readWorkspaceFile: (workspaceId: string, path: string) =>
      readWorkspaceFileMock(workspaceId, path),
  };
});

vi.mock("../hooks/useFileLinkOpener", () => ({
  useFileLinkOpener: (
    workspacePath: string | null,
    openTargets: unknown[],
    selectedOpenAppId: string,
  ) => useFileLinkOpenerMock(workspacePath, openTargets, selectedOpenAppId),
}));

describe("Messages", () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
  });

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
    useFileLinkOpenerMock.mockClear();
    openFileLinkMock.mockReset();
    showFileLinkMenuMock.mockReset();
    readWorkspaceFileMock.mockReset();
    readWorkspaceFileMock.mockResolvedValue({
      content: "line-1\nline-2\nline-3\nline-4",
      truncated: false,
    });
  });

  it("keeps user scroll position when new items stream in the same thread", () => {
    const initialItems: ConversationItem[] = [
      {
        id: "msg-1",
        kind: "message",
        role: "assistant",
        text: "First reply",
      },
    ];

    const streamedItems: ConversationItem[] = [
      ...initialItems,
      {
        id: "msg-2",
        kind: "message",
        role: "assistant",
        text: "Second reply chunk",
      },
    ];

    const { container, rerender } = render(
      <Messages
        items={initialItems}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={true}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const messagesNode = container.querySelector(".messages.messages-full");
    expect(messagesNode).not.toBeNull();
    const scrollNode = messagesNode as HTMLDivElement;

    Object.defineProperty(scrollNode, "clientHeight", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(scrollNode, "scrollHeight", {
      configurable: true,
      value: 1000,
    });

    scrollNode.scrollTop = 220;
    fireEvent.scroll(scrollNode);

    Object.defineProperty(scrollNode, "scrollHeight", {
      configurable: true,
      value: 1300,
    });

    rerender(
      <Messages
        items={streamedItems}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={true}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(scrollNode.scrollTop).toBe(220);
  });

  it("persists tool row expand state per thread across thread switches", () => {
    const threadOneItems: ConversationItem[] = [
      {
        id: "tool-thread-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: echo thread-1",
        detail: "/repo",
        status: "completed",
        output: "thread-1 output",
      },
    ];
    const threadTwoItems: ConversationItem[] = [
      {
        id: "tool-thread-2",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: echo thread-2",
        detail: "/repo",
        status: "completed",
        output: "thread-2 output",
      },
    ];

    const { container, rerender } = render(
      <Messages
        items={threadOneItems}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".tool-inline-terminal")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "切换工具详情" }));
    expect(container.querySelector(".tool-inline-terminal")).not.toBeNull();
    expect(container.textContent ?? "").toContain("thread-1 output");

    rerender(
      <Messages
        items={threadTwoItems}
        threadId="thread-2"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.textContent ?? "").not.toContain("thread-1 output");

    rerender(
      <Messages
        items={threadOneItems}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".tool-inline-terminal")).not.toBeNull();
    expect(container.textContent ?? "").toContain("thread-1 output");

    fireEvent.click(screen.getByRole("button", { name: "切换工具详情" }));
    expect(container.querySelector(".tool-inline-terminal")).toBeNull();

    rerender(
      <Messages
        items={threadTwoItems}
        threadId="thread-2"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );
    rerender(
      <Messages
        items={threadOneItems}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".tool-inline-terminal")).toBeNull();
  });

  it("auto-triggers top-history callback once on scroll-to-top", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-top-1",
        kind: "message",
        role: "assistant",
        text: "Older content",
      },
      {
        id: "msg-top-2",
        kind: "message",
        role: "assistant",
        text: "Newer content",
      },
    ];

    const onReachTop = vi.fn(() => new Promise<void>(() => {}));

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
        onReachTop={onReachTop}
      />,
    );

    const messagesNode = container.querySelector(".messages.messages-full");
    expect(messagesNode).not.toBeNull();
    const scrollNode = messagesNode as HTMLDivElement;

    Object.defineProperty(scrollNode, "clientHeight", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(scrollNode, "scrollHeight", {
      configurable: true,
      value: 800,
    });

    scrollNode.scrollTop = 0;
    fireEvent.scroll(scrollNode);
    fireEvent.scroll(scrollNode);

    expect(onReachTop).toHaveBeenCalledTimes(1);
  });

  it("does not render explicit load-older button at the top", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-explicit-1",
        kind: "message",
        role: "assistant",
        text: "Latest content",
      },
    ];

    const onReachTop = vi.fn();

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
        onReachTop={onReachTop}
      />,
    );

    expect(screen.queryByRole("button", { name: "加载更早消息" })).toBeNull();
    expect(onReachTop).toHaveBeenCalledTimes(0);
  });

  it("applies assistant divider class by logical order, not DOM adjacency", () => {
    const items: ConversationItem[] = [
      {
        id: "assistant-first",
        kind: "message",
        role: "assistant",
        text: "First assistant",
      },
      {
        id: "assistant-second",
        kind: "message",
        role: "assistant",
        text: "Second assistant",
      },
      {
        id: "user-third",
        kind: "message",
        role: "user",
        text: "User message",
      },
      {
        id: "assistant-fourth",
        kind: "message",
        role: "assistant",
        text: "Third assistant",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const dividerRows = container.querySelectorAll(
      ".messages-virtual-row.item-message-assistant-divider",
    );
    expect(dividerRows.length).toBe(2);
  });

  it("shows a plan-ready follow-up prompt after a completed plan tool item", () => {
    const onPlanAccept = vi.fn();
    const onPlanSubmitChanges = vi.fn();
    const items: ConversationItem[] = [
      {
        id: "plan-1",
        kind: "tool",
        toolType: "plan",
        title: "Plan",
        detail: "completed",
        status: "completed",
        output: "- Step 1",
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
        onPlanAccept={onPlanAccept}
        onPlanSubmitChanges={onPlanSubmitChanges}
      />,
    );

    expect(screen.getByText("方案就绪")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "执行此方案" }),
    ).not.toBeNull();
  });

  it("hides the plan-ready follow-up once the user has replied after the plan", () => {
    const onPlanAccept = vi.fn();
    const onPlanSubmitChanges = vi.fn();
    const items: ConversationItem[] = [
      {
        id: "plan-2",
        kind: "tool",
        toolType: "plan",
        title: "Plan",
        detail: "completed",
        status: "completed",
        output: "Plan text",
      },
      {
        id: "user-after-plan",
        kind: "message",
        role: "user",
        text: "OK",
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
        onPlanAccept={onPlanAccept}
        onPlanSubmitChanges={onPlanSubmitChanges}
      />,
    );

    expect(screen.queryByText("方案就绪")).toBeNull();
  });

  it("hides the plan-ready follow-up when the plan tool item is still running", () => {
    const onPlanAccept = vi.fn();
    const onPlanSubmitChanges = vi.fn();
    const items: ConversationItem[] = [
      {
        id: "plan-3",
        kind: "tool",
        toolType: "plan",
        title: "Plan",
        detail: "Generating plan...",
        status: "in_progress",
        output: "Partial plan",
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={true}
        openTargets={[]}
        selectedOpenAppId=""
        onPlanAccept={onPlanAccept}
        onPlanSubmitChanges={onPlanSubmitChanges}
      />,
    );

    expect(screen.queryByText("方案就绪")).toBeNull();
  });

  it("shows the plan-ready follow-up once the turn stops thinking even if the plan status stays in_progress", () => {
    const onPlanAccept = vi.fn();
    const onPlanSubmitChanges = vi.fn();
    const items: ConversationItem[] = [
      {
        id: "plan-stuck-in-progress",
        kind: "tool",
        toolType: "plan",
        title: "Plan",
        detail: "Generating plan...",
        status: "in_progress",
        output: "Plan text",
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
        onPlanAccept={onPlanAccept}
        onPlanSubmitChanges={onPlanSubmitChanges}
      />,
    );

    expect(screen.getByText("方案就绪")).not.toBeNull();
  });

  it("calls the plan follow-up callbacks", () => {
    const onPlanAccept = vi.fn();
    const onPlanSubmitChanges = vi.fn();
    const items: ConversationItem[] = [
      {
        id: "plan-4",
        kind: "tool",
        toolType: "plan",
        title: "Plan",
        detail: "completed",
        status: "completed",
        output: "Plan text",
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
        onPlanAccept={onPlanAccept}
        onPlanSubmitChanges={onPlanSubmitChanges}
      />,
    );

    const sendChangesButton = screen.getByRole("button", { name: "发送修改" });
    expect((sendChangesButton as HTMLButtonElement).disabled).toBe(true);

    const textarea = screen.getByPlaceholderText(
      "描述你想修改的内容...",
    );
    fireEvent.change(textarea, { target: { value: "Add error handling" } });

    expect((sendChangesButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(sendChangesButton);
    expect(onPlanSubmitChanges).toHaveBeenCalledWith("Add error handling");
    expect(screen.queryByText("方案就绪")).toBeNull();
  });

  it("dismisses the plan-ready follow-up when the plan is accepted", () => {
    const onPlanAccept = vi.fn();
    const onPlanSubmitChanges = vi.fn();
    const items: ConversationItem[] = [
      {
        id: "plan-accept",
        kind: "tool",
        toolType: "plan",
        title: "Plan",
        detail: "completed",
        status: "completed",
        output: "Plan text",
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
        onPlanAccept={onPlanAccept}
        onPlanSubmitChanges={onPlanSubmitChanges}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "执行此方案" }),
    );
    expect(onPlanAccept).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("方案就绪")).toBeNull();
  });

  it("does not render plan-ready tagged internal user messages", () => {
    const onPlanAccept = vi.fn();
    const onPlanSubmitChanges = vi.fn();
    const items: ConversationItem[] = [
      {
        id: "plan-6",
        kind: "tool",
        toolType: "plan",
        title: "Plan",
        detail: "completed",
        status: "completed",
        output: "Plan text",
      },
      {
        id: "internal-user",
        kind: "message",
        role: "user",
        text: "[[cm_plan_ready:accept]] Implement this plan.",
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
        onPlanAccept={onPlanAccept}
        onPlanSubmitChanges={onPlanSubmitChanges}
      />,
    );

    expect(screen.queryByText(/cm_plan_ready/)).toBeNull();
    expect(screen.queryByText("方案就绪")).toBeNull();
  });

  it("hides the plan follow-up when an input-requested bubble is active", () => {
    const onPlanAccept = vi.fn();
    const onPlanSubmitChanges = vi.fn();
    const items: ConversationItem[] = [
      {
        id: "plan-5",
        kind: "tool",
        toolType: "plan",
        title: "Plan",
        detail: "completed",
        status: "completed",
        output: "Plan text",
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
        userInputRequests={[
          {
            workspace_id: "ws-1",
            request_id: 1,
            params: {
              thread_id: "thread-1",
              turn_id: "turn-1",
              item_id: "item-1",
              questions: [],
            },
          },
        ]}
        onUserInputSubmit={vi.fn()}
        onPlanAccept={onPlanAccept}
        onPlanSubmitChanges={onPlanSubmitChanges}
      />,
    );

    expect(screen.getByText("需要你的输入")).not.toBeNull();
    expect(screen.queryByText("方案就绪")).toBeNull();
  });

  it("shows polling fetch countdown when requested", () => {
    vi.useFakeTimers();
    try {
      const items: ConversationItem[] = [
        {
          id: "assistant-msg-done",
          kind: "message",
          role: "assistant",
          text: "Completed response",
        },
      ];

      render(
        <Messages
          items={items}
          threadId="thread-1"
          workspaceId="ws-1"
          isThinking={false}
          lastDurationMs={4_000}
          showPollingFetchStatus
          pollingIntervalMs={12_000}
          openTargets={[]}
          selectedOpenAppId=""
        />,
      );

      expect(
        screen.getByText("New message will be fetched in 12 seconds"),
      ).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(
        screen.getByText("New message will be fetched in 11 seconds"),
      ).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps default done duration text when polling countdown is disabled", () => {
    const items: ConversationItem[] = [
      {
        id: "assistant-msg-done-default",
        kind: "message",
        role: "assistant",
        text: "Completed response",
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        lastDurationMs={4_000}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getByText("Worked for 4s")).not.toBeNull();
  });
});
