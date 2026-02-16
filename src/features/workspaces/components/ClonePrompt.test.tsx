// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClonePrompt } from "./ClonePrompt";

afterEach(() => {
  cleanup();
});

const baseProps = {
  workspaceName: "Repo",
  copyName: "repo-copy",
  copiesFolder: "/tmp/copies",
  suggestedCopiesFolder: "/tmp/suggested",
  onCopyNameChange: vi.fn(),
  onChooseCopiesFolder: vi.fn(),
  onUseSuggestedCopiesFolder: vi.fn(),
  onClearCopiesFolder: vi.fn(),
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
};

describe("ClonePrompt", () => {
  it("guards backdrop cancel while busy", () => {
    const onCancel = vi.fn();
    const { container, rerender } = render(
      <ClonePrompt {...baseProps} onCancel={onCancel} isBusy />,
    );

    const backdrop = container.querySelector(".ds-modal-backdrop");
    expect(backdrop).not.toBeNull();
    if (!backdrop) {
      throw new Error("Expected clone prompt backdrop");
    }
    fireEvent.click(backdrop);
    expect(onCancel).not.toHaveBeenCalled();

    rerender(<ClonePrompt {...baseProps} onCancel={onCancel} isBusy={false} />);
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("handles Escape and Enter keyboard actions", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ClonePrompt
        {...baseProps}
        onCancel={onCancel}
        onConfirm={onConfirm}
        isBusy={false}
      />,
    );

    const copyNameInput = screen.getByLabelText("副本名称");
    fireEvent.keyDown(copyNameInput, {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
    });
    fireEvent.keyDown(copyNameInput, { key: "Enter" });

    return waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
      expect(onConfirm).toHaveBeenCalled();
    });
  });
});
