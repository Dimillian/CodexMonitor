// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

afterEach(() => {
  if (vi.isFakeTimers()) {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  }
  window.localStorage.clear();
  cleanup();
});

const baseProps = {
  workspaces: [],
  groupedWorkspaces: [],
  hasWorkspaceGroups: false,
  deletingWorktreeIds: new Set<string>(),
  threadsByWorkspace: {},
  threadParentById: {},
  threadStatusById: {},
  threadListLoadingByWorkspace: {},
  threadListPagingByWorkspace: {},
  threadListCursorByWorkspace: {},
  threadListSortKey: "updated_at" as const,
  onSetThreadListSortKey: vi.fn(),
  onRefreshAllThreads: vi.fn(),
  activeWorkspaceId: null,
  activeThreadId: null,
  accountInfo: null,
  onSwitchAccount: vi.fn(),
  onCancelSwitchAccount: vi.fn(),
  accountSwitching: false,
  onOpenSettings: vi.fn(),
  onOpenDebug: vi.fn(),
  showDebugButton: false,
  onAddWorkspace: vi.fn(),
  onSelectHome: vi.fn(),
  onSelectWorkspace: vi.fn(),
  onConnectWorkspace: vi.fn(),
  onAddAgent: vi.fn(),
  onAddWorktreeAgent: vi.fn(),
  onAddCloneAgent: vi.fn(),
  onToggleWorkspaceCollapse: vi.fn(),
  onSelectThread: vi.fn(),
  onDeleteThread: vi.fn(),
  pinThread: vi.fn(() => false),
  unpinThread: vi.fn(),
  isThreadPinned: vi.fn(() => false),
  getPinTimestamp: vi.fn(() => null),
  onRenameThread: vi.fn(),
  onDeleteWorkspace: vi.fn(),
  onDeleteWorktree: vi.fn(),
  onLoadOlderThreads: vi.fn(),
  onReloadWorkspaceThreads: vi.fn(),
  workspaceDropTargetRef: createRef<HTMLElement>(),
  isWorkspaceDropActive: false,
  workspaceDropText: "将项目拖放到此处",
  onWorkspaceDragOver: vi.fn(),
  onWorkspaceDragEnter: vi.fn(),
  onWorkspaceDragLeave: vi.fn(),
  onWorkspaceDrop: vi.fn(),
};

