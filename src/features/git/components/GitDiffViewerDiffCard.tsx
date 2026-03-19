import { memo, useMemo } from "react";
import {
  parsePatchFiles,
  type AnnotationSide,
  type FileDiffMetadata,
  type SelectedLineRange,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import type {
  PullRequestReviewAction,
  PullRequestReviewIntent,
} from "../../../types";
import { parseDiff, type ParsedDiffLine } from "../../../utils/diff";
import { highlightLine, languageFromPath } from "../../../utils/syntax";
import { DIFF_VIEWER_SCROLL_CSS } from "../../design-system/diff/diffViewerTheme";
import { splitPath } from "./GitDiffPanel.utils";
import type {
  GitDiffViewerItem,
  LocalLineAction,
  LocalLineActionContext,
} from "./GitDiffViewer.types";
import {
  isFallbackRawDiffLineHighlightable,
  normalizePatchName,
  parseRawDiffLines,
} from "./GitDiffViewer.utils";
import { LocalActionDiffBlock } from "./LocalActionDiffBlock";

type HoveredDiffLine =
  | {
      lineNumber: number;
      side?: AnnotationSide;
      annotationSide?: AnnotationSide;
    }
  | undefined;

type FileDiffWithSourceLines = FileDiffMetadata & {
  oldLines?: string[];
  newLines?: string[];
};

function isSelectableLine(
  line: ParsedDiffLine,
): line is ParsedDiffLine & { type: "add" | "del" | "context" } {
  return line.type === "add" || line.type === "del" || line.type === "context";
}

function parseDiffForViewer(diff: string) {
  const parsed = parseDiff(diff);
  if (parsed.length > 0) {
    return parsed;
  }
  return parseRawDiffLines(diff);
}

function resolveFileDiff(
  diff: string,
  displayPath: string,
  oldLines?: string[],
  newLines?: string[],
): FileDiffWithSourceLines | null {
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
  } as FileDiffWithSourceLines;
}

function resolveParsedLineForHover(
  parsedLines: ParsedDiffLine[],
  hovered: HoveredDiffLine,
): { line: ParsedDiffLine; index: number } | null {
  if (!hovered) {
    return null;
  }
  const side = hovered.annotationSide ?? hovered.side ?? "additions";
  const lineNumber = hovered.lineNumber;

  const matchForSide = (line: ParsedDiffLine) => {
    if (!isSelectableLine(line)) {
      return false;
    }
    if (side === "deletions") {
      return line.oldLine === lineNumber;
    }
    return line.newLine === lineNumber;
  };

  let index = parsedLines.findIndex(matchForSide);
  if (index >= 0) {
    return { line: parsedLines[index], index };
  }

  index = parsedLines.findIndex(
    (line) =>
      isSelectableLine(line) &&
      (line.newLine === lineNumber || line.oldLine === lineNumber),
  );
  if (index >= 0) {
    return { line: parsedLines[index], index };
  }

  return null;
}

export type DiffCardProps = {
  entry: GitDiffViewerItem;
  isSelected: boolean;
  diffStyle: "split" | "unified";
  isLoading: boolean;
  ignoreWhitespaceChanges: boolean;
  showRevert: boolean;
  onRequestRevert?: (path: string) => void;
  interactiveSelectionEnabled: boolean;
  selectedLines?: SelectedLineRange | null;
  onSelectedLinesChange?: (range: SelectedLineRange | null) => void;
  localLineActionContext?: LocalLineActionContext | null;
  lineActionBusy?: boolean;
  onLocalChunkAction?: (action: LocalLineAction) => void;
  onComposerLineAction?: (line: ParsedDiffLine, index: number) => void;
  reviewActions?: PullRequestReviewAction[];
  onRunReviewAction?: (
    intent: PullRequestReviewIntent,
    parsedLines: ParsedDiffLine[],
    selectedLines: SelectedLineRange | null,
  ) => void | Promise<void>;
  onClearSelection?: () => void;
  pullRequestReviewLaunching?: boolean;
  pullRequestReviewThreadId?: string | null;
};

