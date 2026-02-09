import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileDiff, WorkerPoolContextProvider } from "@pierre/diffs/react";
import type { FileDiffMetadata } from "@pierre/diffs";
import { parsePatchFiles } from "@pierre/diffs";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import { workerFactory } from "../../../utils/diffsWorker";
import type { GitHubPullRequest, GitHubPullRequestComment } from "../../../types";
import { formatRelativeTime } from "../../../utils/time";
import {
  DIFF_VIEWER_HIGHLIGHTER_OPTIONS,
  DIFF_VIEWER_SCROLL_CSS,
} from "../../design-system/diff/diffViewerTheme";
import { Markdown } from "../../messages/components/Markdown";
import { ImageDiffCard } from "./ImageDiffCard";
import { splitPath } from "./GitDiffPanel.utils";

type GitDiffViewerItem = {
  path: string;
  status: string;
  diff: string;
  oldLines?: string[];
  newLines?: string[];
  isImage?: boolean;
  oldImageData?: string | null;
  newImageData?: string | null;
  oldImageMime?: string | null;
  newImageMime?: string | null;
};

type GitDiffViewerProps = {
  diffs: GitDiffViewerItem[];
  selectedPath: string | null;
  scrollRequestId?: number;
  isLoading: boolean;
  error: string | null;
  diffStyle?: "split" | "unified";
  ignoreWhitespaceChanges?: boolean;
  pullRequest?: GitHubPullRequest | null;
  pullRequestComments?: GitHubPullRequestComment[];
  pullRequestCommentsLoading?: boolean;
  pullRequestCommentsError?: string | null;
  canRevert?: boolean;
  onRevertFile?: (path: string) => Promise<void> | void;
  onActivePathChange?: (path: string) => void;
};

function normalizePatchName(name: string) {
  if (!name) {
    return name;
  }
  return name.replace(/^(?:a|b)\//, "");
}

type DiffCardProps = {
  entry: GitDiffViewerItem;
  isSelected: boolean;
  diffStyle: "split" | "unified";
  isLoading: boolean;
  ignoreWhitespaceChanges: boolean;
  showRevert: boolean;
  onRequestRevert?: (path: string) => void;
};

const DiffCard = memo(function DiffCard({
  entry,
  isSelected,
  diffStyle,
  isLoading,
  ignoreWhitespaceChanges,
  showRevert,
  onRequestRevert,
}: DiffCardProps) {
  const { name: fileName, dir } = useMemo(() => splitPath(entry.path), [entry.path]);
  const displayDir = dir ? `${dir}/` : "";
  const diffOptions = useMemo(
    () => ({
      diffStyle,
      hunkSeparators: "line-info" as const,
      overflow: "scroll" as const,
      unsafeCSS: DIFF_VIEWER_SCROLL_CSS,
      disableFileHeader: true,
    }),
    [diffStyle],
  );

  const fileDiff = useMemo(() => {
    if (!entry.diff.trim()) {
      return null;
    }
    const patch = parsePatchFiles(entry.diff);
    const parsed = patch[0]?.files[0];
    if (!parsed) {
      return null;
    }
    const normalizedName = normalizePatchName(parsed.name || entry.path);
    const normalizedPrevName = parsed.prevName
      ? normalizePatchName(parsed.prevName)
      : undefined;
    return {
      ...parsed,
      name: normalizedName,
      prevName: normalizedPrevName,
      oldLines: entry.oldLines,
      newLines: entry.newLines,
    } satisfies FileDiffMetadata;
  }, [entry.diff, entry.newLines, entry.oldLines, entry.path]);

  const placeholder = useMemo(() => {
    if (isLoading) {
      return "Loading diff...";
    }
    if (ignoreWhitespaceChanges && !entry.diff.trim()) {
      return "No non-whitespace changes.";
    }
    return "Diff unavailable.";
  }, [entry.diff, ignoreWhitespaceChanges, isLoading]);

  return (
      <div
        data-diff-path={entry.path}
        className={`diff-viewer-item ${isSelected ? "active" : ""}`}
      >
      <div className="diff-viewer-header">
        <span className="diff-viewer-status" data-status={entry.status}>
          {entry.status}
        </span>
        <span className="diff-viewer-path" title={entry.path}>
          <span className="diff-viewer-name">{fileName}</span>
          {displayDir && <span className="diff-viewer-dir">{displayDir}</span>}
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
              onRequestRevert?.(entry.path);
            }}
          >
            <RotateCcw size={14} aria-hidden />
          </button>
        )}
      </div>
      {entry.diff.trim().length > 0 && fileDiff ? (
        <div className="diff-viewer-output diff-viewer-output-flat">
          <FileDiff
            fileDiff={fileDiff}
            options={diffOptions}
            style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}
          />
        </div>
      ) : (
        <div className="diff-viewer-placeholder">{placeholder}</div>
      )}
    </div>
  );
});

