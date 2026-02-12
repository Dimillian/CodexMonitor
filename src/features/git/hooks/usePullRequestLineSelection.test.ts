// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ParsedDiffLine } from "@utils/diff";
import { usePullRequestLineSelection } from "./usePullRequestLineSelection";

const parsedLines: ParsedDiffLine[] = [
  { type: "context", oldLine: 1, newLine: 1, text: "line one" },
  { type: "del", oldLine: 2, newLine: null, text: "line two" },
  { type: "add", oldLine: null, newLine: 2, text: "line two new" },
];

describe("usePullRequestLineSelection", () => {
  it("supports shift-click range selection", () => {
    const { result } = renderHook(() => usePullRequestLineSelection());

    act(() => {
      result.current.selectLine("src/App.tsx", 0, false);
    });
    act(() => {
      result.current.selectLine("src/App.tsx", 2, true);
    });

    expect(result.current.selectedRangeForPath("src/App.tsx")).toEqual({
      start: 0,
      end: 2,
    });
  });

  it("builds selection payload from parsed lines", () => {
    const { result } = renderHook(() => usePullRequestLineSelection());

    act(() => {
      result.current.selectLine("src/App.tsx", 0, false);
      result.current.selectLine("src/App.tsx", 1, true);
    });

    const selection = result.current.buildSelectionRange(
      "src/App.tsx",
      "M",
      parsedLines,
    );
    expect(selection?.lines).toHaveLength(2);
    expect(selection?.path).toBe("src/App.tsx");
  });

  it("keeps drag range after drag mouseup", () => {
    const { result } = renderHook(() => usePullRequestLineSelection());

    act(() => {
      result.current.startDragSelection("src/App.tsx", 0, false);
      result.current.updateDragSelection("src/App.tsx", 2);
      result.current.finishDragSelection();
      result.current.selectLine("src/App.tsx", 2, false);
    });

    expect(result.current.selectedRangeForPath("src/App.tsx")).toEqual({
      start: 0,
      end: 2,
    });
  });
});
