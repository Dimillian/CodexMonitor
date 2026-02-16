// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorktreePrompt } from "./WorktreePrompt";

afterEach(() => {
  cleanup();
});

const baseProps = {
  workspaceName: "Repo",
  name: "",
  branch: "feature/new-worktree",
  copyAgentsMd: false,
  setupScript: "",
  onNameChange: vi.fn(),
  onChange: vi.fn(),
  onCopyAgentsMdChange: vi.fn(),
  onSetupScriptChange: vi.fn(),
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
};

describe("WorktreePrompt", () => {
  it("guards backdrop cancel while busy", () => {
    const onCancel = vi.fn();
    const { container, rerender } = render(
      <WorktreePrompt {...baseProps} onCancel={onCancel} isBusy />,
    );

    let backdrop = container.querySelector(".ds-modal-backdrop");
    expect(backdrop).not.toBeNull();
    if (!backdrop) {
      throw new Error("Expected worktree prompt backdrop");
    }
    fireEvent.click(backdrop);
    expect(onCancel).not.toHaveBeenCalled();

    rerender(<WorktreePrompt {...baseProps} onCancel={onCancel} isBusy={false} />);
    backdrop = container.querySelector(".ds-modal-backdrop");
    if (!backdrop) {
      throw new Error("Expected worktree prompt backdrop");
    }
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("handles Escape and Enter on branch input", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <WorktreePrompt
        {...baseProps}
        onCancel={onCancel}
        onConfirm={onConfirm}
        isBusy={false}
        branchSuggestions={[]}
      />,
    );

    const branchInput = screen.getByLabelText("分支名称");
    fireEvent.keyDown(branchInput, {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
    });
    fireEvent.keyDown(branchInput, { key: "Enter" });

    return waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
      expect(onConfirm).toHaveBeenCalled();
    });
  });
});
