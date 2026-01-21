/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GitLogEntry } from "../../../types";
import { GitDiffPanel } from "./GitDiffPanel";

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: vi.fn(async () => ({ popup: vi.fn() })) },
  MenuItem: { new: vi.fn(async () => ({})) },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ scaleFactor: () => 1 }),
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: class LogicalPosition {
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(async () => true),
}));

const logEntries: GitLogEntry[] = [];

const baseProps = {
  mode: "diff" as const,
  onModeChange: vi.fn(),
  filePanelMode: "git" as const,
  onFilePanelModeChange: vi.fn(),
  branchName: "main",
  totalAdditions: 0,
  totalDeletions: 0,
  fileStatus: "1 file changed",
  logEntries,
  stagedFiles: [],
  unstagedFiles: [],
};

describe("GitDiffPanel", () => {
  it("enables commit when message exists and only unstaged changes", () => {
    const onCommit = vi.fn();
    render(
      <GitDiffPanel
        {...baseProps}
        commitMessage="feat: add thing"
        onCommit={onCommit}
        onGenerateCommitMessage={vi.fn()}
        unstagedFiles={[
          { path: "file.txt", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    const commitButton = screen.getByRole("button", { name: "Commit" });
    expect((commitButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(commitButton);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

});
