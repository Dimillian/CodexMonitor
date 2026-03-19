/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { GitFileDisplayHunk } from "../../../types";
import { GitDiffViewer } from "./GitDiffViewer";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 260,
      })),
    getTotalSize: () => count * 260,
    measureElement: () => {},
    scrollToIndex: () => {},
  }),
}));

vi.mock("@pierre/diffs", () => ({
  parsePatchFiles: (diff: string) =>
    diff.includes("@@")
      ? [
          {
            files: [
              {
                name: "src/main.ts",
                prevName: undefined,
                type: "change",
                hunks: [],
                splitLineCount: 0,
                unifiedLineCount: 0,
              },
            ],
          },
        ]
      : [],
}));

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: ({
    renderHoverUtility,
  }: {
    renderHoverUtility?: (
      getHoveredLine: () =>
        | { lineNumber: number; side?: "additions" | "deletions" }
        | undefined,
    ) => ReactNode;
  }) => (
    <div>
      {renderHoverUtility
        ? renderHoverUtility(() => ({ lineNumber: 2, side: "additions" }))
        : null}
    </div>
  ),
  WorkerPoolContextProvider: ({ children }: { children: ReactNode }) => children,
}));

beforeAll(() => {
  if (typeof window.ResizeObserver !== "undefined") {
    return;
  }
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver =
    ResizeObserverMock;
});

afterEach(() => {
  cleanup();
});

function displayHunk(
  id: string,
  source: "staged" | "unstaged",
  action: "stage" | "unstage",
  startDisplayLineIndex: number,
  endDisplayLineIndex: number,
  lineCount: number,
): GitFileDisplayHunk {
  return {
    id,
    source,
    action,
    startDisplayLineIndex,
    endDisplayLineIndex,
    lineCount,
  };
}

