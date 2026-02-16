// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RenameThreadPrompt } from "./RenameThreadPrompt";

describe("RenameThreadPrompt", () => {
  it("handles backdrop and keyboard actions", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(
      <RenameThreadPrompt
        currentName="Old name"
        name="New name"
        onChange={vi.fn()}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByLabelText("新名称");
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const backdrop = container.querySelector(".ds-modal-backdrop");
    expect(backdrop).not.toBeNull();
    if (!backdrop) {
      throw new Error("Expected rename thread backdrop");
    }
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
