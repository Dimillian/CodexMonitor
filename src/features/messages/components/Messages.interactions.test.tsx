// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("renders reasoning rows when there is reasoning body content", () => {
    const items: ConversationItem[] = [
      {
        id: "reasoning-2",
        kind: "reasoning",
        summary: "Scanning repository\nLooking for entry points",
        content: "",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 2_000}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".reasoning-inline")).not.toBeNull();
    const reasoningDetail = container.querySelector(".reasoning-inline-detail");
    expect(reasoningDetail?.textContent ?? "").toContain("Looking for entry points");
    const workingText = container.querySelector(".working-text");
    expect(workingText?.textContent ?? "").toContain("Scanning repository");
  });

  it("uses content for the reasoning title when summary is empty", () => {
    const items: ConversationItem[] = [
      {
        id: "reasoning-content-title",
        kind: "reasoning",
        summary: "",
        content: "Plan from content\nMore detail here",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_500}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const workingText = container.querySelector(".working-text");
    expect(workingText?.textContent ?? "").toContain("Plan from content");
    const reasoningDetail = container.querySelector(".reasoning-inline-detail");
    expect(reasoningDetail?.textContent ?? "").toContain("More detail here");
    expect(reasoningDetail?.textContent ?? "").not.toContain("Plan from content");
  });

  it("does not show a stale reasoning label from a previous turn", () => {
    const items: ConversationItem[] = [
      {
        id: "reasoning-old",
        kind: "reasoning",
        summary: "Old reasoning title",
        content: "",
      },
      {
        id: "assistant-msg",
        kind: "message",
        role: "assistant",
        text: "Previous assistant response",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 800}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const workingText = container.querySelector(".working-text");
    // With the fixed phase logic, without isStreaming the indicator stays in
    // "start" phase ("等待 Agent 响应…") rather than falsely claiming output.
    expect(workingText?.textContent ?? "").toContain("等待 Agent 响应");
    expect(workingText?.textContent ?? "").not.toContain("Old reasoning title");
  });

  it("keeps the latest title-only reasoning label without rendering a reasoning row", () => {
    const items: ConversationItem[] = [
      {
        id: "reasoning-title-only",
        kind: "reasoning",
        summary: "Indexing workspace",
        content: "",
      },
      {
        id: "tool-after-reasoning",
        kind: "tool",
        title: "Command: rg --files",
        detail: "/tmp",
        toolType: "commandExecution",
        output: "",
        status: "running",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_000}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const workingText = container.querySelector(".working-text");
    expect(workingText?.textContent ?? "").toContain("Indexing workspace");
    expect(container.querySelector(".reasoning-inline")).toBeNull();
  });

  it("merges consecutive explore items under a single explored block", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-1",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "search", label: "Find routes" }],
      },
      {
        id: "explore-2",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "routes.ts" }],
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

    await waitFor(() => {
      expect(container.querySelector(".explore-inline")).not.toBeNull();
    });
    const exploreItems = container.querySelectorAll(".explore-inline-item");
    expect(exploreItems.length).toBe(2);
    expect(screen.getByText("Search Find routes")).not.toBeNull();
    expect(screen.getByText("Read routes.ts")).not.toBeNull();
  });

  it("uses the latest explore status when merging a consecutive run", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-started",
        kind: "explore",
        status: "exploring",
        entries: [{ kind: "search", label: "starting" }],
      },
      {
        id: "explore-finished",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "finished" }],
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

    await waitFor(() => {
      expect(container.querySelectorAll(".explore-inline").length).toBe(1);
    });
    expect(container.querySelector(".tool-inline-dot.completed")).not.toBeNull();
    expect(screen.getByText("Read finished")).not.toBeNull();
  });

  it("does not merge explore items across interleaved tools", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-a",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "search", label: "Find reducers" }],
      },
      {
        id: "tool-a",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg reducers",
        detail: "/repo",
        status: "completed",
        output: "",
      },
      {
        id: "explore-b",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "useThreadsReducer.ts" }],
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

    await waitFor(() => {
      const exploreBlocks = container.querySelectorAll(".explore-inline");
      expect(exploreBlocks.length).toBe(2);
    });
    const exploreItems = container.querySelectorAll(".explore-inline-item");
    expect(exploreItems.length).toBe(2);
    expect(screen.getByText("Ran command")).not.toBeNull();
  });

  it("preserves chronology when reasoning with body appears between explore items", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-1",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "search", label: "first explore" }],
      },
      {
        id: "reasoning-body",
        kind: "reasoning",
        summary: "Reasoning title\nReasoning body",
        content: "",
      },
      {
        id: "explore-2",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "second explore" }],
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

    await waitFor(() => {
      expect(container.querySelectorAll(".explore-inline").length).toBe(2);
    });
    const exploreBlocks = Array.from(container.querySelectorAll(".explore-inline"));
    const reasoningDetail = container.querySelector(".reasoning-inline-detail");
    expect(exploreBlocks.length).toBe(2);
    expect(reasoningDetail).not.toBeNull();
    const [firstExploreBlock, secondExploreBlock] = exploreBlocks;
    const firstBeforeReasoning =
      firstExploreBlock.compareDocumentPosition(reasoningDetail as Node) &
      Node.DOCUMENT_POSITION_FOLLOWING;
    const reasoningBeforeSecond =
      (reasoningDetail as Node).compareDocumentPosition(secondExploreBlock) &
      Node.DOCUMENT_POSITION_FOLLOWING;
    expect(firstBeforeReasoning).not.toBeNull();
    expect(reasoningBeforeSecond).not.toBeNull();
  });

  it("does not merge across message boundaries and does not drop messages", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-before",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "search", label: "before message" }],
      },
      {
        id: "assistant-msg",
        kind: "message",
        role: "assistant",
        text: "A message between explore blocks",
      },
      {
        id: "explore-after",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "after message" }],
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

    await waitFor(() => {
      const exploreBlocks = container.querySelectorAll(".explore-inline");
      expect(exploreBlocks.length).toBe(2);
    });
    expect(screen.getByText("A message between explore blocks")).not.toBeNull();
  });

  it("renders explore steps inline without synthetic group summary", async () => {
    const items: ConversationItem[] = [
      {
        id: "tool-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: git status --porcelain=v1",
        detail: "/repo",
        status: "completed",
        output: "",
      },
      {
        id: "explore-steps-1",
        kind: "explore",
        status: "explored",
        entries: [
          { kind: "read", label: "Messages.tsx" },
          { kind: "search", label: "toolCount" },
        ],
      },
      {
        id: "explore-steps-2",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "types.ts" }],
      },
      {
        id: "tool-2",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: git diff -- src/features/messages/components/Messages.tsx",
        detail: "/repo",
        status: "completed",
        output: "",
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
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Read Messages.tsx")).not.toBeNull();
    });
    expect(screen.getByText("Search toolCount")).not.toBeNull();
    expect(screen.getAllByText("Ran command")).toHaveLength(2);
  });

  it("renders dense tool sequences without group header text", async () => {
    const items: ConversationItem[] = [
      {
        id: "tool-dense-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg -n foo src",
        detail: "/repo",
        status: "completed",
        output: "",
      },
      {
        id: "tool-dense-2",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg -n bar src",
        detail: "/repo",
        status: "completed",
        output: "",
      },
      {
        id: "tool-dense-3",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg -n baz src",
        detail: "/repo",
        status: "completed",
        output: "",
      },
      {
        id: "tool-dense-4",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg -n qux src",
        detail: "/repo",
        status: "completed",
        output: "",
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
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Ran command")).toHaveLength(4);
    });
    expect(screen.queryByText(/次执行/)).toBeNull();
  });

  it("re-pins to bottom on thread switch even when previous thread was scrolled up", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-shared",
        kind: "message",
        role: "assistant",
        text: "Shared tail",
      },
    ];

    const { container, rerender } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
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
      value: 600,
    });
    scrollNode.scrollTop = 100;
    fireEvent.scroll(scrollNode);

    Object.defineProperty(scrollNode, "scrollHeight", {
      configurable: true,
      value: 900,
    });

    rerender(
      <Messages
        items={items}
        threadId="thread-2"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(scrollNode.scrollTop).toBe(900);
  });

  it("pins to bottom after thread messages finish loading", () => {
    const { container, rerender } = render(
      <Messages
        items={[]}
        threadId="thread-loading"
        workspaceId="ws-1"
        isThinking={false}
        isLoadingMessages
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
      value: 1200,
    });
    scrollNode.scrollTop = 0;

    rerender(
      <Messages
        items={[
          {
            id: "msg-loaded",
            kind: "message",
            role: "assistant",
            text: "Loaded content",
          },
        ]}
        threadId="thread-loading"
        workspaceId="ws-1"
        isThinking
        isLoadingMessages={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(scrollNode.scrollTop).toBe(1200);
  });

  it("restores saved scroll position per thread when strategy is remember", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-remember-1",
        kind: "message",
        role: "assistant",
        text: "Remember mode",
      },
    ];

    const { container, rerender } = render(
      <Messages
        items={items}
        threadId="thread-remember-1"
        workspaceId="ws-1"
        isThinking={false}
        threadScrollRestoreMode="remember"
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

    scrollNode.scrollTop = 260;
    fireEvent.scroll(scrollNode);

    Object.defineProperty(scrollNode, "scrollHeight", {
      configurable: true,
      value: 900,
    });

    rerender(
      <Messages
        items={items}
        threadId="thread-remember-2"
        workspaceId="ws-1"
        isThinking={false}
        threadScrollRestoreMode="remember"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(scrollNode.scrollTop).toBe(900);

    scrollNode.scrollTop = 120;
    fireEvent.scroll(scrollNode);

    Object.defineProperty(scrollNode, "scrollHeight", {
      configurable: true,
      value: 1000,
    });

    rerender(
      <Messages
        items={items}
        threadId="thread-remember-1"
        workspaceId="ws-1"
        isThinking={false}
        threadScrollRestoreMode="remember"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(scrollNode.scrollTop).toBe(260);
  });

  it("keeps default latest strategy and pins to bottom on thread revisit", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-latest-1",
        kind: "message",
        role: "assistant",
        text: "Latest mode",
      },
    ];

    const { container, rerender } = render(
      <Messages
        items={items}
        threadId="thread-latest-1"
        workspaceId="ws-1"
        isThinking={false}
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

    scrollNode.scrollTop = 240;
    fireEvent.scroll(scrollNode);

    Object.defineProperty(scrollNode, "scrollHeight", {
      configurable: true,
      value: 900,
    });
    rerender(
      <Messages
        items={items}
        threadId="thread-latest-2"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );
    expect(scrollNode.scrollTop).toBe(900);

    Object.defineProperty(scrollNode, "scrollHeight", {
      configurable: true,
      value: 1000,
    });
    rerender(
      <Messages
        items={items}
        threadId="thread-latest-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(scrollNode.scrollTop).toBe(1000);
  });

});