describe("GitDiffViewer", () => {
  it("inserts a diff line reference into composer when the line '+' action is clicked", () => {
    const onInsertComposerText = vi.fn();

    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts@@item-change-1@@change-0",
            displayPath: "src/main.ts",
            status: "M",
            diff: "@@ -1,1 +1,2 @@\n line one\n+added line",
          },
        ]}
        selectedPath="src/main.ts@@item-change-1@@change-0"
        isLoading={false}
        error={null}
        diffStyle="unified"
        onInsertComposerText={onInsertComposerText}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Ask for changes on hovered line" }),
    );

    expect(onInsertComposerText).toHaveBeenCalledTimes(1);
    expect(onInsertComposerText).toHaveBeenCalledWith(
      "src/main.ts:L2\n```diff\n+added line\n```\n\n",
    );
  });

  it("renders raw fallback lines instead of Diff unavailable for non-patch diffs", () => {
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts@@item-change-1@@change-0",
            displayPath: "src/main.ts",
            status: "M",
            diff: "file edited\n+added line\n-removed line",
          },
        ]}
        selectedPath="src/main.ts@@item-change-1@@change-0"
        isLoading={false}
        error={null}
      />,
    );

    expect(screen.queryByText("Diff unavailable.")).toBeNull();
    expect(screen.getByText("added line")).toBeTruthy();
    expect(screen.getByText("removed line")).toBeTruthy();

    const rawLines = Array.from(document.querySelectorAll(".diff-viewer-raw-line"));
    expect(rawLines[1]?.className).toContain("diff-viewer-raw-line-add");
    expect(rawLines[2]?.className).toContain("diff-viewer-raw-line-del");
  });

  it("applies a backend-authored unstaged display hunk in unified view", async () => {
    const onApplyDisplayHunk = vi.fn();
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff: "@@ -1,1 +1,2 @@\n line one\n+new line",
            unstagedDiff: "@@ -1,0 +2,1 @@\n+new line",
            displayHunks: [
              displayHunk("unstaged:1:0:2:1", "unstaged", "stage", 2, 2, 1),
            ],
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="unified"
        diffSource="local"
        unstagedPaths={["src/main.ts"]}
        onApplyDisplayHunk={onApplyDisplayHunk}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stage" }));

    await waitFor(() => {
      expect(onApplyDisplayHunk).toHaveBeenCalledWith({
        path: "src/main.ts",
        displayHunkId: "unstaged:1:0:2:1",
      });
    });
  });

  it("applies backend-authored display hunks in split view", async () => {
    const onApplyDisplayHunk = vi.fn();
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff: "@@ -1,1 +1,2 @@\n line one\n+new line",
            unstagedDiff: "@@ -1,0 +2,1 @@\n+new line",
            displayHunks: [
              displayHunk("unstaged:1:0:2:1", "unstaged", "stage", 2, 2, 1),
            ],
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        unstagedPaths={["src/main.ts"]}
        onApplyDisplayHunk={onApplyDisplayHunk}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stage" }));

    await waitFor(() => {
      expect(onApplyDisplayHunk).toHaveBeenCalledWith({
        path: "src/main.ts",
        displayHunkId: "unstaged:1:0:2:1",
      });
    });
  });

  it("renders split-view actions on the additions side for modified hunks", () => {
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff: "@@ -1,1 +1,1 @@\n-old line\n+new line",
            unstagedDiff: "@@ -1,1 +1,1 @@\n-old line\n+new line",
            displayHunks: [
              displayHunk("unstaged:1:1:1:1", "unstaged", "stage", 1, 2, 2),
            ],
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        unstagedPaths={["src/main.ts"]}
        onApplyDisplayHunk={vi.fn()}
      />,
    );

    const stageButtons = screen.getAllByRole("button", { name: "Stage" });
    expect(stageButtons).toHaveLength(1);
    expect(
      stageButtons[0]?.closest("[data-display-line-index]")?.getAttribute(
        "data-display-line-index",
      ),
    ).toBe("2");
    expect(stageButtons[0]?.closest(".diff-line-action-group")?.className).toContain(
      "diff-line-action-group--before-gutter",
    );
  });

  it("renders split-view actions on the deletions side for deletion-only hunks", () => {
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff: "@@ -1,1 +1,0 @@\n-old line",
            unstagedDiff: "@@ -1,1 +1,0 @@\n-old line",
            displayHunks: [
              displayHunk("unstaged:1:1:1:0", "unstaged", "stage", 1, 1, 1),
            ],
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        unstagedPaths={["src/main.ts"]}
        onApplyDisplayHunk={vi.fn()}
      />,
    );

    const stageButtons = screen.getAllByRole("button", { name: "Stage" });
    expect(stageButtons).toHaveLength(1);
    expect(
      stageButtons[0]?.closest("[data-display-line-index]")?.getAttribute(
        "data-display-line-index",
      ),
    ).toBe("1");
    expect(stageButtons[0]?.closest(".diff-line-action-group")?.className).toContain(
      "diff-line-action-group--after-gutter",
    );
  });

  it("activates addition-only split hunks when hovering the empty side", () => {
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff: "@@ -1,1 +1,2 @@\n line one\n+new line",
            unstagedDiff: "@@ -1,0 +2,1 @@\n+new line",
            displayHunks: [
              displayHunk("unstaged:1:0:2:1", "unstaged", "stage", 2, 2, 1),
            ],
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        unstagedPaths={["src/main.ts"]}
        onApplyDisplayHunk={vi.fn()}
      />,
    );

    const emptySplitLine = document.querySelector(
      '.diff-line-empty[data-display-line-index="2"]',
    );
    expect(emptySplitLine).toBeTruthy();

    fireEvent.mouseEnter(emptySplitLine as Element);

    const actionLine = document.querySelector(
      '.diff-line.has-line-action[data-display-line-index="2"]',
    );
    expect(actionLine?.className).toContain("chunk-action-visible");
  });

  it("renders both staged and unstaged actions for the mixed types.rs insertion scenario", () => {
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src-tauri/src/types.rs",
            status: "M",
            diff:
              "@@ -29,6 +29,17 @@ pub(crate) struct GitSelectionApplyResult {\n" +
              "     pub(crate) warning: Option<String>,\n" +
              " }\n" +
              " \n" +
              "+#[derive(Debug, Serialize, Deserialize, Clone)]\n" +
              "+#[serde(rename_all = \"camelCase\")]\n" +
              "+pub(crate) struct GitFileDisplayHunk {\n" +
              "+    pub(crate) id: String,\n" +
              "+    pub(crate) source: String,\n" +
              "+    pub(crate) action: String,\n" +
              "+    pub(crate) start_display_line_index: usize,\n" +
              "+    pub(crate) end_display_line_index: usize,\n" +
              "+    pub(crate) line_count: usize,\n" +
              "+}\n" +
              "+\n" +
              " #[derive(Debug, Serialize, Deserialize, Clone)]\n" +
              " pub(crate) struct GitFileDiff {\n" +
              "     pub(crate) path: String,\n" +
              "@@ -37,6 +48,8 @@ pub(crate) struct GitFileDiff {\n" +
              "     pub(crate) staged_diff: Option<String>,\n" +
              "     #[serde(default, rename = \"unstagedDiff\")]\n" +
              "     pub(crate) unstaged_diff: Option<String>,\n" +
              "+    #[serde(default, rename = \"displayHunks\")]\n" +
              "+    pub(crate) display_hunks: Vec<GitFileDisplayHunk>,\n" +
              "     #[serde(default, rename = \"oldLines\")]\n" +
              "     pub(crate) old_lines: Option<Vec<String>>,\n" +
              "     #[serde(default, rename = \"newLines\")]\n",
            stagedDiff:
              "diff --git a/src-tauri/src/types.rs b/src-tauri/src/types.rs\n" +
              "index dfcfa92..1277207 100644\n" +
              "--- a/src-tauri/src/types.rs\n" +
              "+++ b/src-tauri/src/types.rs\n" +
              "@@ -31,0 +32,11 @@ pub(crate) struct GitSelectionApplyResult {\n" +
              "+#[derive(Debug, Serialize, Deserialize, Clone)]\n" +
              "+#[serde(rename_all = \"camelCase\")]\n" +
              "+pub(crate) struct GitFileDisplayHunk {\n" +
              "+    pub(crate) id: String,\n" +
              "+    pub(crate) source: String,\n" +
              "+    pub(crate) action: String,\n" +
              "+    pub(crate) start_display_line_index: usize,\n" +
              "+    pub(crate) end_display_line_index: usize,\n" +
              "+    pub(crate) line_count: usize,\n" +
              "+}\n" +
              "+\n",
            unstagedDiff:
              "diff --git a/src-tauri/src/types.rs b/src-tauri/src/types.rs\n" +
              "index 1277207..4d7914e 100644\n" +
              "--- a/src-tauri/src/types.rs\n" +
              "+++ b/src-tauri/src/types.rs\n" +
              "@@ -50,0 +51,2 @@ pub(crate) struct GitFileDiff {\n" +
              "+    #[serde(default, rename = \"displayHunks\")]\n" +
              "+    pub(crate) display_hunks: Vec<GitFileDisplayHunk>,\n",
            displayHunks: [
              displayHunk("staged:31:0:32:11", "staged", "unstage", 4, 14, 11),
              displayHunk("unstaged:50:0:51:2", "unstaged", "stage", 22, 23, 2),
            ],
          },
        ]}
        selectedPath="src-tauri/src/types.rs"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        stagedPaths={["src-tauri/src/types.rs"]}
        unstagedPaths={["src-tauri/src/types.rs"]}
        onApplyDisplayHunk={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Unstage" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Stage" })).toHaveLength(1);

    const nonStartLine = document.querySelector('[data-display-line-index="10"]');
    const startLine = document.querySelector(
      '.diff-line.has-line-action[data-display-line-index="4"]',
    );
    expect(nonStartLine).toBeTruthy();
    expect(startLine).toBeTruthy();

    fireEvent.mouseEnter(nonStartLine as Element);
    expect(startLine?.className).toContain("chunk-action-visible");
  });

  it("keeps mixed staged and unstaged hunks in one file-ordered view", () => {
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff:
              "@@ -1,2 +1,4 @@\n line one\n+new staged line\n line two\n+new unstaged line",
            stagedDiff: "@@ -1,1 +1,2 @@\n line one\n+new staged line",
            unstagedDiff: "@@ -2,1 +3,2 @@\n line two\n+new unstaged line",
            displayHunks: [
              displayHunk("staged:1:1:1:2", "staged", "unstage", 2, 2, 1),
              displayHunk("unstaged:2:1:3:2", "unstaged", "stage", 4, 4, 1),
            ],
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        stagedPaths={["src/main.ts"]}
        unstagedPaths={["src/main.ts"]}
        onApplyDisplayHunk={vi.fn()}
      />,
    );

    expect(screen.queryByText("Staged changes")).toBeNull();
    expect(screen.queryByText("Unstaged changes")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Unstage" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Stage" })).toHaveLength(1);
    expect(screen.getByText((_, node) => node?.textContent === "new staged line")).toBeTruthy();
    expect(screen.getByText((_, node) => node?.textContent === "new unstaged line")).toBeTruthy();
  });

  it("targets the correct display hunk id for mixed staged and unstaged spans", async () => {
    const onApplyDisplayHunk = vi.fn();
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff:
              "@@ -1,2 +1,4 @@\n line one\n+new staged line\n line two\n+new unstaged line",
            stagedDiff: "@@ -1,1 +1,2 @@\n line one\n+new staged line",
            unstagedDiff: "@@ -2,1 +3,2 @@\n line two\n+new unstaged line",
            displayHunks: [
              displayHunk("staged:1:1:1:2", "staged", "unstage", 2, 2, 1),
              displayHunk("unstaged:2:1:3:2", "unstaged", "stage", 4, 4, 1),
            ],
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        stagedPaths={["src/main.ts"]}
        unstagedPaths={["src/main.ts"]}
        onApplyDisplayHunk={onApplyDisplayHunk}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Unstage" }));
    await waitFor(() => {
      expect(onApplyDisplayHunk).toHaveBeenCalledWith({
        path: "src/main.ts",
        displayHunkId: "staged:1:1:1:2",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Stage" }));
    await waitFor(() => {
      expect(onApplyDisplayHunk).toHaveBeenLastCalledWith({
        path: "src/main.ts",
        displayHunkId: "unstaged:2:1:3:2",
      });
    });
  });

  it("splits pure unstaged actions by backend display hunk boundaries", async () => {
    const onApplyDisplayHunk = vi.fn();
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff:
              "@@ -1,1 +1,6 @@\n line one\n+first addition\n+second addition\n+third addition\n+fourth addition\n+fifth addition",
            unstagedDiff:
              "@@ -1,0 +2,2 @@\n+first addition\n+second addition\n@@ -4,0 +4,3 @@\n+third addition\n+fourth addition\n+fifth addition",
            displayHunks: [
              displayHunk("unstaged:1:0:2:2", "unstaged", "stage", 2, 3, 2),
              displayHunk("unstaged:4:0:4:3", "unstaged", "stage", 4, 6, 3),
            ],
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        unstagedPaths={["src/main.ts"]}
        onApplyDisplayHunk={onApplyDisplayHunk}
      />,
    );

    const stageButtons = screen.getAllByRole("button", { name: "Stage" });
    expect(stageButtons).toHaveLength(2);

    fireEvent.click(stageButtons[0]);
    await waitFor(() => {
      expect(onApplyDisplayHunk).toHaveBeenCalledWith({
        path: "src/main.ts",
        displayHunkId: "unstaged:1:0:2:2",
      });
    });
  });

  it("keeps repeated identical additions distinct via display hunk ids", async () => {
    const onApplyDisplayHunk = vi.fn();
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff:
              "@@ -1,6 +1,12 @@\n line one\n+repeat one\n+repeat two\n+repeat three\n line two\n line three\n+repeat one\n+repeat two\n+repeat three\n line four",
            unstagedDiff:
              "@@ -1,0 +2,3 @@\n+repeat one\n+repeat two\n+repeat three\n@@ -6,0 +7,3 @@\n+repeat one\n+repeat two\n+repeat three",
            displayHunks: [
              displayHunk("unstaged:1:0:2:3", "unstaged", "stage", 2, 4, 3),
              displayHunk("unstaged:6:0:7:3", "unstaged", "stage", 7, 9, 3),
            ],
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        unstagedPaths={["src/main.ts"]}
        onApplyDisplayHunk={onApplyDisplayHunk}
      />,
    );

    const stageButtons = screen.getAllByRole("button", { name: "Stage" });
    expect(stageButtons).toHaveLength(2);

    fireEvent.click(stageButtons[0]);
    await waitFor(() => {
      expect(onApplyDisplayHunk).toHaveBeenCalledWith({
        path: "src/main.ts",
        displayHunkId: "unstaged:1:0:2:3",
      });
    });

    fireEvent.click(stageButtons[1]);
    await waitFor(() => {
      expect(onApplyDisplayHunk).toHaveBeenLastCalledWith({
        path: "src/main.ts",
        displayHunkId: "unstaged:6:0:7:3",
      });
    });
  });

  it("renders overlapping staged and unstaged actions at the same visible span", async () => {
    const onApplyDisplayHunk = vi.fn();
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff: "@@ -1,1 +1,1 @@\n-old value\n+newer value",
            stagedDiff: "@@ -1,1 +1,1 @@\n-old value\n+new value",
            unstagedDiff: "@@ -1,1 +1,1 @@\n-old value\n+newer value",
            displayHunks: [
              displayHunk("staged:1:1:1:1", "staged", "unstage", 1, 2, 2),
              displayHunk("unstaged:1:1:1:1", "unstaged", "stage", 1, 2, 2),
            ],
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        stagedPaths={["src/main.ts"]}
        unstagedPaths={["src/main.ts"]}
        onApplyDisplayHunk={onApplyDisplayHunk}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Unstage" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Stage" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Unstage" }));
    await waitFor(() => {
      expect(onApplyDisplayHunk).toHaveBeenCalledWith({
        path: "src/main.ts",
        displayHunkId: "staged:1:1:1:1",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Stage" }));
    await waitFor(() => {
      expect(onApplyDisplayHunk).toHaveBeenLastCalledWith({
        path: "src/main.ts",
        displayHunkId: "unstaged:1:1:1:1",
      });
    });
  });
});
