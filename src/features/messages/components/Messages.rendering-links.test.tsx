// @vitest-environment jsdom
import { useCallback, useState } from "react";
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

  it("rewrites full-link selection copy text to full file path", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-file-link-copy-full",
        kind: "message",
        role: "assistant",
        text: "Ref: `src/features/messages/components/Markdown.tsx:5`",
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

    const markdown = container.querySelector(".markdown") as HTMLElement | null;
    expect(markdown).not.toBeNull();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(markdown as HTMLElement);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const setData = vi.fn();
    fireEvent.copy(markdown as HTMLElement, {
      clipboardData: {
        setData,
      },
    });

    expect(setData).toHaveBeenCalledTimes(1);
    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      "Ref: src/features/messages/components/Markdown.tsx:5",
    );

    selection?.removeAllRanges();
  });

  it("keeps native copy behavior for partial selection inside file links", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-file-link-copy-partial",
        kind: "message",
        role: "assistant",
        text: "Ref: `src/features/messages/components/Markdown.tsx:5`",
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

    const fileLinkName = container.querySelector(".message-file-link-name");
    const textNode = fileLinkName?.firstChild;
    expect(textNode).not.toBeNull();

    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode as Node, 0);
    range.setEnd(textNode as Node, 4);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const setData = vi.fn();
    fireEvent.copy(container.querySelector(".markdown") as Element, {
      clipboardData: {
        setData,
      },
    });

    expect(setData).not.toHaveBeenCalled();

    selection?.removeAllRanges();
  });

  it("shows hover preview for workspace file references", async () => {
    readWorkspaceFileMock.mockResolvedValue({
      content: [
        "line-1",
        "line-2",
        "line-3",
        "line-4",
        "line-5 target",
        "line-6",
        "line-7",
        "line-8",
      ].join("\n"),
      truncated: false,
    });

    const items: ConversationItem[] = [
      {
        id: "msg-file-link-preview",
        kind: "message",
        role: "assistant",
        text: "Check `src/features/messages/components/Markdown.tsx:5`",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        workspacePath="/tmp/repo"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const fileLink = container.querySelector(".message-file-link");
    expect(fileLink).not.toBeNull();
    fireEvent.mouseEnter(fileLink as Element);

    await waitFor(() => {
      expect(readWorkspaceFileMock).toHaveBeenCalledWith(
        "ws-1",
        "src/features/messages/components/Markdown.tsx",
      );
    });
    expect(screen.getByText("line-5 target")).not.toBeNull();
  });

  it("clamps preview line lookup when requested line exceeds file length", async () => {
    readWorkspaceFileMock.mockResolvedValue({
      content: ["line-1", "line-2", "line-3 final"].join("\n"),
      truncated: false,
    });

    const items: ConversationItem[] = [
      {
        id: "msg-file-link-preview-overflow",
        kind: "message",
        role: "assistant",
        text: "Check `src/features/messages/components/Markdown.tsx:999`",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-preview-overflow"
        workspacePath="/tmp/repo"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const fileLink = container.querySelector(".message-file-link");
    expect(fileLink).not.toBeNull();
    fireEvent.mouseEnter(fileLink as Element);

    await waitFor(() => {
      expect(screen.getByText("line-3 final")).not.toBeNull();
    });
    expect(screen.queryByText("文件为空。")).toBeNull();
  });

  it("reuses cached hover preview payload for identical workspace files", async () => {
    readWorkspaceFileMock.mockResolvedValue({
      content: [
        "line-1",
        "line-2",
        "line-3",
        "line-4",
        "line-5 target",
        "line-6 target",
        "line-7",
      ].join("\n"),
      truncated: false,
    });

    const items: ConversationItem[] = [
      {
        id: "msg-file-link-preview-cache",
        kind: "message",
        role: "assistant",
        text:
          "Compare `src/features/messages/components/MessageRows.tsx:5` and `src/features/messages/components/MessageRows.tsx:6`",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        workspacePath="/tmp/repo"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const fileLinks = container.querySelectorAll(".message-file-link");
    expect(fileLinks.length).toBe(2);

    fireEvent.mouseEnter(fileLinks[0] as Element);
    await waitFor(() => {
      expect(readWorkspaceFileMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.mouseEnter(fileLinks[1] as Element);
    await waitFor(() => {
      expect(readWorkspaceFileMock).toHaveBeenCalledTimes(1);
    });
  });

  it("hides file parent paths when message file path display is disabled", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-file-link-hidden-path",
        kind: "message",
        role: "assistant",
        text: "Refactor candidate: `iosApp/src/views/DocumentsList/DocumentListView.swift:111`",
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
        showMessageFilePath={false}
      />,
    );

    const fileName = container.querySelector(".message-file-link-name");
    const fileLink = container.querySelector(".message-file-link");
    expect(fileName?.textContent).toBe("DocumentListView.swift");
    expect(container.textContent ?? "").not.toContain("L111");
    expect(container.textContent ?? "").not.toContain("iosApp/src/views/DocumentsList");
    expect(fileLink?.getAttribute("title")).toBe("DocumentListView.swift · L111");
  });

  it("renders absolute file references as workspace-relative paths", () => {
    const workspacePath = "/tmp/CodexMonitorWorkspace";
    const absolutePath =
      "/tmp/CodexMonitorWorkspace/src/features/messages/components/Markdown.tsx:244";
    const items: ConversationItem[] = [
      {
        id: "msg-file-link-absolute-inside",
        kind: "message",
        role: "assistant",
        text: `Reference: \`${absolutePath}\``,
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        workspacePath={workspacePath}
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getByText("Markdown.tsx")).not.toBeNull();
    expect(container.textContent ?? "").not.toContain("L244");
    expect(container.textContent ?? "").not.toContain("src/features/messages/components");

    const fileLink = container.querySelector(".message-file-link");
    expect(fileLink?.getAttribute("title")).toBe(
      "Markdown.tsx · L244 · src/features/messages/components",
    );
    expect(fileLink).not.toBeNull();
    fireEvent.click(fileLink as Element);
    expect(openFileLinkMock).toHaveBeenCalledWith(absolutePath);
  });

  it("renders absolute file references outside workspace using dotdot-relative paths", () => {
    const workspacePath = "/tmp/CodexMonitorWorkspace";
    const absolutePath = "/tmp/Other/IceCubesApp/file.rs:123";
    const items: ConversationItem[] = [
      {
        id: "msg-file-link-absolute-outside",
        kind: "message",
        role: "assistant",
        text: `Reference: \`${absolutePath}\``,
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        workspacePath={workspacePath}
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getByText("file.rs")).not.toBeNull();
    expect(container.textContent ?? "").not.toContain("L123");
    expect(container.textContent ?? "").not.toContain("../../Other/IceCubesApp");

    const fileLink = container.querySelector(".message-file-link");
    expect(fileLink?.getAttribute("title")).toBe("file.rs · L123 · ../Other/IceCubesApp");
    expect(fileLink).not.toBeNull();
    fireEvent.click(fileLink as Element);
    expect(openFileLinkMock).toHaveBeenCalledWith(absolutePath);
  });

  it("does not render dot-slash noise as clickable links", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-dot-slash-noise",
        kind: "message",
        role: "assistant",
        text: "我现在会先改 MessageRows.tsx：加入长用户消息默认折叠，并避免折叠态去渲染完整 .././././../.. Markdown。",
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

    expect(container.querySelector(".message-file-link")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("keeps malformed relative markdown links as normal anchors, not file links", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-bad-relative-link",
        kind: "message",
        role: "assistant",
        text: "坏链接 [.././././../..](.././././../..) 不应渲染为可点击",
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

    expect(container.querySelector('a[href=".././././../.."]')).not.toBeNull();
    expect(container.querySelector(".message-file-link")).toBeNull();
    expect(container.textContent ?? "").toContain(".././././../..");
  });

  it("does not convert plain slash words like 影响/成本 into file links", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-slash-plain-text",
        kind: "message",
        role: "assistant",
        text: "影响/成本: 低中，适合“非当前主战项目”。",
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

    expect(container.querySelector(".message-file-link")).toBeNull();
  });

  it("renders tool output containing fences as plain code text", () => {
    const items: ConversationItem[] = [
      {
        id: "tool-fence-output",
        kind: "tool",
        toolType: "search",
        title: "Search: render output",
        detail: "/repo",
        status: "completed",
        output: ["before", "```bash", "echo hi", "```", "after"].join("\n"),
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

    fireEvent.click(screen.getByRole("button", { name: "切换工具详情" }));
    expect(container.textContent ?? "").toContain("```bash");
    expect(container.textContent ?? "").toContain("echo hi");
    expect(container.textContent ?? "").toContain("after");
  });

  it("keeps long-running command output collapsed by default and supports re-collapse", () => {
    const items: ConversationItem[] = [
      {
        id: "tool-long-command-collapse",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg foo src",
        detail: "/repo",
        status: "completed",
        durationMs: 3200,
        output: ["line-1", "line-2", "line-3"].join("\n"),
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

    expect(container.querySelector(".tool-inline-terminal")).toBeNull();
    expect(container.textContent ?? "").not.toContain("line-1");

    const toggleButton = screen.getByRole("button", { name: "切换工具详情" });
    fireEvent.click(toggleButton);

    expect(container.querySelector(".tool-inline-terminal")).not.toBeNull();
    expect(container.textContent ?? "").toContain("line-1");

    fireEvent.click(toggleButton);

    expect(container.querySelector(".tool-inline-terminal")).toBeNull();
    expect(container.textContent ?? "").not.toContain("line-1");
  });

  it("keeps running command output collapsed until explicit expand", () => {
    const items: ConversationItem[] = [
      {
        id: "tool-running-command-collapse",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: npm run dev",
        detail: "/repo",
        status: "running",
        output: ["booting...", "ready"].join("\n"),
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={true}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".tool-inline-terminal")).toBeNull();
    expect(container.textContent ?? "").not.toContain("booting...");

    const toggleButton = screen.getByRole("button", { name: "切换工具详情" });
    fireEvent.click(toggleButton);
    expect(container.querySelector(".tool-inline-terminal")).not.toBeNull();
    expect(container.textContent ?? "").toContain("booting...");

    fireEvent.click(toggleButton);
    expect(container.querySelector(".tool-inline-terminal")).toBeNull();
  });

  it("does not re-render messages while typing when message props stay stable", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-stable-1",
        kind: "message",
        role: "assistant",
        text: "Stable content",
      },
    ];
    const openTargets: [] = [];
    function Harness() {
      const [draft, setDraft] = useState("");
      const handleOpenThreadLink = useCallback(() => {}, []);

      return (
        <div>
          <input
            aria-label="Draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Messages
            items={items}
            threadId="thread-stable"
            workspaceId="ws-1"
            isThinking={false}
            openTargets={openTargets}
            selectedOpenAppId=""
            onOpenThreadLink={handleOpenThreadLink}
          />
        </div>
      );
    }

    render(<Harness />);
    expect(useFileLinkOpenerMock).toHaveBeenCalledTimes(1);
    const input = screen.getByLabelText("Draft");
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.change(input, { target: { value: "abc" } });

    expect(useFileLinkOpenerMock).toHaveBeenCalledTimes(1);
  });

  it("uses reasoning title for the working indicator and hides title-only reasoning rows", () => {
    const items: ConversationItem[] = [
      {
        id: "reasoning-1",
        kind: "reasoning",
        summary: "Scanning repository",
        content: "",
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
    expect(workingText?.textContent ?? "").toContain("Scanning repository");
    expect(container.querySelector(".reasoning-inline")).toBeNull();
  });

});