type PullRequestSummaryProps = {
  pullRequest: GitHubPullRequest;
  hasDiffs: boolean;
  diffStats: { additions: number; deletions: number };
  onJumpToFirstFile: () => void;
  pullRequestComments?: GitHubPullRequestComment[];
  pullRequestCommentsLoading: boolean;
  pullRequestCommentsError?: string | null;
};

const PullRequestSummary = memo(function PullRequestSummary({
  pullRequest,
  hasDiffs,
  diffStats,
  onJumpToFirstFile,
  pullRequestComments,
  pullRequestCommentsLoading,
  pullRequestCommentsError,
}: PullRequestSummaryProps) {
  const prUpdatedLabel = pullRequest.updatedAt
    ? formatRelativeTime(new Date(pullRequest.updatedAt).getTime())
    : null;
  const prAuthor = pullRequest.author?.login ?? "unknown";
  const prBody = pullRequest.body?.trim() ?? "";
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const sortedComments = useMemo(() => {
    if (!pullRequestComments?.length) {
      return [];
    }
    return [...pullRequestComments].sort((a, b) => {
      return (
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });
  }, [pullRequestComments]);
  const visibleCommentCount = 3;
  const visibleComments = isTimelineExpanded
    ? sortedComments
    : sortedComments.slice(-visibleCommentCount);
  const hiddenCommentCount = Math.max(
    0,
    sortedComments.length - visibleComments.length,
  );

  useEffect(() => {
    setIsTimelineExpanded(false);
  }, [pullRequest.number]);

  return (
    <section className="diff-viewer-pr" aria-label="Pull request summary">
      <div className="diff-viewer-pr-header">
        <div className="diff-viewer-pr-header-row">
          <div className="diff-viewer-pr-title">
            <span className="diff-viewer-pr-number">#{pullRequest.number}</span>
            <span className="diff-viewer-pr-title-text">
              {pullRequest.title}
            </span>
          </div>
          {hasDiffs && (
            <button
              type="button"
              className="ghost diff-viewer-pr-jump"
              onClick={onJumpToFirstFile}
              aria-label="Jump to first file"
            >
              <span className="diff-viewer-pr-jump-add">
                +{diffStats.additions}
              </span>
              <span className="diff-viewer-pr-jump-sep">/</span>
              <span className="diff-viewer-pr-jump-del">
                -{diffStats.deletions}
              </span>
            </button>
          )}
        </div>
        <div className="diff-viewer-pr-meta">
          <span className="diff-viewer-pr-author">@{prAuthor}</span>
          {prUpdatedLabel && (
            <>
              <span className="diff-viewer-pr-sep">·</span>
              <span>{prUpdatedLabel}</span>
            </>
          )}
          <span className="diff-viewer-pr-sep">·</span>
          <span className="diff-viewer-pr-branch">
            {pullRequest.baseRefName} ← {pullRequest.headRefName}
          </span>
          {pullRequest.isDraft && (
            <span className="diff-viewer-pr-pill">Draft</span>
          )}
        </div>
      </div>
      <div className="diff-viewer-pr-body">
        {prBody ? (
          <Markdown
            value={prBody}
            className="diff-viewer-pr-markdown markdown"
          />
        ) : (
          <div className="diff-viewer-pr-empty">No description provided.</div>
        )}
      </div>
      <div className="diff-viewer-pr-timeline">
        <div className="diff-viewer-pr-timeline-header">
          <span className="diff-viewer-pr-timeline-title">Activity</span>
          <span className="diff-viewer-pr-timeline-count">
            {sortedComments.length} comment
            {sortedComments.length === 1 ? "" : "s"}
          </span>
          {hiddenCommentCount > 0 && (
            <button
              type="button"
              className="ghost diff-viewer-pr-timeline-button"
              onClick={() => setIsTimelineExpanded(true)}
            >
              Show all
            </button>
          )}
          {isTimelineExpanded &&
            sortedComments.length > visibleCommentCount && (
              <button
                type="button"
                className="ghost diff-viewer-pr-timeline-button"
                onClick={() => setIsTimelineExpanded(false)}
              >
                Collapse
              </button>
            )}
        </div>
        <div className="diff-viewer-pr-timeline-list">
          {pullRequestCommentsLoading && (
            <div className="diff-viewer-pr-timeline-state">
              Loading comments…
            </div>
          )}
          {pullRequestCommentsError && (
            <div className="diff-viewer-pr-timeline-state diff-viewer-pr-timeline-error">
              {pullRequestCommentsError}
            </div>
          )}
          {!pullRequestCommentsLoading &&
            !pullRequestCommentsError &&
            !sortedComments.length && (
              <div className="diff-viewer-pr-timeline-state">
                No comments yet.
              </div>
            )}
          {hiddenCommentCount > 0 && !isTimelineExpanded && (
            <div className="diff-viewer-pr-timeline-divider">
              {hiddenCommentCount} earlier comment
              {hiddenCommentCount === 1 ? "" : "s"}
            </div>
          )}
          {visibleComments.map((comment) => {
            const commentAuthor = comment.author?.login ?? "unknown";
            const commentTime = formatRelativeTime(
              new Date(comment.createdAt).getTime(),
            );
            return (
              <div key={comment.id} className="diff-viewer-pr-timeline-item">
                <div className="diff-viewer-pr-timeline-marker" />
                <div className="diff-viewer-pr-timeline-content">
                  <div className="diff-viewer-pr-timeline-meta">
                    <span className="diff-viewer-pr-timeline-author">
                      @{commentAuthor}
                    </span>
                    <span className="diff-viewer-pr-sep">·</span>
                    <span>{commentTime}</span>
                  </div>
                  {comment.body.trim() ? (
                    <Markdown
                      value={comment.body}
                      className="diff-viewer-pr-comment markdown"
                    />
                  ) : (
                    <div className="diff-viewer-pr-timeline-text">
                      No comment body.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
});

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
    const { name, dir } = splitPath(stickyEntry.path);
    return { fileName: name, displayDir: dir ? `${dir}/` : "" };
  }, [stickyEntry]);

  const showRevert = canRevert && Boolean(onRevertFile);
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

  const diffStats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const entry of diffs) {
      const lines = entry.diff.split("\n");
      for (const line of lines) {
        if (!line) {
          continue;
        }
        if (
          line.startsWith("+++")
          || line.startsWith("---")
          || line.startsWith("diff --git")
          || line.startsWith("@@")
          || line.startsWith("index ")
          || line.startsWith("\\ No newline")
        ) {
          continue;
        }
        if (line.startsWith("+")) {
          additions += 1;
        } else if (line.startsWith("-")) {
          deletions += 1;
        }
      }
    }
    return { additions, deletions };
  }, [diffs]);
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

  return (
    <WorkerPoolContextProvider
      poolOptions={poolOptions}
      highlighterOptions={highlighterOptions}
    >
      <div className="diff-viewer ds-diff-viewer" ref={containerRef}>
        {pullRequest && (
          <PullRequestSummary
            pullRequest={pullRequest}
            hasDiffs={diffs.length > 0}
            diffStats={diffStats}
            onJumpToFirstFile={handleScrollToFirstFile}
            pullRequestComments={pullRequestComments}
            pullRequestCommentsLoading={pullRequestCommentsLoading}
            pullRequestCommentsError={pullRequestCommentsError}
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
              <span className="diff-viewer-path" title={stickyEntry.path}>
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
                    void handleRequestRevert(stickyEntry.path);
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
          <div className="diff-viewer-empty">No changes detected.</div>
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
