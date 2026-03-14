// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadChatTreePanel } from "./ThreadChatTreePanel";

afterEach(() => {
  cleanup();
});

describe("ThreadChatTreePanel", () => {
  it("renders graph nodes and switches on double-click", () => {
    const onSetCurrentNode = vi.fn();

    render(
      <ThreadChatTreePanel
        tree={{
          currentNodeId: "node-a",
          nodes: [
            {
              nodeId: "node-a",
              parentNodeId: null,
              summary: "Root branch",
              turnId: "turn-a",
              order: 0,
            },
            {
              nodeId: "node-b",
              parentNodeId: "node-a",
              summary: "Feature branch",
              turnId: "turn-b",
              order: 1,
            },
          ],
        }}
        isLoading={false}
        isSwitching={false}
        switchingNodeId={null}
        isProcessing={false}
        error={null}
        onReload={vi.fn()}
        onSetCurrentNode={onSetCurrentNode}
      />,
    );

    expect(screen.getByText("Chat Tree")).toBeTruthy();
    expect(screen.queryByText("Current")).toBeNull();

    const targetButton = screen.getByRole("button", { name: "Feature branch" });
    expect(targetButton.getAttribute("title")?.includes("Double-click to switch")).toBe(true);

    fireEvent.doubleClick(targetButton);

    expect(onSetCurrentNode).toHaveBeenCalledWith("node-b");
  });

  it("uses hover tooltip metadata for the current node", () => {
    render(
      <ThreadChatTreePanel
        tree={{
          currentNodeId: "node-a",
          nodes: [
            {
              nodeId: "node-a",
              parentNodeId: null,
              summary: "Root branch",
              turnId: "turn-a",
              order: 0,
            },
          ],
        }}
        isLoading={false}
        isSwitching={false}
        switchingNodeId={null}
        isProcessing={false}
        error={null}
        onReload={vi.fn()}
        onSetCurrentNode={vi.fn()}
      />,
    );

    const currentNode = screen.getByRole("button", { name: "Root branch" });
    expect(currentNode.getAttribute("title")?.includes("Current branch")).toBe(true);
  });

  it("disables branch switching while the tree is refreshing", () => {
    render(
      <ThreadChatTreePanel
        tree={{
          currentNodeId: "node-a",
          nodes: [
            {
              nodeId: "node-a",
              parentNodeId: null,
              summary: "Root branch",
              turnId: "turn-a",
              order: 0,
            },
            {
              nodeId: "node-b",
              parentNodeId: "node-a",
              summary: "Feature branch",
              turnId: "turn-b",
              order: 1,
            },
          ],
        }}
        isLoading={true}
        isSwitching={false}
        switchingNodeId={null}
        isProcessing={false}
        error={null}
        onReload={vi.fn()}
        onSetCurrentNode={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Branch switching is disabled while the thread is refreshing."),
    ).toBeTruthy();

    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    const targetButton = screen.getByRole("button", { name: "Feature branch" });

    expect(refreshButton.hasAttribute("disabled")).toBe(true);
    expect(targetButton.hasAttribute("disabled")).toBe(true);
  });
});