export const DiffCard = memo(function DiffCard({
  entry,
  isSelected,
  diffStyle,
  isLoading,
  ignoreWhitespaceChanges,
  showRevert,
  onRequestRevert,
  interactiveSelectionEnabled,
  selectedLines = null,
  onSelectedLinesChange,
  localLineActionContext = null,
  lineActionBusy = false,
  onLocalChunkAction,
  onComposerLineAction,
  reviewActions = [],
  onRunReviewAction,
  onClearSelection,
  pullRequestReviewLaunching = false,
  pullRequestReviewThreadId = null,
}: DiffCardProps) {
  const displayPath = entry.displayPath ?? entry.path;
  const { name: fileName, dir } = useMemo(
    () => splitPath(displayPath),
    [displayPath],
  );
  const displayDir = dir ? `${dir}/` : "";
  const fallbackLanguage = useMemo(
    () => languageFromPath(displayPath),
    [displayPath],
  );

  const parsedLines = useMemo(
    () => parseDiffForViewer(entry.diff),
    [entry.diff],
  );
  const hasSelectableLines = useMemo(
    () => parsedLines.some(isSelectableLine),
    [parsedLines],
  );
  const useInteractiveDiff = interactiveSelectionEnabled && hasSelectableLines;
  const showLocalLineActions = Boolean(
    !useInteractiveDiff && localLineActionContext && onLocalChunkAction,
  );
  const composerLineActionEnabled = Boolean(
    !useInteractiveDiff &&
      !showLocalLineActions &&
      onComposerLineAction &&
      hasSelectableLines,
  );

  const fileDiff = useMemo(
    () =>
      resolveFileDiff(entry.diff, displayPath, entry.oldLines, entry.newLines),
    [displayPath, entry.diff, entry.newLines, entry.oldLines],
  );

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
        <span className="diff-viewer-path" title={displayPath}>
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
              onRequestRevert?.(displayPath);
            }}
          >
            <RotateCcw size={14} aria-hidden />
          </button>
        )}
      </div>
      {useInteractiveDiff && selectedLines && reviewActions.length > 0 ? (
        <div
          className="diff-viewer-review-actions"
          role="toolbar"
          aria-label="PR selection actions"
        >
          {reviewActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="ghost diff-viewer-review-action"
              disabled={pullRequestReviewLaunching}
              onClick={() => {
                if (!onRunReviewAction) {
                  return;
                }
                void onRunReviewAction(action.intent, parsedLines, selectedLines);
              }}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            className="ghost diff-viewer-review-action"
            onClick={onClearSelection}
          >
            Clear
          </button>
          {pullRequestReviewThreadId ? (
            <span className="diff-viewer-review-thread">
              Last review thread: {pullRequestReviewThreadId}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="diff-viewer-output diff-viewer-output-flat">
        {showLocalLineActions && localLineActionContext ? (
          <LocalActionDiffBlock
            filePath={entry.path}
            parsedLines={parsedLines}
            diffStyle={diffStyle}
            language={fallbackLanguage}
            displayHunks={localLineActionContext.displayHunks}
            disabledReason={localLineActionContext.disabledReason}
            lineActionBusy={lineActionBusy}
            onChunkAction={(action) => {
              onLocalChunkAction?.(action);
            }}
          />
        ) : entry.diff.trim().length > 0 && fileDiff ? (
          <FileDiff
            fileDiff={fileDiff}
            options={{
              diffStyle,
              hunkSeparators: "line-info" as const,
              overflow: "scroll" as const,
              unsafeCSS: DIFF_VIEWER_SCROLL_CSS,
              disableFileHeader: true,
              enableLineSelection: useInteractiveDiff,
              onLineSelected: useInteractiveDiff ? onSelectedLinesChange : undefined,
              enableHoverUtility: composerLineActionEnabled,
            }}
            selectedLines={useInteractiveDiff ? selectedLines : null}
            renderHoverUtility={
              composerLineActionEnabled
                ? (getHoveredLine) => (
                    <button
                      type="button"
                      className="diff-viewer-line-action-button"
                      aria-label="Ask for changes on hovered line"
                      title="Ask for changes on hovered line"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const resolved = resolveParsedLineForHover(
                          parsedLines,
                          getHoveredLine() as HoveredDiffLine,
                        );
                        if (!resolved) {
                          return;
                        }
                        onComposerLineAction?.(resolved.line, resolved.index);
                      }}
                    >
                      +
                    </button>
                  )
                : undefined
            }
            style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}
          />
        ) : entry.diff.trim().length > 0 && parsedLines.length > 0 ? (
          <div className="diff-viewer-output-raw">
            {parsedLines.map((line, index) => {
              const highlighted = highlightLine(
                line.text,
                isFallbackRawDiffLineHighlightable(line.type)
                  ? fallbackLanguage
                  : null,
              );

              return (
                <div
                  key={index}
                  className={`diff-viewer-raw-line diff-viewer-raw-line-${line.type}`}
                >
                  <span
                    className="diff-line-content"
                    dangerouslySetInnerHTML={{ __html: highlighted }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="diff-viewer-placeholder">{placeholder}</div>
        )}
        {showLocalLineActions && localLineActionContext?.disabledReason ? (
          <div className="diff-viewer-line-action-hint">
            {localLineActionContext.disabledReason}
          </div>
        ) : null}
      </div>
    </div>
  );
});
