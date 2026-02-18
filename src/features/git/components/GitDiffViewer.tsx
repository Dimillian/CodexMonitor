import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { SelectedLineRange } from "@pierre/diffs";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import GitCommitHorizontal from "lucide-react/dist/esm/icons/git-commit-horizontal";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import type { ParsedDiffLine } from "../../../utils/diff";
import { workerFactory } from "../../../utils/diffsWorker";
import type {
  GitSelectionLine,
  PullRequestReviewIntent,
  PullRequestSelectionRange,
} from "../../../types";
import {
  DIFF_VIEWER_HIGHLIGHTER_OPTIONS,
} from "../../design-system/diff/diffViewerTheme";
import { ImageDiffCard } from "./ImageDiffCard";
import { splitPath } from "./GitDiffPanel.utils";
import { DiffCard } from "./GitDiffViewerDiffCard";
import { PullRequestSummary } from "./GitDiffViewerPullRequestSummary";
import type {
  GitDiffViewerItem,
  GitDiffViewerProps,
} from "./GitDiffViewer.types";
import { calculateDiffStats } from "./GitDiffViewer.utils";

function isSelectableLine(
  line: ParsedDiffLine,
): line is ParsedDiffLine & { type: "add" | "del" | "context" } {
  return line.type === "add" || line.type === "del" || line.type === "context";
}

function findSelectionLineIndex(
  parsedLines: ParsedDiffLine[],
  lineNumber: number,
  side: "additions" | "deletions",
  fromEnd = false,
) {
  const indices = fromEnd
    ? [...parsedLines.keys()].reverse()
    : [...parsedLines.keys()];

  for (const index of indices) {
    const line = parsedLines[index];
    if (!line || !isSelectableLine(line)) {
      continue;
    }
    if (side === "deletions" && line.oldLine === lineNumber) {
      return index;
    }
    if (side === "additions" && line.newLine === lineNumber) {
      return index;
    }
  }

  for (const index of indices) {
    const line = parsedLines[index];
    if (!line || !isSelectableLine(line)) {
      continue;
    }
    if (line.oldLine === lineNumber || line.newLine === lineNumber) {
      return index;
    }
  }

  return null;
}

function buildSelectionRangeFromLineSelection({
  path,
  status,
  parsedLines,
  selectedLines,
}: {
  path: string;
  status: string;
  parsedLines: ParsedDiffLine[];
  selectedLines: SelectedLineRange | null;
}): PullRequestSelectionRange | null {
  if (!selectedLines) {
    return null;
  }

  const startSide = selectedLines.side ?? "additions";
  const endSide = selectedLines.endSide ?? startSide;
  const startIndex = findSelectionLineIndex(
    parsedLines,
    selectedLines.start,
    startSide,
    false,
  );
  const endIndex = findSelectionLineIndex(
    parsedLines,
    selectedLines.end,
    endSide,
    true,
  );
  if (startIndex === null || endIndex === null) {
    return null;
  }

  const start = Math.min(startIndex, endIndex);
  const end = Math.max(startIndex, endIndex);
  const lines = parsedLines
    .slice(start, end + 1)
    .filter(isSelectableLine)
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
}

type LocalLineAction = {
  op: "stage" | "unstage";
  source: "unstaged" | "staged";
  disabledReason?: string;
};

