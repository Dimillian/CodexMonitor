/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueuedMessage } from "../../../types";
import { ComposerQueue } from "./ComposerQueue";

const queuedItem: QueuedMessage = {
  id: "queued-1",
  text: "Add link to GitHub repo too",
  createdAt: 1,
};

describe("ComposerQueue", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens inline menu on queue item action tap", () => {
    render(<ComposerQueue queuedMessages={[queuedItem]} />);

    expect(screen.queryByText("Edit")).toBeNull();
    fireEvent.click(screen.getByLabelText("Queue item menu"));
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("calls edit callback for selected queued item", () => {
    const onEditQueued = vi.fn();
    render(<ComposerQueue queuedMessages={[queuedItem]} onEditQueued={onEditQueued} />);

    fireEvent.click(screen.getByLabelText("Queue item menu"));
    fireEvent.click(screen.getByText("Edit"));

    expect(onEditQueued).toHaveBeenCalledTimes(1);
    expect(onEditQueued).toHaveBeenCalledWith(queuedItem);
  });

  it("calls delete callback for selected queued item", () => {
    const onDeleteQueued = vi.fn();
    render(<ComposerQueue queuedMessages={[queuedItem]} onDeleteQueued={onDeleteQueued} />);

    fireEvent.click(screen.getByLabelText("Queue item menu"));
    fireEvent.click(screen.getByText("Delete"));

    expect(onDeleteQueued).toHaveBeenCalledTimes(1);
    expect(onDeleteQueued).toHaveBeenCalledWith(queuedItem.id);
  });
});
