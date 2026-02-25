import { useMemo } from "react";
import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { parseDiff } from "../../../utils/diff";
import { workerFactory } from "../../../utils/diffsWorker";
import {
  DIFF_VIEWER_HIGHLIGHTER_OPTIONS,
  DIFF_VIEWER_SCROLL_CSS,
} from "../../design-system/diff/diffViewerTheme";
import { normalizePatchName, parseRawDiffLines } from "./GitDiffViewer.utils";

type PierreDiffBlockProps = {
  diff: string;
  displayPath: string;
  oldLines?: string[];
  newLines?: string[];
  diffStyle?: "split" | "unified";
};

export function PierreDiffBlock({
  diff,
  displayPath,
  oldLines,
  newLines,
  diffStyle = "unified",
}: PierreDiffBlockProps) {
  const poolOptions = useMemo(() => ({ workerFactory }), []);
  const highlighterOptions = useMemo(
    () => DIFF_VIEWER_HIGHLIGHTER_OPTIONS,
    [],
  );

  const fileDiff = useMemo(() => {
    if (!diff.trim()) {
      return null;
    }
    const patch = parsePatchFiles(diff);
    const parsed = patch[0]?.files[0];
    if (!parsed) {
      return null;
    }
    const normalizedName = normalizePatchName(parsed.name || displayPath);
    const normalizedPrevName = parsed.prevName
      ? normalizePatchName(parsed.prevName)
      : undefined;

    return {
      ...parsed,
      name: normalizedName,
      prevName: normalizedPrevName,
      oldLines,
      newLines,
    } satisfies FileDiffMetadata;
  }, [diff, displayPath, oldLines, newLines]);

  const parsedLines = useMemo(() => {
    const parsed = parseDiff(diff);
    if (parsed.length > 0) {
      return parsed;
    }
    return parseRawDiffLines(diff);
  }, [diff]);

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

  if (!diff.trim()) {
    return <div className="diff-viewer-placeholder">Diff unavailable.</div>;
  }

  return (
    <WorkerPoolContextProvider
      poolOptions={poolOptions}
      highlighterOptions={highlighterOptions}
    >
      {fileDiff ? (
        <div className="diff-viewer-output diff-viewer-output-flat">
          <FileDiff
            fileDiff={fileDiff}
            options={diffOptions}
            style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}
          />
        </div>
      ) : (
        <div className="diff-viewer-output diff-viewer-output-flat diff-viewer-output-raw">
          {parsedLines.map((line, index) => (
            <div
              key={index}
              className={`diff-viewer-raw-line diff-viewer-raw-line-${line.type}`}
            >
              {line.text}
            </div>
          ))}
        </div>
      )}
    </WorkerPoolContextProvider>
  );
}
