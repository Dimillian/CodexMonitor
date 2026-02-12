import { useCallback, useRef, useState } from "react";
import type { PullRequestSelectionLine, PullRequestSelectionRange } from "@/types";
import type { ParsedDiffLine } from "@utils/diff";

type SelectionState = {
  path: string;
  start: number;
  end: number;
};

function normalizeRange(start: number, end: number) {
  return start <= end ? { start, end } : { start: end, end: start };
}

function isSelectable(
  line: ParsedDiffLine,
): line is ParsedDiffLine & { type: "add" | "del" | "context" } {
  return line.type === "add" || line.type === "del" || line.type === "context";
}

export function usePullRequestLineSelection() {
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const anchorRef = useRef<{ path: string; index: number } | null>(null);
  const dragRef = useRef<{ path: string; active: boolean }>({
    path: "",
    active: false,
  });
  const dragMovedRef = useRef(false);
  const suppressNextClickRef = useRef(false);

  const clearSelection = useCallback(() => {
    setSelection(null);
    anchorRef.current = null;
    dragRef.current = { path: "", active: false };
    dragMovedRef.current = false;
    suppressNextClickRef.current = false;
  }, []);

  const selectLine = useCallback(
    (path: string, index: number, shiftKey: boolean) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      if (!shiftKey || !anchorRef.current || anchorRef.current.path !== path) {
        setSelection({ path, start: index, end: index });
        anchorRef.current = { path, index };
        return;
      }
      const range = normalizeRange(anchorRef.current.index, index);
      setSelection({ path, ...range });
    },
    [],
  );

  const startDragSelection = useCallback(
    (path: string, index: number, shiftKey: boolean) => {
      dragRef.current = { path, active: true };
      dragMovedRef.current = false;
      selectLine(path, index, shiftKey);
    },
    [selectLine],
  );

  const updateDragSelection = useCallback((path: string, index: number) => {
    if (!dragRef.current.active || dragRef.current.path !== path) {
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor || anchor.path !== path) {
      return;
    }
    if (anchor.index !== index) {
      dragMovedRef.current = true;
    }
    const range = normalizeRange(anchor.index, index);
    setSelection({ path, ...range });
  }, []);

  const finishDragSelection = useCallback(() => {
    if (dragMovedRef.current) {
      suppressNextClickRef.current = true;
    }
    dragMovedRef.current = false;
    dragRef.current = { path: "", active: false };
  }, []);

  const selectedRangeForPath = useCallback(
    (path: string) => {
      if (!selection || selection.path !== path) {
        return null;
      }
      return { start: selection.start, end: selection.end };
    },
    [selection],
  );

  const buildSelectionRange = useCallback(
    (
      path: string,
      status: string,
      parsedLines: ParsedDiffLine[],
    ): PullRequestSelectionRange | null => {
      if (!selection || selection.path !== path) {
        return null;
      }
      const { start, end } = selection;
      const lines: PullRequestSelectionLine[] = parsedLines
        .slice(start, end + 1)
        .filter(isSelectable)
        .map((line) => ({
          type: line.type,
          oldLine: line.oldLine,
          newLine: line.newLine,
          text: line.text,
        }));
      if (lines.length === 0) {
        return null;
      }
      return {
        path,
        status,
        start,
        end,
        lines,
      };
    },
    [selection],
  );

  return {
    selection,
    clearSelection,
    selectLine,
    startDragSelection,
    updateDragSelection,
    finishDragSelection,
    selectedRangeForPath,
    buildSelectionRange,
  };
}