export function GitDiffViewer({
  diffs,
  selectedPath,
  scrollRequestId,
  isLoading,
  error,
  diffSource = "local",
  diffStyle = "split",
  ignoreWhitespaceChanges = false,
  pullRequest,
  pullRequestComments,
  pullRequestCommentsLoading = false,
  pullRequestCommentsError = null,
  pullRequestReviewActions = [],
  onRunPullRequestReview,
  pullRequestReviewLaunching = false,
  pullRequestReviewThreadId = null,
  onCheckoutPullRequest,
  canRevert = false,
  onRevertFile,
  stagedPaths = [],
  unstagedPaths = [],
  onStageSelection,
  onActivePathChange,
  onInsertComposerText,
}: GitDiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activePathRef = useRef<string | null>(null);
  const ignoreActivePathUntilRef = useRef<number>(0);
  const lastScrollRequestIdRef = useRef<number | null>(null);
  const onActivePathChangeRef = useRef(onActivePathChange);
  const rowResizeObserversRef = useRef(new Map<Element, ResizeObserver>());
  const rowNodesByPathRef = useRef(new Map<string, HTMLDivElement>());

  const hasActivePathHandler = Boolean(onActivePathChange);
  const interactiveSelectionEnabled = Boolean(
    pullRequest &&
      diffStyle === "unified" &&
      onRunPullRequestReview &&
      pullRequestReviewActions.length > 0,
  );
  const [lineSelection, setLineSelection] = useState<{
    path: string;
    range: SelectedLineRange;
  } | null>(null);
  const [lineActionBusy, setLineActionBusy] = useState(false);

  const clearSelection = useCallback(() => {
    setLineSelection(null);
  }, []);

  const selectedLinesForPath = useCallback(
    (path: string) => {
      if (!lineSelection || lineSelection.path !== path) {
        return null;
      }
      return lineSelection.range;
    },
    [lineSelection],
  );

  const setSelectedLinesForPath = useCallback(
    (path: string, range: SelectedLineRange | null) => {
      setLineSelection((previous) => {
        if (!range) {
          if (previous?.path !== path) {
            return previous;
          }
          return null;
        }
        return { path, range };
      });
    },
    [],
  );

  const poolOptions = useMemo(() => ({ workerFactory }), []);
  const highlighterOptions = useMemo(
    () => DIFF_VIEWER_HIGHLIGHTER_OPTIONS,
    [],
  );
  const stagedPathSet = useMemo(() => new Set(stagedPaths), [stagedPaths]);
  const unstagedPathSet = useMemo(() => new Set(unstagedPaths), [unstagedPaths]);

  const indexByPath = useMemo(() => {
    const map = new Map<string, number>();
    diffs.forEach((entry, index) => {
      map.set(entry.path, index);
    });
    return map;
  }, [diffs]);

  const rowVirtualizer = useVirtualizer({
    count: diffs.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 260,
    overscan: 6,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const setRowRef = useCallback(
    (path: string) => (node: HTMLDivElement | null) => {
      const prevNode = rowNodesByPathRef.current.get(path);
      if (prevNode && prevNode !== node) {
        const prevObserver = rowResizeObserversRef.current.get(prevNode);
        if (prevObserver) {
          prevObserver.disconnect();
          rowResizeObserversRef.current.delete(prevNode);
        }
      }
      if (!node) {
        rowNodesByPathRef.current.delete(path);
        return;
      }
      rowNodesByPathRef.current.set(path, node);
      rowVirtualizer.measureElement(node);
      if (rowResizeObserversRef.current.has(node)) {
        return;
      }
      const observer = new ResizeObserver(() => {
        rowVirtualizer.measureElement(node);
      });
      observer.observe(node);
      rowResizeObserversRef.current.set(node, observer);
    },
    [rowVirtualizer],
  );

  const stickyEntry = useMemo(() => {
    if (!diffs.length) {
      return null;
    }
    if (selectedPath) {
      const index = indexByPath.get(selectedPath);
      if (index !== undefined) {
        return diffs[index];
      }
    }
    return diffs[0];
  }, [diffs, selectedPath, indexByPath]);

  const stickyPathDisplay = useMemo(() => {
    if (!stickyEntry) {
      return null;
    }
    const stickyPath = stickyEntry.displayPath ?? stickyEntry.path;
    const { name, dir } = splitPath(stickyPath);
    return { fileName: name, displayDir: dir ? `${dir}/` : "" };
  }, [stickyEntry]);

  const showRevert = canRevert && Boolean(onRevertFile);

  const resolveLocalLineAction = useCallback(
    (entry: GitDiffViewerItem): LocalLineAction | null => {
      if (diffSource !== "local" || !onStageSelection) {
        return null;
      }
      if (entry.status === "R") {
        return {
          op: "stage",
          source: "unstaged",
          disabledReason: "Line-level stage/unstage is not supported for renamed files.",
        };
      }
      const path = entry.path;
      const hasStaged = stagedPathSet.has(path);
      const hasUnstaged = unstagedPathSet.has(path);
      if (!hasStaged && !hasUnstaged) {
        return null;
      }
      if (hasStaged && hasUnstaged) {
        return {
          op: "stage",
          source: "unstaged",
          disabledReason:
            "Line-level stage/unstage is unavailable when a file has both staged and unstaged edits.",
        };
      }
      if (hasUnstaged) {
        return {
          op: "stage",
          source: "unstaged",
        };
      }
      return {
        op: "unstage",
        source: "staged",
      };
    },
    [diffSource, onStageSelection, stagedPathSet, unstagedPathSet],
  );

  const handleApplyLineAction = useCallback(
    async (path: string, action: LocalLineAction, line: ParsedDiffLine) => {
      if (!onStageSelection || action.disabledReason || lineActionBusy) {
        return;
      }
      if (line.type !== "add" && line.type !== "del") {
        return;
      }
      if (
        (line.type === "add" && line.newLine === null) ||
        (line.type === "del" && line.oldLine === null)
      ) {
        return;
      }
      setLineActionBusy(true);
      try {
        await onStageSelection({
          path,
          op: action.op,
          source: action.source,
          lines: [
            {
              type: line.type,
              oldLine: line.oldLine,
              newLine: line.newLine,
              text: line.text,
            } satisfies GitSelectionLine,
          ],
        });
      } finally {
        setLineActionBusy(false);
      }
    },
    [lineActionBusy, onStageSelection],
  );

  const handleInsertLineReference = useCallback(
    (entry: GitDiffViewerItem, line: ParsedDiffLine, index: number) => {
      if (!onInsertComposerText) {
        return;
      }
      const displayPath = entry.displayPath ?? entry.path;
      const lineNumber = line.newLine ?? line.oldLine;
      const lineLabel =
        typeof lineNumber === "number" ? `L${lineNumber}` : `line-${index + 1}`;
      const prefix = line.type === "add" ? "+" : line.type === "del" ? "-" : " ";
      const reference = `${displayPath}:${lineLabel}\n\`\`\`diff\n${prefix}${line.text}\n\`\`\`\n\n`;
      onInsertComposerText(reference);
    },
    [onInsertComposerText],
  );

  const handleRunSelectionReview = useCallback(
    async (
      intent: PullRequestReviewIntent,
      entry: GitDiffViewerItem,
      parsedLines: ParsedDiffLine[],
      selectedLines: SelectedLineRange | null,
    ) => {
      if (!onRunPullRequestReview) {
        return;
      }
      const selection = buildSelectionRangeFromLineSelection({
        path: entry.path,
        status: entry.status,
        parsedLines,
        selectedLines,
      });
      if (!selection) {
        return;
      }
      await onRunPullRequestReview({
        intent,
        selection,
      });
    },
    [onRunPullRequestReview],
  );

  const handleRequestRevert = useCallback(
    async (path: string) => {
      if (!onRevertFile) {
        return;
      }
      const confirmed = await ask(
        `Discard changes in:\n\n${path}\n\nThis cannot be undone.`,
        { title: "Discard changes", kind: "warning" },
      );
      if (!confirmed) {
        return;
      }
      await onRevertFile(path);
    },
    [onRevertFile],
  );

  useEffect(() => {
    if (!selectedPath || !scrollRequestId) {
      return;
    }
    if (lastScrollRequestIdRef.current === scrollRequestId) {
      return;
    }
    const index = indexByPath.get(selectedPath);
    if (index === undefined) {
      return;
    }
    ignoreActivePathUntilRef.current = Date.now() + 250;
    rowVirtualizer.scrollToIndex(index, { align: "start" });
    lastScrollRequestIdRef.current = scrollRequestId;
  }, [selectedPath, scrollRequestId, indexByPath, rowVirtualizer]);

  useEffect(() => {
    const observers = rowResizeObserversRef.current;
    return () => {
      for (const observer of observers.values()) {
        observer.disconnect();
      }
      observers.clear();
    };
  }, []);

  useEffect(() => {
    activePathRef.current = selectedPath;
  }, [selectedPath]);

  useEffect(() => {
    if (!interactiveSelectionEnabled) {
      clearSelection();
    }
  }, [clearSelection, interactiveSelectionEnabled]);

  useEffect(() => {
    clearSelection();
  }, [clearSelection, pullRequest?.number]);

  useEffect(() => {
    onActivePathChangeRef.current = onActivePathChange;
  }, [onActivePathChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasActivePathHandler) {
      return;
    }
    let frameId: number | null = null;

    const updateActivePath = () => {
      frameId = null;
      if (Date.now() < ignoreActivePathUntilRef.current) {
        return;
      }
      const items = rowVirtualizer.getVirtualItems();
      if (!items.length) {
        return;
      }
      const scrollTop = container.scrollTop;
      const canScroll = container.scrollHeight > container.clientHeight;
      const isAtBottom =
        canScroll &&
        scrollTop + container.clientHeight >= container.scrollHeight - 4;
      let nextPath: string | undefined;
      if (isAtBottom) {
        nextPath = diffs[diffs.length - 1]?.path;
      } else {
        const targetOffset = scrollTop + 8;
        let activeItem = items[0];
        for (const item of items) {
          if (item.start <= targetOffset) {
            activeItem = item;
          } else {
            break;
          }
        }
        nextPath = diffs[activeItem.index]?.path;
      }
      if (!nextPath || nextPath === activePathRef.current) {
        return;
      }
      activePathRef.current = nextPath;
      onActivePathChangeRef.current?.(nextPath);
    };

    const handleScroll = () => {
      if (frameId !== null) {
        return;
      }
      frameId = requestAnimationFrame(updateActivePath);
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      container.removeEventListener("scroll", handleScroll);
    };
  }, [diffs, rowVirtualizer, hasActivePathHandler]);

  const diffStats = useMemo(() => calculateDiffStats(diffs), [diffs]);

  const handleScrollToFirstFile = useCallback(() => {
    if (!diffs.length) {
      return;
    }
    const container = containerRef.current;
    const list = listRef.current;
    if (container && list) {
      const top = list.offsetTop;
      container.scrollTo({ top, behavior: "smooth" });
      return;
    }
    rowVirtualizer.scrollToIndex(0, { align: "start" });
  }, [diffs.length, rowVirtualizer]);

  const emptyStateCopy = pullRequest
    ? {
        title: "No file changes in this pull request",
        subtitle:
          "The pull request loaded, but there are no diff hunks to render for this selection.",
        hint: "Try switching to another pull request or commit from the Git panel.",
      }
    : {
        title: "Working tree is clean",
        subtitle: "No local changes were detected for the current workspace.",
        hint: "Make an edit, stage a file, or select a commit to inspect changes here.",
      };

  return (
    <WorkerPoolContextProvider
      poolOptions={poolOptions}
      highlighterOptions={highlighterOptions}
    >
      <div
        className={`diff-viewer ds-diff-viewer ${
          diffStyle === "unified" ? "is-unified" : "is-split"
        }`}
        ref={containerRef}
      >
        {pullRequest && (
          <PullRequestSummary
            pullRequest={pullRequest}
            hasDiffs={diffs.length > 0}
            diffStats={diffStats}
            onJumpToFirstFile={handleScrollToFirstFile}
            pullRequestComments={pullRequestComments}
            pullRequestCommentsLoading={pullRequestCommentsLoading}
            pullRequestCommentsError={pullRequestCommentsError}
            onCheckoutPullRequest={onCheckoutPullRequest}
          />
        )}
        {!error && stickyEntry && (
          <div className="diff-viewer-sticky">
            <div className="diff-viewer-header diff-viewer-header-sticky">
              <span
                className="diff-viewer-status"
                data-status={stickyEntry.status}
              >
                {stickyEntry.status}
              </span>
              <span
                className="diff-viewer-path"
                title={stickyEntry.displayPath ?? stickyEntry.path}
              >
                <span className="diff-viewer-name">
                  {stickyPathDisplay?.fileName ?? stickyEntry.path}
                </span>
                {stickyPathDisplay?.displayDir && (
                  <span className="diff-viewer-dir">{stickyPathDisplay.displayDir}</span>
                )}
              </span>
              {showRevert && (
                <button
                  type="button"
                  className="diff-viewer-header-action diff-viewer-header-action--discard"
                  title="Discard changes in this file"
                  aria-label="Discard changes in this file"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleRequestRevert(
                      stickyEntry.displayPath ?? stickyEntry.path,
                    );
                  }}
                >
                  <RotateCcw size={14} aria-hidden />
                </button>
              )}
            </div>
          </div>
        )}
        {error && <div className="diff-viewer-empty">{error}</div>}
        {!error && isLoading && diffs.length > 0 && (
          <div className="diff-viewer-loading diff-viewer-loading-overlay">
            Refreshing diff...
          </div>
        )}
        {!error && !isLoading && !diffs.length && (
          <div className="diff-viewer-empty-state" role="status" aria-live="polite">
            <div className="diff-viewer-empty-glow" aria-hidden />
            <span className="diff-viewer-empty-icon" aria-hidden>
              <GitCommitHorizontal size={18} />
            </span>
            <h3 className="diff-viewer-empty-title">{emptyStateCopy.title}</h3>
            <p className="diff-viewer-empty-subtitle">{emptyStateCopy.subtitle}</p>
            <p className="diff-viewer-empty-hint">{emptyStateCopy.hint}</p>
          </div>
        )}
        {!error && diffs.length > 0 && (
          <div
            className="diff-viewer-list"
            ref={listRef}
            style={{
              height: rowVirtualizer.getTotalSize(),
            }}
          >
            {virtualItems.map((virtualRow) => {
              const entry = diffs[virtualRow.index];
              const localLineAction = resolveLocalLineAction(entry);
              const shouldHandleStageSelection =
                Boolean(localLineAction) && !localLineAction?.disabledReason;
              return (
                <div
                  key={entry.path}
                  className="diff-viewer-row"
                  data-index={virtualRow.index}
                  ref={setRowRef(entry.path)}
                  style={{
                    transform: `translate3d(0, ${virtualRow.start}px, 0)`,
                  }}
                >
                  {entry.isImage ? (
                    <ImageDiffCard
                      path={entry.path}
                      status={entry.status}
                      oldImageData={entry.oldImageData}
                      newImageData={entry.newImageData}
                      oldImageMime={entry.oldImageMime}
                      newImageMime={entry.newImageMime}
                      isSelected={entry.path === selectedPath}
                      showRevert={showRevert}
                      onRequestRevert={(path) => void handleRequestRevert(path)}
                    />
                  ) : (
                    <DiffCard
                      entry={entry}
                      isSelected={entry.path === selectedPath}
                      diffStyle={diffStyle}
                      isLoading={isLoading}
                      ignoreWhitespaceChanges={ignoreWhitespaceChanges}
                      showRevert={showRevert}
                      onRequestRevert={(path) => void handleRequestRevert(path)}
                      interactiveSelectionEnabled={interactiveSelectionEnabled}
                      selectedLines={selectedLinesForPath(entry.path)}
                      onSelectedLinesChange={(range) => {
                        setSelectedLinesForPath(entry.path, range);
                      }}
                      onLineAction={
                        shouldHandleStageSelection
                          ? (line) => {
                              if (!localLineAction) {
                                return;
                              }
                              void handleApplyLineAction(entry.path, localLineAction, line);
                            }
                          : onInsertComposerText
                            ? (line, index) => {
                                handleInsertLineReference(entry, line, index);
                              }
                            : undefined
                      }
                      reviewActions={pullRequestReviewActions}
                      onRunReviewAction={(intent, parsedLines, selectedLines) => {
                        void handleRunSelectionReview(
                          intent,
                          entry,
                          parsedLines,
                          selectedLines,
                        );
                      }}
                      onClearSelection={clearSelection}
                      pullRequestReviewLaunching={pullRequestReviewLaunching}
                      pullRequestReviewThreadId={pullRequestReviewThreadId}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </WorkerPoolContextProvider>
  );
}
