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
        <span className="diff-viewer-status">{entry.status}</span>
        <span className="diff-viewer-path">{entry.path}</span>
      </div>
      {entry.diff.trim().length > 0 && fileDiff ? (
        <div className="diff-viewer-output">
          <FileDiff
            fileDiff={fileDiff}
            options={diffOptions}
            className="diff-viewer-diffs"
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
}: GitDiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrolledPathRef = useRef<string | null>(null);
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

  return (
    <WorkerPoolContextProvider
      poolOptions={poolOptions}
      highlighterOptions={highlighterOptions}
    >
      <div className="diff-viewer" ref={containerRef}>
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
                    transform: `translateY(${virtualRow.start}px)`,
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
