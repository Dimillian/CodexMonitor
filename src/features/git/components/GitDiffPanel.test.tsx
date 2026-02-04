/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GitLogEntry } from "../../../types";
import { GitDiffPanel } from "./GitDiffPanel";

const menuNew = vi.hoisted(() =>
  vi.fn(async ({ items }) => ({ popup: vi.fn(), items })),
);
const menuItemNew = vi.hoisted(() => vi.fn(async (options) => options));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: menuNew },
  MenuItem: { new: menuItemNew },
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

const revealItemInDir = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
  revealItemInDir: (...args: unknown[]) => revealItemInDir(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(async () => true),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
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

  it("adds a show in finder option for file context menus", async () => {
    const { container } = render(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/repo"
        gitRoot="/tmp/repo/"
        unstagedFiles={[
          { path: "src/sample.ts", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    const row = container.querySelector(".diff-row");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row as Element);

    await waitFor(() => expect(menuNew).toHaveBeenCalled());
    const menuArgs = menuNew.mock.calls[0]?.[0];
    const revealItem = menuArgs.items.find(
      (item: { text: string }) => item.text === "Show in Finder",
    );

    expect(revealItem).toBeDefined();
    await revealItem.action();
    expect(revealItemInDir).toHaveBeenCalledWith("/tmp/repo/src/sample.ts");
  });

  it("resolves relative git roots against the workspace path", async () => {
    revealItemInDir.mockClear();
    menuNew.mockClear();
    const { container } = render(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/repo"
        gitRoot="apps"
        unstagedFiles={[
          { path: "src/sample.ts", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    const row = container.querySelector(".diff-row");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row as Element);

    await waitFor(() => expect(menuNew).toHaveBeenCalled());
    const menuArgs = menuNew.mock.calls[menuNew.mock.calls.length - 1]?.[0];
    const revealItem = menuArgs.items.find(
      (item: { text: string }) => item.text === "Show in Finder",
    );

    expect(revealItem).toBeDefined();
    await revealItem.action();
    expect(revealItemInDir).toHaveBeenCalledWith("/tmp/repo/apps/src/sample.ts");
  });
});
