// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspacePathsPrompt } from "./WorkspacePathsPrompt";

afterEach(() => {
  cleanup();
});

describe("WorkspacePathsPrompt", () => {
  it("describes input with helper text and error text", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WorkspacePathsPrompt
        value="/tmp/project"
        error={null}
        onChange={onChange}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Server paths");
    expect(input.getAttribute("aria-describedby")).toBe("workspace-paths-input-help");
    expect(input.getAttribute("autocapitalize")).toBe("off");
    expect(input.getAttribute("autocorrect")).toBe("off");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");

    rerender(
      <WorkspacePathsPrompt
        value="/tmp/project"
        error="Use absolute paths only."
        onChange={onChange}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(input.getAttribute("aria-describedby")).toBe(
      "workspace-paths-input-help workspace-paths-input-error",
    );
  });

  it("handles change, keyboard actions, and buttons", () => {
    const onChange = vi.fn();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(
      <WorkspacePathsPrompt
        value="/tmp/project"
        error={null}
        onChange={onChange}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByLabelText("Server paths");
    fireEvent.change(input, { target: { value: "/tmp/next" } });
    expect(onChange).toHaveBeenCalledWith("/tmp/next");

    fireEvent.keyDown(input, {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
    });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    const backdrop = container.querySelector(".ds-modal-backdrop");
    expect(backdrop).toBeTruthy();
    if (!backdrop) {
      throw new Error("Expected workspace paths prompt backdrop");
    }
    fireEvent.click(backdrop);

    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});
