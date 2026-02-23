import { useCallback, useEffect, useMemo, useRef } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import GitCommitHorizontal from "lucide-react/dist/esm/icons/git-commit-horizontal";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import type { ParsedDiffLine } from "../../../utils/diff";
import { workerFactory } from "../../../utils/diffsWorker";
import type { PullRequestReviewIntent } from "../../../types";
import {
  DIFF_VIEWER_HIGHLIGHTER_OPTIONS,
} from "../../design-system/diff/diffViewerTheme";
import { ImageDiffCard } from "./ImageDiffCard";
import { splitPath } from "./GitDiffPanel.utils";
import { usePullRequestLineSelection } from "../hooks/usePullRequestLineSelection";
import { DiffCard } from "./GitDiffViewerDiffCard";
import { PullRequestSummary } from "./GitDiffViewerPullRequestSummary";
import type {
  GitDiffViewerItem,
  GitDiffViewerProps,
} from "./GitDiffViewer.types";
import { calculateDiffStats } from "./GitDiffViewer.utils";

export function GitDiffViewer({
  diffs,
  selectedPath,
  scrollRequestId,
  isLoading,
  error,
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
  onActivePathChange,
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

  const {
    clearSelection,
    selectLine,
    startDragSelection,
    updateDragSelection,
    finishDragSelection,
    selectedRangeForPath,
    buildSelectionRange,
  } = usePullRequestLineSelection();

  const poolOptions = useMemo(() => ({ workerFactory }), []);
  const highlighterOptions = useMemo(
    () => DIFF_VIEWER_HIGHLIGHTER_OPTIONS,
    [],
  );

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

  const handleRunSelectionReview = useCallback(
    async (
      intent: PullRequestReviewIntent,
      entry: GitDiffViewerItem,
      parsedLines: ParsedDiffLine[],
    ) => {
      if (!onRunPullRequestReview) {
        return;
      }
      const selection = buildSelectionRange(entry.path, entry.status, parsedLines);
      if (!selection) {
        return;
      }
      await onRunPullRequestReview({
        intent,
        selection,
      });
    },
    [buildSelectionRange, onRunPullRequestReview],
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
        className="diff-viewer ds-diff-viewer"
        ref={containerRef}
        onMouseUp={finishDragSelection}
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
                      selectedRange={selectedRangeForPath(entry.path)}
                      onLineSelect={(index, shiftKey) => {
                        selectLine(entry.path, index, shiftKey);
                      }}
                      onLineMouseDown={(index, button, shiftKey) => {
                        if (button !== 0) {
                          return;
                        }
                        startDragSelection(entry.path, index, shiftKey);
                      }}
                      onLineMouseEnter={(index) => {
                        updateDragSelection(entry.path, index);
                      }}
                      onLineMouseUp={finishDragSelection}
                      reviewActions={pullRequestReviewActions}
                      onRunReviewAction={(intent, parsedLines) => {
                        void handleRunSelectionReview(intent, entry, parsedLines);
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
