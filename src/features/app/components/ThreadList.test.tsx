// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadSummary } from "../../../types";
import { ThreadList } from "./ThreadList";

const nestedThread: ThreadSummary = {
  id: "thread-2",
  name: "Nested Agent",
  updatedAt: 900,
};

const thread: ThreadSummary = {
  id: "thread-1",
  name: "Alpha",
  updatedAt: 1000,
};

const statusMap = {
  "thread-1": { isProcessing: false, hasUnread: true, isReviewing: false },
  "thread-2": { isProcessing: false, hasUnread: false, isReviewing: false },
};

const baseProps = {
  workspaceId: "ws-1",
  pinnedRows: [],
  unpinnedRows: [{ thread, depth: 0 }],
  totalThreadRoots: 1,
  isExpanded: false,
  nextCursor: null,
  isPaging: false,
  nested: false,
  activeWorkspaceId: "ws-1",
  activeThreadId: "thread-1",
  threadStatusById: statusMap,
  getThreadTime: () => "2m",
  isThreadPinned: () => false,
  onToggleExpanded: vi.fn(),
  onLoadOlderThreads: vi.fn(),
  onSelectThread: vi.fn(),
  onShowThreadMenu: vi.fn(),
  onReorderThreads: vi.fn(),
};

describe("ThreadList", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders active row and handles click/context menu", () => {
    const onSelectThread = vi.fn();
    const onShowThreadMenu = vi.fn();

    render(
      <ThreadList
        {...baseProps}
        onSelectThread={onSelectThread}
        onShowThreadMenu={onShowThreadMenu}
      />,
    );

    const row = screen.getByText("Alpha").closest(".thread-row");
    expect(row).toBeTruthy();
    if (!row) {
      throw new Error("Missing thread row");
    }
    expect(row.classList.contains("active")).toBe(true);
    expect(row.querySelector(".thread-status")?.className).toContain("unread");

    fireEvent.click(row);
    expect(onSelectThread).toHaveBeenCalledWith("ws-1", "thread-1");

    fireEvent.contextMenu(row);
    expect(onShowThreadMenu).toHaveBeenCalledWith(
      expect.anything(),
      "ws-1",
      "thread-1",
      true,
    );
  });

  it("emits single/cmd/ctrl+shift selection intents", () => {
    const onThreadSelectionChange = vi.fn();
    render(
      <ThreadList
        {...baseProps}
        unpinnedRows={[
          { thread: { ...thread, id: "thread-1", name: "Alpha" }, depth: 0 },
          {
            thread: { id: "thread-3", name: "Beta", updatedAt: 1100 },
            depth: 0,
          },
        ]}
        onThreadSelectionChange={onThreadSelectionChange}
      />,
    );

    const alphaRow = screen.getByText("Alpha").closest(".thread-row");
    const betaRow = screen.getByText("Beta").closest(".thread-row");
    if (!alphaRow || !betaRow) {
      throw new Error("Missing rows for selection intent test");
    }

    fireEvent.click(alphaRow);
    fireEvent.click(betaRow, { metaKey: true });
    fireEvent.click(betaRow, { ctrlKey: true, shiftKey: true });

    expect(onThreadSelectionChange).toHaveBeenNthCalledWith(1, {
      workspaceId: "ws-1",
      threadId: "thread-1",
      orderedThreadIds: ["thread-1", "thread-3"],
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
    });
    expect(onThreadSelectionChange).toHaveBeenNthCalledWith(2, {
      workspaceId: "ws-1",
      threadId: "thread-3",
      orderedThreadIds: ["thread-1", "thread-3"],
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
    });
    expect(onThreadSelectionChange).toHaveBeenNthCalledWith(3, {
      workspaceId: "ws-1",
      threadId: "thread-3",
      orderedThreadIds: ["thread-1", "thread-3"],
      metaKey: false,
      ctrlKey: true,
      shiftKey: true,
    });
  });

  it("marks selected rows as visible active state", () => {
    render(
      <ThreadList
        {...baseProps}
        activeThreadId={null}
        unpinnedRows={[
          { thread: { ...thread, id: "thread-1", name: "Alpha" }, depth: 0 },
          {
            thread: { id: "thread-3", name: "Beta", updatedAt: 1100 },
            depth: 0,
          },
        ]}
        selectedThreadIds={new Set(["thread-3"])}
      />,
    );

    const betaRow = screen.getByText("Beta").closest(".thread-row");
    expect(betaRow).toBeTruthy();
    if (!betaRow) {
      throw new Error("Missing selected row");
    }
    expect(betaRow.classList.contains("thread-row-selected")).toBe(true);
    expect(betaRow.classList.contains("active")).toBe(true);
  });

  it("shows the more button and toggles expanded", () => {
    const onToggleExpanded = vi.fn();
    render(
      <ThreadList
        {...baseProps}
        totalThreadRoots={4}
        onToggleExpanded={onToggleExpanded}
      />,
    );

    const moreButton = screen.getByRole("button", { name: "更多..." });
    fireEvent.click(moreButton);
    expect(onToggleExpanded).toHaveBeenCalledWith("ws-1");
  });

  it("loads older threads when a cursor is available", () => {
    const onLoadOlderThreads = vi.fn();
    render(
      <ThreadList
        {...baseProps}
        nextCursor="cursor"
        onLoadOlderThreads={onLoadOlderThreads}
      />,
    );

    const loadButton = screen.getByRole("button", { name: "加载更早的..." });
    fireEvent.click(loadButton);
    expect(onLoadOlderThreads).toHaveBeenCalledWith("ws-1");
  });

  it("reorders root threads before target when dropped in upper half", () => {
    const onReorderThreads = vi.fn();
    const { container } = render(
      <ThreadList
        {...baseProps}
        unpinnedRows={[
          { thread: { ...thread, id: "thread-1", name: "Alpha" }, depth: 0 },
          {
            thread: { id: "thread-3", name: "Beta", updatedAt: 1100 },
            depth: 0,
          },
        ]}
        onReorderThreads={onReorderThreads}
      />,
    );

    const rows = Array.from(container.querySelectorAll(".thread-row"));
    const alphaRow = rows.find(
      (row) => row.querySelector(".thread-name")?.textContent === "Alpha",
    );
    const betaRow = rows.find(
      (row) => row.querySelector(".thread-name")?.textContent === "Beta",
    );
    expect(alphaRow?.getAttribute("draggable")).toBe("true");
    expect(betaRow?.getAttribute("draggable")).toBe("true");

    if (!alphaRow || !betaRow) {
      throw new Error("Missing rows for drag reorder test");
    }

    vi.spyOn(betaRow, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 100,
      top: 100,
      left: 0,
      right: 240,
      bottom: 140,
      width: 240,
      height: 40,
      toJSON: () => ({}),
    });

    const dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn(),
      getData: vi.fn(),
    } as unknown as DataTransfer;

    fireEvent.dragStart(alphaRow, { dataTransfer });

    const dragOverEvent = createEvent.dragOver(betaRow, { dataTransfer });
    Object.defineProperty(dragOverEvent, "clientY", { value: 110 });
    fireEvent(betaRow, dragOverEvent);

    const dropEvent = createEvent.drop(betaRow, { dataTransfer });
    Object.defineProperty(dropEvent, "clientY", { value: 110 });
    fireEvent(betaRow, dropEvent);

    expect(onReorderThreads).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "thread-3",
      "before",
    );
  });

  it("reorders root threads after target when dropped in lower half", () => {
    const onReorderThreads = vi.fn();
    const { container } = render(
      <ThreadList
        {...baseProps}
        unpinnedRows={[
          { thread: { ...thread, id: "thread-1", name: "Alpha" }, depth: 0 },
          {
            thread: { id: "thread-3", name: "Beta", updatedAt: 1100 },
            depth: 0,
          },
        ]}
        onReorderThreads={onReorderThreads}
      />,
    );

    const rows = Array.from(container.querySelectorAll(".thread-row"));
    const alphaRow = rows.find(
      (row) => row.querySelector(".thread-name")?.textContent === "Alpha",
    );
    const betaRow = rows.find(
      (row) => row.querySelector(".thread-name")?.textContent === "Beta",
    );
    if (!alphaRow || !betaRow) {
      throw new Error("Missing rows for drag reorder test");
    }

    vi.spyOn(betaRow, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 100,
      top: 100,
      left: 0,
      right: 240,
      bottom: 140,
      width: 240,
      height: 40,
      toJSON: () => ({}),
    });

    const dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn(),
      getData: vi.fn(),
    } as unknown as DataTransfer;

    fireEvent.dragStart(alphaRow, { dataTransfer });

    const dragOverEvent = createEvent.dragOver(betaRow, { dataTransfer });
    Object.defineProperty(dragOverEvent, "clientY", { value: 135 });
    fireEvent(betaRow, dragOverEvent);

    const dropEvent = createEvent.drop(betaRow, { dataTransfer });
    Object.defineProperty(dropEvent, "clientY", { value: 135 });
    fireEvent(betaRow, dropEvent);

    expect(onReorderThreads).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "thread-3",
      "after",
    );
  });

  it("renders nested rows with indentation and disables pinning", () => {
    const onShowThreadMenu = vi.fn();
    render(
      <ThreadList
        {...baseProps}
        nested
        unpinnedRows={[
          { thread, depth: 0 },
          { thread: nestedThread, depth: 1 },
        ]}
        onShowThreadMenu={onShowThreadMenu}
      />,
    );

    const nestedRow = screen.getByText("Nested Agent").closest(".thread-row");
    expect(nestedRow).toBeTruthy();
    if (!nestedRow) {
      throw new Error("Missing nested thread row");
    }
    expect(nestedRow.className).toContain("thread-row-indent-10-1");

    fireEvent.contextMenu(nestedRow);
    expect(onShowThreadMenu).toHaveBeenCalledWith(
      expect.anything(),
      "ws-1",
      "thread-2",
      false,
    );
  });
});
