// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSyncSelectedDiffPath } from "./useSyncSelectedDiffPath";

describe("useSyncSelectedDiffPath", () => {
  it("selects the first per-file edit when no edit is selected", () => {
    const setSelectedDiffPath = vi.fn();

    renderHook(() =>
      useSyncSelectedDiffPath({
        diffSource: "perFile",
        centerMode: "diff",
        gitPullRequestDiffs: [],
        gitCommitDiffs: [],
        perFileDiffGroups: [
          {
            path: "src/main.ts",
            edits: [
              {
                id: "src/main.ts@@item-change-1@@change-0",
                path: "src/main.ts",
                label: "Edit 1",
                status: "M",
                diff: "diff-a",
                sourceItemId: "change-1",
                additions: 1,
                deletions: 0,
              },
            ],
          },
        ],
        selectedDiffPath: null,
        setSelectedDiffPath,
      }),
    );

    expect(setSelectedDiffPath).toHaveBeenCalledWith(
      "src/main.ts@@item-change-1@@change-0",
    );
  });

  it("re-selects the first per-file edit when current selection is stale", () => {
    const setSelectedDiffPath = vi.fn();

    renderHook(() =>
      useSyncSelectedDiffPath({
        diffSource: "perFile",
        centerMode: "diff",
        gitPullRequestDiffs: [],
        gitCommitDiffs: [],
        perFileDiffGroups: [
          {
            path: "src/main.ts",
            edits: [
              {
                id: "src/main.ts@@item-change-2@@change-0",
                path: "src/main.ts",
                label: "Edit 1",
                status: "M",
                diff: "diff-a",
                sourceItemId: "change-2",
                additions: 1,
                deletions: 0,
              },
            ],
          },
        ],
        selectedDiffPath: "src/main.ts@@item-change-1@@change-0",
        setSelectedDiffPath,
      }),
    );

    expect(setSelectedDiffPath).toHaveBeenCalledWith(
      "src/main.ts@@item-change-2@@change-0",
    );
  });

  it("keeps current per-file selection when it is still valid", () => {
    const setSelectedDiffPath = vi.fn();

    renderHook(() =>
      useSyncSelectedDiffPath({
        diffSource: "perFile",
        centerMode: "diff",
        gitPullRequestDiffs: [],
        gitCommitDiffs: [],
        perFileDiffGroups: [
          {
            path: "src/main.ts",
            edits: [
              {
                id: "src/main.ts@@item-change-1@@change-0",
                path: "src/main.ts",
                label: "Edit 1",
                status: "M",
                diff: "diff-a",
                sourceItemId: "change-1",
                additions: 1,
                deletions: 0,
              },
            ],
          },
        ],
        selectedDiffPath: "src/main.ts@@item-change-1@@change-0",
        setSelectedDiffPath,
      }),
    );

    expect(setSelectedDiffPath).not.toHaveBeenCalled();
  });
});
