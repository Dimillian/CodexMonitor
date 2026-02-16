// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("renders image grid above message text and opens lightbox", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-1",
        kind: "message",
        role: "user",
        text: "Hello",
        images: ["data:image/png;base64,AAA"],
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

    const bubble = container.querySelector(".message-bubble");
    const grid = container.querySelector(".message-image-grid");
    const markdown = container.querySelector(".markdown");
    expect(bubble).not.toBeNull();
    expect(grid).not.toBeNull();
    expect(markdown).not.toBeNull();
    if (grid && markdown) {
      expect(bubble?.firstChild).toBe(grid);
    }
    const openButton = screen.getByRole("button", { name: "打开图片 1" });
    fireEvent.click(openButton);
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("preserves newlines when images are attached", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-2",
        kind: "message",
        role: "user",
        text: "Line 1\n\n- item 1\n- item 2",
        images: ["data:image/png;base64,AAA"],
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

    const markdown = container.querySelector(".markdown");
    expect(markdown).not.toBeNull();
    expect(markdown?.textContent ?? "").toContain("Line 1");
    expect(markdown?.textContent ?? "").toContain("item 1");
    expect(markdown?.textContent ?? "").toContain("item 2");
  });

  it("keeps literal [image] text when images are attached", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-3",
        kind: "message",
        role: "user",
        text: "Literal [image] token",
        images: ["data:image/png;base64,AAA"],
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

    const markdown = container.querySelector(".markdown");
    expect(markdown?.textContent ?? "").toContain("Literal [image] token");
  });

  it("normalizes Q/A option blocks into stable three-level lists", () => {
    const qaText = [
      "- Q2 渲染模板怎么定？",
      "- A: 保守修复",
      "- 含义: 只修复塌层问题",
      "- 动作: 保持当前组件结构",
      "- 影响成本: 改动小，风险低",
      "- B: 系统化治理",
      "- 含义: 同时统一输出模板",
      "- 动作: 增加渲染归一化策略",
      "- 影响成本: 改动中等，收益更高",
    ].join("\n");
    const items: ConversationItem[] = [
      {
        id: "msg-qa-three-level",
        kind: "message",
        role: "assistant",
        text: qaText,
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

    const markdown = container.querySelector(".markdown");
    const rootList = markdown?.querySelector("ul");
    expect(rootList).not.toBeNull();

    const rootItems = Array.from(rootList?.children ?? []).filter(
      (node): node is HTMLLIElement => node instanceof HTMLLIElement,
    );
    expect(rootItems).toHaveLength(1);

    const optionList = rootItems[0].querySelector("ul");
    expect(optionList).not.toBeNull();
    const optionItems = Array.from(optionList?.children ?? []).filter(
      (node): node is HTMLLIElement => node instanceof HTMLLIElement,
    );
    expect(optionItems).toHaveLength(2);
    expect(optionItems[0].textContent ?? "").toContain("A: 保守修复");
    expect(optionItems[1].textContent ?? "").toContain("B: 系统化治理");

    const firstDetails = Array.from(optionItems[0].querySelector("ul")?.children ?? []).filter(
      (node): node is HTMLLIElement => node instanceof HTMLLIElement,
    );
    const secondDetails = Array.from(optionItems[1].querySelector("ul")?.children ?? []).filter(
      (node): node is HTMLLIElement => node instanceof HTMLLIElement,
    );

    expect(firstDetails).toHaveLength(3);
    expect(secondDetails).toHaveLength(3);
    expect(firstDetails[0].textContent ?? "").toContain("含义:");
    expect(firstDetails[2].textContent ?? "").toContain("影响成本:");
    expect(secondDetails[1].textContent ?? "").toContain("动作:");
  });

  it("only applies Q/A nesting for explicit option labels", () => {
    const text = [
      "- Q9 这里只是普通列表",
      "- X: 这不是标准 A/B/C 选项",
      "- 含义: 这是普通说明，不应被强制嵌套",
    ].join("\n");
    const items: ConversationItem[] = [
      {
        id: "msg-qa-non-template",
        kind: "message",
        role: "assistant",
        text,
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

    const rootList = container.querySelector(".markdown ul");
    const rootItems = Array.from(rootList?.children ?? []).filter(
      (node): node is HTMLLIElement => node instanceof HTMLLIElement,
    );
    expect(rootItems).toHaveLength(3);
    expect(rootItems[0].querySelector("ul")).toBeNull();
  });

  it("collapses long user messages by default and toggles expand/collapse", () => {
    const longText = Array.from({ length: 220 }, (_, index) => `line-${index} content`)
      .join("\n")
      .trim();
    const items: ConversationItem[] = [
      {
        id: "msg-long-user",
        kind: "message",
        role: "user",
        text: longText,
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

    expect(container.querySelector(".message-user-preview")).not.toBeNull();
    expect(screen.getByRole("button", { name: "展开全文" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "收起" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "展开全文" }));

    expect(container.querySelector(".message-user-preview")).toBeNull();
    expect(screen.getByRole("button", { name: "收起" })).not.toBeNull();
    expect(container.querySelector(".markdown")?.textContent ?? "").toContain(
      "line-219 content",
    );

    fireEvent.click(screen.getByRole("button", { name: "收起" }));

    expect(container.querySelector(".message-user-preview")).not.toBeNull();
    expect(screen.getByRole("button", { name: "展开全文" })).not.toBeNull();
  });

  it("keeps very long unbroken user text inside long-message mode", () => {
    const longUnbrokenText = `prefix-${"x".repeat(1400)}-suffix`;
    const items: ConversationItem[] = [
      {
        id: "msg-long-unbroken",
        kind: "message",
        role: "user",
        text: longUnbrokenText,
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

    expect(container.querySelector(".message-bubble-long-user")).not.toBeNull();
    expect(container.querySelector(".message-user-preview")).not.toBeNull();
    expect(screen.getByRole("button", { name: "展开全文" })).not.toBeNull();
  });

  it("auto-collapses long assistant messages older than the latest five", () => {
    const makeLongAssistantText = (label: string) =>
      `${label} start\n${"x".repeat(1600)}\n${label}-TAIL`;

    const items: ConversationItem[] = Array.from({ length: 7 }, (_, index) => ({
      id: `msg-assistant-${index + 1}`,
      kind: "message" as const,
      role: "assistant" as const,
      text: makeLongAssistantText(`assistant-${index + 1}`),
    }));

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

    const expandButtons = screen.getAllByRole("button", { name: "展开全文" });
    expect(expandButtons).toHaveLength(2);
    expect(container.textContent ?? "").not.toContain("assistant-1-TAIL");
    expect(container.textContent ?? "").not.toContain("assistant-2-TAIL");
    expect(container.textContent ?? "").toContain("assistant-3-TAIL");

    fireEvent.click(expandButtons[0]);
    expect(container.textContent ?? "").toContain("assistant-1-TAIL");
  });

  it("opens linked review thread when clicking thread link", () => {
    const onOpenThreadLink = vi.fn();
    const items: ConversationItem[] = [
      {
        id: "msg-thread-link",
        kind: "message",
        role: "assistant",
        text: "Detached review completed. [Open review thread](/thread/thread-review-1)",
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-parent"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
        onOpenThreadLink={onOpenThreadLink}
      />,
    );

    fireEvent.click(screen.getByText("Open review thread"));
    expect(onOpenThreadLink).toHaveBeenCalledWith("thread-review-1");
  });

  it("keeps hash links as real anchors", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-hash-link",
        kind: "message",
        role: "assistant",
        text: "跳转 [Q3](#q3-anchor)",
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

    expect(container.querySelector('a[href="#q3-anchor"]')).not.toBeNull();
  });

  it("does not render unknown markdown links as hyperlinks", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-unknown-link",
        kind: "message",
        role: "assistant",
        text: "⚠️ 需改进：[可读性](可读性)、[架构优雅性](架构优雅性)",
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

    expect(container.textContent ?? "").toContain("可读性");
    expect(container.textContent ?? "").toContain("架构优雅性");
    expect(container.querySelector('a[href="可读性"]')).toBeNull();
    expect(container.querySelector('a[href="架构优雅性"]')).toBeNull();
  });

  it("normalizes state_dump blocks into a stable three-level markdown structure", () => {
    const text = [
      "<state_dump>",
      "<task>持久化 ToolRow 折叠状态并修复线程切换后滚动到顶部问题</task>",
      "<phase>Phase 4 / Step 4</phase>",
      '<files_modified>["Messages.tsx","Messages.test.tsx"]</files_modified>',
      '<pending>["等待你在真实会话里验证：切线程回流、运行中会话回流、展开/收起记忆"]</pending>',
      "<blockers>none</blockers>",
      "</state_dump>",
    ].join(" ");
    const items: ConversationItem[] = [
      {
        id: "msg-state-dump",
        kind: "message",
        role: "assistant",
        text,
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

    const markdown = container.querySelector(".markdown");
    expect(markdown?.textContent ?? "").not.toContain("<state_dump>");
    expect(screen.getByText("状态快照")).not.toBeNull();

    const rootList = markdown?.querySelector("ul");
    const rootItems = Array.from(rootList?.children ?? []).filter(
      (node): node is HTMLLIElement => node instanceof HTMLLIElement,
    );
    expect(rootItems.length).toBeGreaterThanOrEqual(5);
    expect(rootItems[0].querySelector("ul")).not.toBeNull();

    expect(screen.getByText("Messages.tsx")).not.toBeNull();
    expect(screen.getByText("Messages.test.tsx")).not.toBeNull();
  });

  it("keeps state_dump literal text inside fenced code blocks", () => {
    const text = [
      "```xml",
      "<state_dump>",
      "<task>只作为示例展示</task>",
      "</state_dump>",
      "```",
    ].join("\n");
    const items: ConversationItem[] = [
      {
        id: "msg-state-dump-fence",
        kind: "message",
        role: "assistant",
        text,
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

    expect(container.textContent ?? "").toContain("<state_dump>");
    expect(screen.queryByText("状态快照")).toBeNull();
    expect(container.querySelectorAll(".message-file-link")).toHaveLength(0);
  });

  it("renders file references as compact links and opens them", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-file-link",
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
      />,
    );

    const fileLinkName = screen.getByText("DocumentListView.swift");
    const fileLink = container.querySelector(".message-file-link");
    expect(fileLinkName).not.toBeNull();
    expect(fileLink).not.toBeNull();
    expect(fileLink?.getAttribute("title")).toBe(
      "DocumentListView.swift · L111 · iosApp/src/views/DocumentsList",
    );

    fireEvent.click(fileLink as Element);
    expect(openFileLinkMock).toHaveBeenCalledWith(
      "iosApp/src/views/DocumentsList/DocumentListView.swift:111",
    );
  });

  it("stores full file path metadata on compact file links", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-file-link-copy",
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
    const fileLink = container.querySelector(".message-file-link");
    expect(fileLinkName?.textContent).toBe("Markdown.tsx");
    expect(fileLink).not.toBeNull();
    expect(fileLink?.getAttribute("data-copy-text")).toBe(
      "src/features/messages/components/Markdown.tsx:5",
    );
  });

});