describe("Sidebar", () => {
  it("toggles the search bar from the header icon", async () => {
    vi.useFakeTimers();
    render(<Sidebar {...baseProps} />);

    const toggleButton = screen.getByRole("button", { name: "切换搜索" });
    expect(
      screen.queryByRole("textbox", { name: "搜索工作区和对话" }),
    ).toBeNull();

    await act(async () => {
      fireEvent.click(toggleButton);
    });
    const input = screen.getByRole("textbox", {
      name: "搜索工作区和对话",
    }) as HTMLInputElement;
    expect(input).not.toBeNull();

    await act(async () => {
      fireEvent.change(input, { target: { value: "alpha" } });
      vi.runOnlyPendingTimers();
    });
    expect(input.value).toBe("alpha");

    await act(async () => {
      fireEvent.click(toggleButton);
      vi.runOnlyPendingTimers();
    });
    expect(
      screen.queryByRole("textbox", { name: "搜索工作区和对话" }),
    ).toBeNull();

    await act(async () => {
      fireEvent.click(toggleButton);
      vi.runOnlyPendingTimers();
    });
    const reopened = screen.getByRole("textbox", {
      name: "搜索工作区和对话",
    }) as HTMLInputElement;
    expect(reopened.value).toBe("");
  });

  it("closes and clears search when pressing Escape", async () => {
    vi.useFakeTimers();
    render(<Sidebar {...baseProps} />);

    const toggleButton = screen.getByRole("button", { name: "切换搜索" });
    await act(async () => {
      fireEvent.click(toggleButton);
      vi.runOnlyPendingTimers();
    });
    const input = screen.getByRole("textbox", {
      name: "搜索工作区和对话",
    }) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: "workspace" } });
      vi.runOnlyPendingTimers();
    });
    expect(input.value).toBe("workspace");

    await act(async () => {
      fireEvent.keyDown(input, { key: "Escape" });
      vi.runOnlyPendingTimers();
    });
    expect(
      screen.queryByRole("textbox", { name: "搜索工作区和对话" }),
    ).toBeNull();

    await act(async () => {
      fireEvent.click(toggleButton);
      vi.runOnlyPendingTimers();
    });
    const reopened = screen.getByRole("textbox", {
      name: "搜索工作区和对话",
    }) as HTMLInputElement;
    expect(reopened.value).toBe("");
  });

  it("opens thread sort menu from the header filter button", () => {
    const onSetThreadListSortKey = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        threadListSortKey="updated_at"
        onSetThreadListSortKey={onSetThreadListSortKey}
      />,
    );

    const button = screen.getByRole("button", { name: "排序对话" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(button);
    const option = screen.getByRole("menuitemradio", { name: "最新创建" });
    fireEvent.click(option);

    expect(onSetThreadListSortKey).toHaveBeenCalledWith("created_at");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("refreshes all workspace threads from the header button", () => {
    const onRefreshAllThreads = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Workspace",
            path: "/tmp/workspace",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Workspace",
                path: "/tmp/workspace",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        onRefreshAllThreads={onRefreshAllThreads}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刷新全部工作区对话" }));
    expect(onRefreshAllThreads).toHaveBeenCalledTimes(1);
  });

  it("spins the refresh icon while workspace threads are refreshing", () => {
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Workspace",
            path: "/tmp/workspace",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Workspace",
                path: "/tmp/workspace",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        threadListLoadingByWorkspace={{ "ws-1": true }}
      />,
    );

    const refreshButton = screen.getByRole("button", { name: "刷新全部工作区对话" });
    expect(refreshButton.getAttribute("aria-busy")).toBe("true");
    const icon = refreshButton.querySelector("svg");
    expect(icon?.getAttribute("class") ?? "").toContain("spinning");
  });

  it("shows a top New Agent draft row and selects workspace when clicked", () => {
    const onSelectWorkspace = vi.fn();
    const props = {
      ...baseProps,
      workspaces: [
        {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/workspace",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
      ],
      groupedWorkspaces: [
        {
          id: null,
          name: "Workspaces",
          workspaces: [
            {
              id: "ws-1",
              name: "Workspace",
              path: "/tmp/workspace",
              connected: true,
              settings: { sidebarCollapsed: false },
            },
          ],
        },
      ],
      newAgentDraftWorkspaceId: "ws-1",
      activeWorkspaceId: "ws-1",
      activeThreadId: null,
      onSelectWorkspace,
    };

    render(<Sidebar {...props} />);

    const draftRow = screen.getByRole("button", { name: /新建对话/i });
    expect(draftRow).not.toBeNull();
    expect(draftRow.className).toContain("thread-row-draft");
    expect(draftRow.className).toContain("active");

    fireEvent.click(draftRow);
    expect(onSelectWorkspace).toHaveBeenCalledWith("ws-1");
  });

  it("keeps New Agent draft row visible when only starting state remains", () => {
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Workspace",
            path: "/tmp/workspace",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Workspace",
                path: "/tmp/workspace",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        newAgentDraftWorkspaceId={null}
        startingDraftThreadWorkspaceId="ws-1"
        activeWorkspaceId="ws-2"
        activeThreadId="thread-existing"
      />,
    );

    const draftRow = screen.getByRole("button", { name: /新建对话/i });
    expect(draftRow).not.toBeNull();
    expect(draftRow.className).toContain("thread-row-draft");
  });

  it("uses persisted workspace displayName from settings", () => {
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Workspace",
            path: "/tmp/workspace",
            connected: true,
            settings: { sidebarCollapsed: false, displayName: "Design System" },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Workspace",
                path: "/tmp/workspace",
                connected: true,
                settings: { sidebarCollapsed: false, displayName: "Design System" },
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Design System")).not.toBeNull();
  });

  it("submits workspace custom name through callback", () => {
    const onUpdateWorkspaceDisplayName = vi.fn();

    render(
      <Sidebar
        {...baseProps}
        onUpdateWorkspaceDisplayName={onUpdateWorkspaceDisplayName}
        workspaces={[
          {
            id: "ws-1",
            name: "Workspace",
            path: "/tmp/workspace",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Workspace",
                path: "/tmp/workspace",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.doubleClick(screen.getByText("Workspace"));

    const input = screen.getByLabelText("工作区自定义名称");
    fireEvent.change(input, { target: { value: "Design System" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onUpdateWorkspaceDisplayName).toHaveBeenCalledWith("ws-1", "Design System");
  });
});
