/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceHomeGitInitBanner } from "./WorkspaceHomeGitInitBanner";

describe("WorkspaceHomeGitInitBanner", () => {
  it("calls onInitGitRepo when clicked", () => {
    const onInitGitRepo = vi.fn();
    render(<WorkspaceHomeGitInitBanner isLoading={false} onInitGitRepo={onInitGitRepo} />);

    fireEvent.click(screen.getByRole("button", { name: "Initialize Git" }));
    expect(onInitGitRepo).toHaveBeenCalledTimes(1);
  });

  it("disables the button when loading", () => {
    render(<WorkspaceHomeGitInitBanner isLoading={true} onInitGitRepo={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Initializing..." });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

