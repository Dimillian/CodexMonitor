// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadChatTreePanel } from "./ThreadChatTreePanel";

afterEach(() => {
  cleanup();
});

describe("ThreadChatTreePanel", () => {
  it("keeps desktop double-click switching behavior", async () => {
    const onSetCurrentNode = vi.fn().mockResolvedValue(true);

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

    expect(
      screen.getByText("Double-click a node to switch to that branch. Hover a node to inspect it."),
    ).toBeTruthy();

    const featureNode = screen.getByRole("button", { name: "Feature branch" });
    expect(featureNode.getAttribute("title")).toContain("Double-click to switch to this branch.");

    await act(async () => {
      fireEvent.doubleClick(featureNode);
    });

    expect(onSetCurrentNode).toHaveBeenCalledWith("node-b");
    expect(screen.queryByText("Available branch")).toBeNull();
  });

  it("opens node details and switches from the compact popover action", async () => {
    const onSetCurrentNode = vi.fn().mockResolvedValue(true);

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
        interactionMode="compact"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Feature branch" }));

    expect(screen.getByText("Available branch")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    });

    expect(onSetCurrentNode).toHaveBeenCalledWith("node-b");
  });

  it("shows current branch details in compact mode when selecting the active node", () => {
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
        interactionMode="compact"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Root branch" }));

    expect(screen.getByText("Current branch")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
  });

  it("disables the compact switch action while the tree is refreshing", () => {
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
        interactionMode="compact"
      />,
    );

    expect(
      screen.getByText("Branch switching is disabled while the thread is refreshing."),
    ).toBeTruthy();

    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    fireEvent.click(screen.getByRole("button", { name: "Feature branch" }));
    const switchButton = screen.getByRole("button", { name: "Switch" });

    expect(refreshButton.hasAttribute("disabled")).toBe(true);
    expect(switchButton.hasAttribute("disabled")).toBe(true);
  });
});
