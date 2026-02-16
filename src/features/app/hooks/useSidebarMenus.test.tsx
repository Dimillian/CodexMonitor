/** @vitest-environment jsdom */
import type { MouseEvent as ReactMouseEvent } from "react";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceInfo } from "../../../types";
import { useSidebarMenus } from "./useSidebarMenus";
import { fileManagerName } from "../../../utils/platformPaths";

const menuNew = vi.hoisted(() =>
  vi.fn(async ({ items }) => ({ popup: vi.fn(), items })),
);
const menuItemNew = vi.hoisted(() => vi.fn(async (options) => options));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: menuNew },
  MenuItem: { new: menuItemNew },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ scaleFactor: () => 1 }),
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: class LogicalPosition {
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
}));

const revealItemInDir = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: (...args: unknown[]) => revealItemInDir(...args),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

describe("useSidebarMenus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds workspace alias rename action to workspace menu", async () => {
    const onDeleteThread = vi.fn();
    const onPinThread = vi.fn();
    const onUnpinThread = vi.fn();
    const isThreadPinned = vi.fn(() => false);
    const onRenameThread = vi.fn();
    const onRenameWorkspaceAlias = vi.fn();
    const onReloadWorkspaceThreads = vi.fn();
    const onDeleteWorkspace = vi.fn();
    const onDeleteWorktree = vi.fn();

    const { result } = renderHook(() =>
      useSidebarMenus({
        onDeleteThread,
        onPinThread,
        onUnpinThread,
        isThreadPinned,
        onRenameThread,
        onRenameWorkspaceAlias,
        onReloadWorkspaceThreads,
        onDeleteWorkspace,
        onDeleteWorktree,
      }),
    );

    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 8,
      clientY: 16,
    } as unknown as ReactMouseEvent;

    await result.current.showWorkspaceMenu(event, "ws-1");

    const menuArgs =
      menuNew.mock.calls[menuNew.mock.calls.length - 1]?.[0];
    const renameItem = menuArgs.items.find(
      (item: { text: string }) => item.text === "自定义名称",
    );

    expect(renameItem).not.toBeUndefined();
    await renameItem.action();
    expect(onRenameWorkspaceAlias).toHaveBeenCalledWith("ws-1");
  });

  it("adds a show in file manager option for worktrees", async () => {
    const onDeleteThread = vi.fn();
    const onPinThread = vi.fn();
    const onUnpinThread = vi.fn();
    const isThreadPinned = vi.fn(() => false);
    const onRenameThread = vi.fn();
    const onRenameWorkspaceAlias = vi.fn();
    const onReloadWorkspaceThreads = vi.fn();
    const onDeleteWorkspace = vi.fn();
    const onDeleteWorktree = vi.fn();

    const { result } = renderHook(() =>
      useSidebarMenus({
        onDeleteThread,
        onPinThread,
        onUnpinThread,
        isThreadPinned,
        onRenameThread,
        onRenameWorkspaceAlias,
        onReloadWorkspaceThreads,
        onDeleteWorkspace,
        onDeleteWorktree,
      }),
    );

    const worktree: WorkspaceInfo = {
      id: "worktree-1",
      name: "feature/test",
      path: "/tmp/worktree-1",
      kind: "worktree",
      connected: true,
      settings: {
        sidebarCollapsed: false,
        worktreeSetupScript: "",
      },
      worktree: { branch: "feature/test" },
    };

    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 12,
      clientY: 34,
    } as unknown as ReactMouseEvent;

    await result.current.showWorktreeMenu(event, worktree);

    const menuArgs =
      menuNew.mock.calls[menuNew.mock.calls.length - 1]?.[0];
    const revealItem = menuArgs.items.find(
      (item: { text: string }) => item.text === `在${fileManagerName()}中显示`,
    );

    expect(revealItem).not.toBeUndefined();
    await revealItem.action();
    expect(revealItemInDir).toHaveBeenCalledWith("/tmp/worktree-1");
  });

  it("archives selected threads in batch when right-click target is selected", async () => {
    const onDeleteThread = vi.fn();
    const onDeleteThreads = vi.fn();
    const { result } = renderHook(() =>
      useSidebarMenus({
        onDeleteThread,
        onDeleteThreads,
        getSelectedThreadIds: () => ["thread-1", "thread-2"],
        onPinThread: vi.fn(),
        onUnpinThread: vi.fn(),
        isThreadPinned: vi.fn(() => false),
        onRenameThread: vi.fn(),
        onRenameWorkspaceAlias: vi.fn(),
        onReloadWorkspaceThreads: vi.fn(),
        onDeleteWorkspace: vi.fn(),
        onDeleteWorktree: vi.fn(),
      }),
    );

    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 5,
      clientY: 6,
    } as unknown as ReactMouseEvent;

    await result.current.showThreadMenu(event, "ws-1", "thread-2", true);

    const menuArgs = menuNew.mock.calls[menuNew.mock.calls.length - 1]?.[0];
    const archiveItem = menuArgs.items.find(
      (item: { text: string }) => item.text === "归档所选 (2)",
    );
    expect(archiveItem).not.toBeUndefined();

    await archiveItem.action();
    expect(onDeleteThreads).toHaveBeenCalledWith("ws-1", ["thread-1", "thread-2"]);
    expect(onDeleteThread).not.toHaveBeenCalled();
  });

  it("archives only clicked thread when right-click target is outside selection", async () => {
    const onDeleteThread = vi.fn();
    const onDeleteThreads = vi.fn();
    const { result } = renderHook(() =>
      useSidebarMenus({
        onDeleteThread,
        onDeleteThreads,
        getSelectedThreadIds: () => ["thread-1", "thread-2"],
        onPinThread: vi.fn(),
        onUnpinThread: vi.fn(),
        isThreadPinned: vi.fn(() => false),
        onRenameThread: vi.fn(),
        onRenameWorkspaceAlias: vi.fn(),
        onReloadWorkspaceThreads: vi.fn(),
        onDeleteWorkspace: vi.fn(),
        onDeleteWorktree: vi.fn(),
      }),
    );

    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 7,
      clientY: 9,
    } as unknown as ReactMouseEvent;

    await result.current.showThreadMenu(event, "ws-1", "thread-3", true);

    const menuArgs = menuNew.mock.calls[menuNew.mock.calls.length - 1]?.[0];
    const archiveItem = menuArgs.items.find(
      (item: { text: string }) => item.text === "归档",
    );
    expect(archiveItem).not.toBeUndefined();

    await archiveItem.action();
    expect(onDeleteThread).toHaveBeenCalledWith("ws-1", "thread-3");
    expect(onDeleteThreads).not.toHaveBeenCalled();
  });
});
