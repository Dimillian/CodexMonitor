import { memo, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileDiff, WorkerPoolContextProvider } from "@pierre/diffs/react";
import type { FileDiffMetadata } from "@pierre/diffs";
import { parsePatchFiles } from "@pierre/diffs";
import { workerFactory } from "../../../utils/diffsWorker";

type GitDiffViewerItem = {
  path: string;
  status: string;
  diff: string;
};

type GitDiffViewerProps = {
  diffs: GitDiffViewerItem[];
  selectedPath: string | null;
  isLoading: boolean;
  error: string | null;
  onActivePathChange?: (path: string) => void;
};

const DIFF_SCROLL_CSS = `
[data-column-number],
[data-buffer],
[data-separator-wrapper],
[data-annotation-content] {
  position: static !important;
}

[data-buffer] {
  background-image: none !important;
}
`;

function normalizePatchName(name: string) {
  if (!name) {
    return name;
  }
  return name.replace(/^(?:a|b)\//, "");
}

type DiffCardProps = {
  entry: GitDiffViewerItem;
  isSelected: boolean;
};

const DiffCard = memo(function DiffCard({
  entry,
  isSelected,
}: DiffCardProps) {
  const diffOptions = useMemo(
    () => ({
      diffStyle: "split" as const,
      hunkSeparators: "line-info" as const,
      overflow: "scroll" as const,
      unsafeCSS: DIFF_SCROLL_CSS,
      disableFileHeader: true,
    }),
    [],
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
    } satisfies FileDiffMetadata;
  }, [entry.diff, entry.path]);

  return (
      <div
        data-diff-path={entry.path}
        className={`diff-viewer-item ${isSelected ? "active" : ""}`}
      >
      <div className="diff-viewer-header">
        <span className="diff-viewer-status" data-status={entry.status}>
          {entry.status}
        </span>
        <span className="diff-viewer-path">{entry.path}</span>
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
        <div className="diff-viewer-placeholder">Diff unavailable.</div>
      )}
    </div>
  );
});

export function GitDiffViewer({
  diffs,
  selectedPath,
  isLoading,
  error,
  onActivePathChange,
}: GitDiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrolledPathRef = useRef<string | null>(null);
  const activePathRef = useRef<string | null>(null);
  const poolOptions = useMemo(() => ({ workerFactory }), []);
  const highlighterOptions = useMemo(
    () => ({ theme: { dark: "pierre-dark", light: "pierre-light" } }),
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

  useEffect(() => {
    if (!selectedPath) {
      return;
    }
    if (lastScrolledPathRef.current === selectedPath) {
      return;
    }
    const index = indexByPath.get(selectedPath);
    if (index === undefined) {
      return;
    }
    rowVirtualizer.scrollToIndex(index, { align: "start" });
    lastScrolledPathRef.current = selectedPath;
  }, [selectedPath, indexByPath, rowVirtualizer]);

  useEffect(() => {
    activePathRef.current = selectedPath;
  }, [selectedPath]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onActivePathChange) {
      return;
    }
    let frameId: number | null = null;

    const updateActivePath = () => {
      frameId = null;
      const items = rowVirtualizer.getVirtualItems();
      if (!items.length) {
        return;
      }
      const scrollTop = container.scrollTop;
      const targetOffset = scrollTop + 8;
      let activeItem = items[0];
      for (const item of items) {
        if (item.start <= targetOffset) {
          activeItem = item;
        } else {
          break;
        }
      }
      const nextPath = diffs[activeItem.index]?.path;
      if (!nextPath || nextPath === activePathRef.current) {
        return;
      }
      activePathRef.current = nextPath;
      lastScrolledPathRef.current = nextPath;
      onActivePathChange(nextPath);
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
  }, [diffs, onActivePathChange, rowVirtualizer]);

  return (
    <WorkerPoolContextProvider
      poolOptions={poolOptions}
      highlighterOptions={highlighterOptions}
    >
      <div className="diff-viewer" ref={containerRef}>
        {!error && stickyEntry && (
          <div className="diff-viewer-sticky">
            <div className="diff-viewer-header diff-viewer-header-sticky">
              <span
                className="diff-viewer-status"
                data-status={stickyEntry.status}
              >
                {stickyEntry.status}
              </span>
              <span className="diff-viewer-path">{stickyEntry.path}</span>
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
                  ref={rowVirtualizer.measureElement}
                  style={{
                    transform: `translate3d(0, ${virtualRow.start}px, 0)`,
                  }}
                >
                  <DiffCard
                    entry={entry}
                    isSelected={entry.path === selectedPath}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </WorkerPoolContextProvider>
  );
}
