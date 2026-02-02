// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IdeaEntry } from "../../../types";
import { IdeasPanel } from "./IdeasPanel";

describe("IdeasPanel", () => {
  it("hides the title line when title is empty", () => {
    const ideas: IdeaEntry[] = [
      { id: "idea-1", title: "", body: "Body only" },
    ];

    render(
      <IdeasPanel
        ideas={ideas}
        filePanelMode="ideas"
        onFilePanelModeChange={vi.fn()}
        onSendIdea={vi.fn()}
        onCreateIdea={vi.fn()}
        onUpdateIdea={vi.fn()}
        onDeleteIdea={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Body only").length).toBeGreaterThan(0);
  });

  it("sends body-only ideas", () => {
    const onSendIdea = vi.fn();
    const ideas: IdeaEntry[] = [
      { id: "idea-1", title: "", body: "Body only" },
    ];

    const { container } = render(
      <IdeasPanel
        ideas={ideas}
        filePanelMode="ideas"
        onFilePanelModeChange={vi.fn()}
        onSendIdea={onSendIdea}
        onCreateIdea={vi.fn()}
        onUpdateIdea={vi.fn()}
        onDeleteIdea={vi.fn()}
      />,
    );

    const row = container.querySelector(".prompt-row");
    if (!row) {
      throw new Error("Idea row not found");
    }
    const sendButton = row.querySelector('button[title="Send to current agent"]');
    if (!sendButton) {
      throw new Error("Send button not found");
    }
    fireEvent.click(sendButton);

    expect(onSendIdea).toHaveBeenCalledWith("Body only");
  });

  it("confirms delete before invoking callback", () => {
    const onDeleteIdea = vi.fn().mockResolvedValue(undefined);
    const ideas: IdeaEntry[] = [
      { id: "idea-1", title: "Idea", body: "Body" },
    ];

    const { container } = render(
      <IdeasPanel
        ideas={ideas}
        filePanelMode="ideas"
        onFilePanelModeChange={vi.fn()}
        onSendIdea={vi.fn()}
        onCreateIdea={vi.fn()}
        onUpdateIdea={vi.fn()}
        onDeleteIdea={onDeleteIdea}
      />,
    );

    const row = container.querySelector(".prompt-row");
    if (!row) {
      throw new Error("Idea row not found");
    }

    const deleteButton = row.querySelector('button[title="Delete idea"]');
    if (!deleteButton) {
      throw new Error("Delete button not found");
    }
    fireEvent.click(deleteButton);

    expect(onDeleteIdea).not.toHaveBeenCalled();

    const confirmButtons = row.querySelectorAll('button.idea-delete');
    const confirmButton = confirmButtons[confirmButtons.length - 1];
    fireEvent.click(confirmButton);

    expect(onDeleteIdea).toHaveBeenCalledWith("idea-1");
  });
});
