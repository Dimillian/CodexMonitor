/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

  it("invokes line-level stage action for local unstaged diffs", async () => {
    const onStageSelection = vi.fn();
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff: "@@ -1,1 +1,2 @@\n line one\n+new line",
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="unified"
        diffSource="local"
        unstagedPaths={["src/main.ts"]}
        onStageSelection={onStageSelection}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stage" }));

    await waitFor(() => {
      expect(onStageSelection).toHaveBeenCalledTimes(1);
      expect(onStageSelection).toHaveBeenCalledWith({
        path: "src/main.ts",
        op: "stage",
        source: "unstaged",
        lines: [
          {
            type: "add",
            oldLine: null,
            newLine: 2,
            text: "new line",
          },
        ],
      });
    });
  });

  it("enables line-level stage actions in split view", async () => {
    const onStageSelection = vi.fn();
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff: "@@ -1,1 +1,2 @@\n line one\n+new line",
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        unstagedPaths={["src/main.ts"]}
        onStageSelection={onStageSelection}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stage" }));

    await waitFor(() => {
      expect(onStageSelection).toHaveBeenCalledTimes(1);
      expect(onStageSelection).toHaveBeenCalledWith({
        path: "src/main.ts",
        op: "stage",
        source: "unstaged",
        lines: [
          {
            type: "add",
            oldLine: null,
            newLine: 2,
            text: "new line",
          },
        ],
      });
    });
  });

  it("keeps mixed files in-order and offers chunk-level stage/unstage actions", async () => {
    const onStageSelection = vi.fn();
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
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        stagedPaths={["src/main.ts"]}
        unstagedPaths={["src/main.ts"]}
        onStageSelection={onStageSelection}
      />,
    );

    expect(screen.queryByText("Staged changes")).toBeNull();
    expect(screen.queryByText("Unstaged changes")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Unstage" }));
    await waitFor(() => {
      expect(onStageSelection).toHaveBeenCalledWith({
        path: "src/main.ts",
        op: "unstage",
        source: "staged",
        lines: [
          {
            type: "add",
            oldLine: null,
            newLine: 2,
            text: "new staged line",
          },
        ],
      });
    });

    await waitFor(() => {
      expect(onStageSelection).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Stage" }));
    await waitFor(() => {
      expect(onStageSelection).toHaveBeenCalledTimes(2);
      expect(onStageSelection).toHaveBeenLastCalledWith({
        path: "src/main.ts",
        op: "stage",
        source: "unstaged",
        lines: [
          {
            type: "add",
            oldLine: null,
            newLine: 4,
            text: "new unstaged line",
          },
        ],
      });
    });
  });

  it("renders one hover target per changed chunk", async () => {
    const onStageSelection = vi.fn();
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff:
              "@@ -1,3 +1,5 @@\n line one\n+first addition\n line two\n+second addition",
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        unstagedPaths={["src/main.ts"]}
        onStageSelection={onStageSelection}
      />,
    );

    const stageButtons = screen.getAllByRole("button", { name: "Stage" });
    expect(stageButtons).toHaveLength(2);

    fireEvent.click(stageButtons[0]);
    await waitFor(() => {
      expect(onStageSelection).toHaveBeenCalledWith({
        path: "src/main.ts",
        op: "stage",
        source: "unstaged",
        lines: [
          {
            type: "add",
            oldLine: null,
            newLine: 2,
            text: "first addition",
          },
        ],
      });
    });

    fireEvent.click(stageButtons[1]);
    await waitFor(() => {
      expect(onStageSelection).toHaveBeenLastCalledWith({
        path: "src/main.ts",
        op: "stage",
        source: "unstaged",
        lines: [
          {
            type: "add",
            oldLine: null,
            newLine: 4,
            text: "second addition",
          },
        ],
      });
    });
  });

  it("stages a full contiguous changed chunk with one click", async () => {
    const onStageSelection = vi.fn();
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff:
              "@@ -1,2 +1,5 @@\n line one\n+first addition\n+second addition\n+third addition\n line two",
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        unstagedPaths={["src/main.ts"]}
        onStageSelection={onStageSelection}
      />,
    );

    const stageButtons = screen.getAllByRole("button", { name: "Stage" });
    expect(stageButtons.length).toBeGreaterThan(0);

    fireEvent.click(stageButtons[0]);
    await waitFor(() => {
      expect(onStageSelection).toHaveBeenCalledWith({
        path: "src/main.ts",
        op: "stage",
        source: "unstaged",
        lines: [
          {
            type: "add",
            oldLine: null,
            newLine: 2,
            text: "first addition",
          },
          {
            type: "add",
            oldLine: null,
            newLine: 3,
            text: "second addition",
          },
          {
            type: "add",
            oldLine: null,
            newLine: 4,
            text: "third addition",
          },
        ],
      });
    });
  });

  it("maps mixed-file chunk line coordinates to source-specific diffs", async () => {
    const onStageSelection = vi.fn();
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff:
              "@@ -1,2 +1,4 @@\n line one\n+new staged line\n line two\n+new unstaged line",
            stagedDiff: "@@ -1,1 +1,2 @@\n line one\n+new staged line",
            unstagedDiff: "@@ -1,1 +1,2 @@\n line two\n+new unstaged line",
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        stagedPaths={["src/main.ts"]}
        unstagedPaths={["src/main.ts"]}
        onStageSelection={onStageSelection}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stage" }));
    await waitFor(() => {
      expect(onStageSelection).toHaveBeenLastCalledWith({
        path: "src/main.ts",
        op: "stage",
        source: "unstaged",
        lines: [
          {
            type: "add",
            oldLine: null,
            newLine: 2,
            text: "new unstaged line",
          },
        ],
      });
    });
  });

  it("preserves empty added lines in mixed staged/unstaged chunk actions", async () => {
    const onStageSelection = vi.fn();
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff:
              "@@ -1,2 +1,5 @@\n import a\n+\n import b\n+\n+import c",
            stagedDiff: "@@ -1,1 +1,2 @@\n import a\n+",
            unstagedDiff: "@@ -3,1 +3,3 @@\n import b\n+\n+import c",
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="split"
        diffSource="local"
        stagedPaths={["src/main.ts"]}
        unstagedPaths={["src/main.ts"]}
        onStageSelection={onStageSelection}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Unstage" }));
    await waitFor(() => {
      expect(onStageSelection).toHaveBeenCalledWith({
        path: "src/main.ts",
        op: "unstage",
        source: "staged",
        lines: [
          {
            type: "add",
            oldLine: null,
            newLine: 2,
            text: "",
          },
        ],
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Stage" }));
    await waitFor(() => {
      expect(onStageSelection).toHaveBeenLastCalledWith({
        path: "src/main.ts",
        op: "stage",
        source: "unstaged",
        lines: [
          {
            type: "add",
            oldLine: null,
            newLine: 4,
            text: "",
          },
          {
            type: "add",
            oldLine: null,
            newLine: 5,
            text: "import c",
          },
        ],
      });
    });
  });
});
