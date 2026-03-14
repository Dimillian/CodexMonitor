// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadChatTreePanel } from "./ThreadChatTreePanel";

afterEach(() => {
  cleanup();
});

describe("ThreadChatTreePanel", () => {
  it("opens node details and switches from the popover action", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Feature branch" }));

    expect(screen.getByText("Available branch")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    });

    expect(onSetCurrentNode).toHaveBeenCalledWith("node-b");
  });

  it("shows current branch details when selecting the active node", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Root branch" }));

    expect(screen.getByText("Current branch")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
  });

  it("disables the switch action while the tree is refreshing", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Feature branch" }));
    const switchButton = screen.getByRole("button", { name: "Switch" });

    expect(refreshButton.hasAttribute("disabled")).toBe(true);
    expect(switchButton.hasAttribute("disabled")).toBe(true);
  });
});
