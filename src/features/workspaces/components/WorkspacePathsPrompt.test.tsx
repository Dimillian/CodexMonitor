// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspacePathsPrompt } from "./WorkspacePathsPrompt";

afterEach(() => {
  cleanup();
});

const browserState = {
  currentPath: "/srv/repos",
  parentPath: "/srv",
  entries: [
    {
      name: "alpha",
      path: "/srv/repos/alpha",
      isSymlink: false,
      isReadable: true,
      symlinkTarget: null,
    },
  ],
  includeHidden: false,
  isLoading: false,
  loadError: null,
  truncated: false,
  entryCount: 1,
};

describe("WorkspacePathsPrompt", () => {
  it("describes input with helper text and error text", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WorkspacePathsPrompt
        value="/tmp/project"
        error={null}
        browser={browserState}
        onChange={onChange}
        onBrowseDirectory={vi.fn()}
        onBrowseParentDirectory={vi.fn()}
        onBrowseHomeDirectory={vi.fn()}
        onRetryDirectoryListing={vi.fn()}
        onToggleHiddenDirectories={vi.fn()}
        onUseCurrentDirectory={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Absolute server paths (fallback)");
    expect(input.getAttribute("aria-describedby")).toBe("workspace-paths-input-help");
    expect(input.getAttribute("autocapitalize")).toBe("off");
    expect(input.getAttribute("autocorrect")).toBe("off");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");

    rerender(
      <WorkspacePathsPrompt
        value="/tmp/project"
        error="Use absolute paths only."
        browser={browserState}
        onChange={onChange}
        onBrowseDirectory={vi.fn()}
        onBrowseParentDirectory={vi.fn()}
        onBrowseHomeDirectory={vi.fn()}
        onRetryDirectoryListing={vi.fn()}
        onToggleHiddenDirectories={vi.fn()}
        onUseCurrentDirectory={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(input.getAttribute("aria-describedby")).toBe(
      "workspace-paths-input-help workspace-paths-input-error",
    );
  });

  it("handles change, browse actions, keyboard actions, and buttons", () => {
    const onChange = vi.fn();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const onBrowseDirectory = vi.fn();
    const onBrowseParentDirectory = vi.fn();
    const onBrowseHomeDirectory = vi.fn();
    const onToggleHiddenDirectories = vi.fn();
    const onUseCurrentDirectory = vi.fn();

    const { container } = render(
      <WorkspacePathsPrompt
        value="/tmp/project"
        error={null}
        browser={browserState}
        onChange={onChange}
        onBrowseDirectory={onBrowseDirectory}
        onBrowseParentDirectory={onBrowseParentDirectory}
        onBrowseHomeDirectory={onBrowseHomeDirectory}
        onRetryDirectoryListing={vi.fn()}
        onToggleHiddenDirectories={onToggleHiddenDirectories}
        onUseCurrentDirectory={onUseCurrentDirectory}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByLabelText("Absolute server paths (fallback)");
    fireEvent.change(input, { target: { value: "/tmp/next" } });
    expect(onChange).toHaveBeenCalledWith("/tmp/next");

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Show hidden" }));
    fireEvent.click(screen.getByRole("button", { name: "Use this folder" }));
    fireEvent.click(screen.getByRole("listitem", { name: "/srv/repos/alpha" }));

    fireEvent.keyDown(input, {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
    });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add workspace" }));

    const backdrop = container.querySelector(".ds-modal-backdrop");
    expect(backdrop).toBeTruthy();
    if (!backdrop) {
      throw new Error("Expected workspace paths prompt backdrop");
    }
    fireEvent.click(backdrop);

    expect(onBrowseHomeDirectory).toHaveBeenCalledTimes(1);
    expect(onBrowseParentDirectory).toHaveBeenCalledTimes(1);
    expect(onToggleHiddenDirectories).toHaveBeenCalledTimes(1);
    expect(onUseCurrentDirectory).toHaveBeenCalledTimes(1);
    expect(onBrowseDirectory).toHaveBeenCalledWith("/srv/repos/alpha");
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("shows retry action when directory loading fails", () => {
    const onRetryDirectoryListing = vi.fn();

    render(
      <WorkspacePathsPrompt
        value=""
        error={null}
        browser={{
          ...browserState,
          entries: [],
          loadError: "Permission denied",
        }}
        onChange={vi.fn()}
        onBrowseDirectory={vi.fn()}
        onBrowseParentDirectory={vi.fn()}
        onBrowseHomeDirectory={vi.fn()}
        onRetryDirectoryListing={onRetryDirectoryListing}
        onToggleHiddenDirectories={vi.fn()}
        onUseCurrentDirectory={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryDirectoryListing).toHaveBeenCalledTimes(1);
  });
});
