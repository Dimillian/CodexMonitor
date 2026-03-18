import { useMemo, useState, type MouseEvent } from "react";
import type { GitSelectionLine } from "../../../types";
import { parseDiff, type ParsedDiffLine } from "../../../utils/diff";
import { highlightLine } from "../../../utils/syntax";
import type {
  LocalLineAction,
  LocalLineActionContext,
} from "./GitDiffViewer.types";
import { parseRawDiffLines } from "./GitDiffViewer.utils";

type SplitLineEntry = {
  line: ParsedDiffLine;
  index: number;
};

type SplitRow =
  | { type: "meta"; line: ParsedDiffLine }
  | { type: "content"; left: SplitLineEntry | null; right: SplitLineEntry | null };

type ChangeChunk = {
  id: string;
  startIndex: number;
  lineIndices: number[];
  lines: GitSelectionLine[];
  isStaged: boolean;
  action: LocalLineAction;
};

type ChunkMeta = {
  isChunkStart: boolean;
  chunk?: ChangeChunk;
  isStaged: boolean;
};

type SelectionSource = "staged" | "unstaged";

type SourceMappedLine = {
  source: SelectionSource;
  line: GitSelectionLine;
};

type LocalActionDiffBlockProps = {
  parsedLines: ParsedDiffLine[];
  diffStyle: "split" | "unified";
  language?: string | null;
  context: LocalLineActionContext;
  lineActionBusy?: boolean;
  onChunkAction?: (lines: GitSelectionLine[], action: LocalLineAction) => void;
};

function isHighlightableLine(line: ParsedDiffLine) {
  return line.type === "add" || line.type === "del" || line.type === "context";
}

function isChangeLine(
  line: ParsedDiffLine,
): line is ParsedDiffLine & { type: "add" | "del" } {
  return line.type === "add" || line.type === "del";
}

function parseDiffForViewer(diff: string) {
  const parsed = parseDiff(diff);
  if (parsed.length > 0) {
    return parsed;
  }
  return parseRawDiffLines(diff);
}

function buildSplitRows(parsed: ParsedDiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let pendingDel: SplitLineEntry[] = [];
  let pendingAdd: SplitLineEntry[] = [];

  const flushPending = () => {
    if (pendingDel.length === 0 && pendingAdd.length === 0) {
      return;
    }
    const maxLen = Math.max(pendingDel.length, pendingAdd.length);
    for (let index = 0; index < maxLen; index += 1) {
      rows.push({
        type: "content",
        left: pendingDel[index] ?? null,
        right: pendingAdd[index] ?? null,
      });
    }
    pendingDel = [];
    pendingAdd = [];
  };

  parsed.forEach((line, index) => {
    if (line.type === "del") {
      pendingDel.push({ line, index });
      return;
    }
    if (line.type === "add") {
      pendingAdd.push({ line, index });
      return;
    }
    flushPending();
    if (line.type === "context") {
      rows.push({
        type: "content",
        left: { line, index },
        right: { line, index },
      });
      return;
    }
    rows.push({ type: "meta", line });
  });
  flushPending();

  return rows;
}

function buildGitLineSignature(line: GitSelectionLine) {
  return `${line.type}:${line.oldLine ?? "null"}:${line.newLine ?? "null"}:${line.text}`;
}

function buildGitLinePrimaryKey(line: GitSelectionLine) {
  const primary = line.type === "add" ? line.newLine : line.oldLine;
  return `${line.type}:${primary ?? "null"}:${line.text}`;
}

function buildGitLineFuzzyKey(line: GitSelectionLine) {
  return `${line.type}:${line.text}`;
}

function primaryLineNumber(line: GitSelectionLine) {
  return line.type === "add" ? line.newLine : line.oldLine;
}

function toGitSelectionLine(
  line: ParsedDiffLine & { type: "add" | "del" },
): GitSelectionLine {
  return {
    type: line.type,
    oldLine: line.oldLine,
    newLine: line.newLine,
    text: line.text,
  };
}

type IndexedSourceLines = {
  lines: GitSelectionLine[];
  cursor: number;
  exactBuckets: Map<string, number[]>;
  primaryBuckets: Map<string, number[]>;
  fuzzyBuckets: Map<string, number[]>;
  exactPointers: Map<string, number>;
  primaryPointers: Map<string, number>;
  fuzzyPointers: Map<string, number>;
};

type SourceMatchCandidate = {
  source: SelectionSource;
  lineIndex: number;
  line: GitSelectionLine;
  score: number;
  lineDistance: number;
  cursorDistance: number;
};

function pushBucketIndex(
  buckets: Map<string, number[]>,
  key: string,
  lineIndex: number,
) {
  const existing = buckets.get(key);
  if (existing) {
    existing.push(lineIndex);
  } else {
    buckets.set(key, [lineIndex]);
  }
}

function buildIndexedSourceLines(lines: GitSelectionLine[]): IndexedSourceLines {
  const exactBuckets = new Map<string, number[]>();
  const primaryBuckets = new Map<string, number[]>();
  const fuzzyBuckets = new Map<string, number[]>();

  lines.forEach((line, lineIndex) => {
    pushBucketIndex(exactBuckets, buildGitLineSignature(line), lineIndex);
    pushBucketIndex(primaryBuckets, buildGitLinePrimaryKey(line), lineIndex);
    pushBucketIndex(fuzzyBuckets, buildGitLineFuzzyKey(line), lineIndex);
  });

  return {
    lines,
    cursor: 0,
    exactBuckets,
    primaryBuckets,
    fuzzyBuckets,
    exactPointers: new Map(),
    primaryPointers: new Map(),
    fuzzyPointers: new Map(),
  };
}

function nextBucketIndex(
  buckets: Map<string, number[]>,
  pointers: Map<string, number>,
  key: string,
  cursor: number,
) {
  const indices = buckets.get(key);
  if (!indices || !indices.length) {
    return null;
  }
  let pointer = pointers.get(key) ?? 0;
  while (pointer < indices.length && indices[pointer] < cursor) {
    pointer += 1;
  }
  pointers.set(key, pointer);
  if (pointer >= indices.length) {
    return null;
  }
  return indices[pointer];
}

function buildSourceMatchCandidate(
  source: SelectionSource,
  selectedLine: GitSelectionLine,
  sourceLines: IndexedSourceLines,
) {
  const exactIndex = nextBucketIndex(
    sourceLines.exactBuckets,
    sourceLines.exactPointers,
    buildGitLineSignature(selectedLine),
    sourceLines.cursor,
  );
  const primaryIndex = nextBucketIndex(
    sourceLines.primaryBuckets,
    sourceLines.primaryPointers,
    buildGitLinePrimaryKey(selectedLine),
    sourceLines.cursor,
  );
  const fuzzyIndex = nextBucketIndex(
    sourceLines.fuzzyBuckets,
    sourceLines.fuzzyPointers,
    buildGitLineFuzzyKey(selectedLine),
    sourceLines.cursor,
  );

  const index =
    exactIndex ?? primaryIndex ?? fuzzyIndex;
  if (index === null) {
    return null;
  }
  const line = sourceLines.lines[index];
  const score = index === exactIndex ? 0 : index === primaryIndex ? 1 : 2;
  const selectedPrimary = primaryLineNumber(selectedLine);
  const candidatePrimary = primaryLineNumber(line);
  const lineDistance =
    typeof selectedPrimary === "number" && typeof candidatePrimary === "number"
      ? Math.abs(selectedPrimary - candidatePrimary)
      : Number.MAX_SAFE_INTEGER;
  return {
    source,
    lineIndex: index,
    line,
    score,
    lineDistance,
    cursorDistance: index - sourceLines.cursor,
  } satisfies SourceMatchCandidate;
}

function choosePreferredSourceCandidate(
  stagedCandidate: SourceMatchCandidate | null,
  unstagedCandidate: SourceMatchCandidate | null,
  previousSource: SelectionSource | null,
) {
  if (!stagedCandidate) {
    return unstagedCandidate;
  }
  if (!unstagedCandidate) {
    return stagedCandidate;
  }
  if (stagedCandidate.score !== unstagedCandidate.score) {
    return stagedCandidate.score < unstagedCandidate.score
      ? stagedCandidate
      : unstagedCandidate;
  }
  if (stagedCandidate.lineDistance !== unstagedCandidate.lineDistance) {
    return stagedCandidate.lineDistance < unstagedCandidate.lineDistance
      ? stagedCandidate
      : unstagedCandidate;
  }
  if (stagedCandidate.cursorDistance !== unstagedCandidate.cursorDistance) {
    return stagedCandidate.cursorDistance < unstagedCandidate.cursorDistance
      ? stagedCandidate
      : unstagedCandidate;
  }
  if (previousSource) {
    if (stagedCandidate.source === previousSource) {
      return stagedCandidate;
    }
    if (unstagedCandidate.source === previousSource) {
      return unstagedCandidate;
    }
  }
  return stagedCandidate.lineIndex <= unstagedCandidate.lineIndex
    ? stagedCandidate
    : unstagedCandidate;
}

function buildSourceMappedLines(
  parsedLines: ParsedDiffLine[],
  context: LocalLineActionContext,
  stagedSourceLines: GitSelectionLine[],
  unstagedSourceLines: GitSelectionLine[],
) {
  const mappedByIndex = new Map<number, SourceMappedLine>();
  const stagedLookup = buildIndexedSourceLines(stagedSourceLines);
  const unstagedLookup = buildIndexedSourceLines(unstagedSourceLines);
  let previousSource: SelectionSource | null = null;

  parsedLines.forEach((line, index) => {
    if (!isChangeLine(line)) {
      return;
    }
    const selectedLine = toGitSelectionLine(line);
    const stagedCandidate = context.hasStaged
      ? buildSourceMatchCandidate("staged", selectedLine, stagedLookup)
      : null;
    const unstagedCandidate = context.hasUnstaged
      ? buildSourceMatchCandidate("unstaged", selectedLine, unstagedLookup)
      : null;
    const chosen =
      choosePreferredSourceCandidate(
        stagedCandidate,
        unstagedCandidate,
        previousSource,
      ) ??
      (context.hasStaged && !context.hasUnstaged
        ? ({
            source: "staged" as const,
            lineIndex: -1,
            line: selectedLine,
          } satisfies Pick<SourceMatchCandidate, "source" | "lineIndex" | "line">)
        : context.hasUnstaged && !context.hasStaged
          ? ({
              source: "unstaged" as const,
              lineIndex: -1,
              line: selectedLine,
            } satisfies Pick<SourceMatchCandidate, "source" | "lineIndex" | "line">)
          : null);

    if (!chosen) {
      return;
    }

    if (chosen.lineIndex >= 0) {
      if (chosen.source === "staged") {
        stagedLookup.cursor = chosen.lineIndex + 1;
      } else {
        unstagedLookup.cursor = chosen.lineIndex + 1;
      }
    }

    mappedByIndex.set(index, {
      source: chosen.source,
      line: chosen.line,
    });
    previousSource = chosen.source;
  });

  return mappedByIndex;
}

function buildChunks(
  parsedLines: ParsedDiffLine[],
  sourceLineByIndex: Map<number, SourceMappedLine>,
  disabledReason?: string,
) {
  const stageActionBase: LocalLineAction = {
    op: "stage",
    source: "unstaged",
    label: "Stage",
    title: "Stage this chunk",
    disabledReason,
  };
  const unstageActionBase: LocalLineAction = {
    op: "unstage",
    source: "staged",
    label: "Unstage",
    title: "Unstage this chunk",
    disabledReason,
  };
  const chunkMetaByIndex = new Map<number, ChunkMeta>();
  const chunks: ChangeChunk[] = [];
  let current: ChangeChunk | null = null;
  let currentStaged = false;

  const flush = () => {
    if (!current) {
      return;
    }
    chunks.push(current);
    current = null;
  };

  parsedLines.forEach((line, index) => {
    if (!isChangeLine(line)) {
      flush();
      return;
    }

    const sourceMapped = sourceLineByIndex.get(index);
    if (!sourceMapped) {
      flush();
      return;
    }
    const isStaged = sourceMapped.source === "staged";
    const gitLine = sourceMapped.line;

    if (!current || currentStaged !== isStaged) {
      flush();
      currentStaged = isStaged;
      current = {
        id: `chunk-${index}`,
        startIndex: index,
        lineIndices: [index],
        lines: [gitLine],
        isStaged,
        action: isStaged ? unstageActionBase : stageActionBase,
      };
      chunkMetaByIndex.set(index, {
        isChunkStart: true,
        chunk: current,
        isStaged,
      });
      return;
    }

    current.lineIndices.push(index);
    current.lines.push(gitLine);
    chunkMetaByIndex.set(index, {
      isChunkStart: false,
      chunk: current,
      isStaged,
    });
  });

  flush();

  return { chunks, chunkMetaByIndex };
}

export function LocalActionDiffBlock({
  parsedLines,
  diffStyle,
  language,
  context,
  lineActionBusy = false,
  onChunkAction,
}: LocalActionDiffBlockProps) {
  const [hoveredChunkId, setHoveredChunkId] = useState<string | null>(null);
  const splitRows = useMemo(
    () => (diffStyle === "split" ? buildSplitRows(parsedLines) : []),
    [diffStyle, parsedLines],
  );

  const stagedSourceLines = useMemo(
    () =>
      context.stagedDiff?.trim()
        ? parseDiffForViewer(context.stagedDiff)
            .filter(isChangeLine)
            .map(toGitSelectionLine)
        : context.hasStaged && !context.hasUnstaged
          ? parsedLines.filter(isChangeLine).map(toGitSelectionLine)
        : [],
    [context.hasStaged, context.hasUnstaged, context.stagedDiff, parsedLines],
  );
  const unstagedSourceLines = useMemo(
    () =>
      context.unstagedDiff?.trim()
        ? parseDiffForViewer(context.unstagedDiff)
            .filter(isChangeLine)
            .map(toGitSelectionLine)
        : context.hasUnstaged && !context.hasStaged
          ? parsedLines.filter(isChangeLine).map(toGitSelectionLine)
        : [],
    [context.hasStaged, context.hasUnstaged, context.unstagedDiff, parsedLines],
  );

  const sourceLineByIndex = useMemo(
    () =>
      buildSourceMappedLines(
        parsedLines,
        context,
        stagedSourceLines,
        unstagedSourceLines,
      ),
    [context, parsedLines, stagedSourceLines, unstagedSourceLines],
  );

  const { chunkMetaByIndex } = useMemo(
    () => buildChunks(parsedLines, sourceLineByIndex, context.disabledReason),
    [context.disabledReason, parsedLines, sourceLineByIndex],
  );

  const renderLine = (
    line: ParsedDiffLine,
    index: number,
    side?: "left" | "right",
    mirroredChunk?: ChangeChunk,
  ) => {
    const shouldHighlight = isHighlightableLine(line);
    const html = highlightLine(line.text, shouldHighlight ? language : null);
    const chunkMeta = chunkMetaByIndex.get(index);
    const chunk = mirroredChunk ?? chunkMeta?.chunk;
    const shouldRenderAction = Boolean(
      mirroredChunk || (chunkMeta?.isChunkStart && chunkMeta?.chunk),
    );
    const isChunkActive = Boolean(chunk && hoveredChunkId === chunk.id);
    const isStaged = Boolean(chunkMeta?.isStaged);
    const actionHardDisabled = Boolean(chunk?.action.disabledReason) || !chunk;
    const actionBlocked = lineActionBusy || actionHardDisabled;
    const lineClassName = `diff-line diff-line-${line.type}${
      shouldRenderAction ? " has-line-action" : ""
    }${shouldRenderAction && isChunkActive ? " chunk-action-visible" : ""}${
      isStaged ? " diff-line-staged" : ""
    }`;

    return (
      <div
        className={lineClassName}
        data-has-gutter="true"
        data-chunk-id={chunk?.id}
      >
        <div className="diff-gutter">
          <span className="diff-line-number">
            {side === "right" ? "" : (line.oldLine ?? "")}
          </span>
          <span className="diff-line-number">
            {side === "left" ? "" : (line.newLine ?? "")}
          </span>
        </div>
        <span className="diff-line-content" dangerouslySetInnerHTML={{ __html: html }} />
        {shouldRenderAction && chunk ? (
          <button
            type="button"
            className={`diff-line-action${
              chunk.action.op === "unstage" ? " diff-line-action--unstage" : ""
            }${
              side === "left" ? " diff-line-action--after-gutter" : ""
            }${
              side === "right" ? " diff-line-action--before-gutter" : ""
            }`}
            aria-label={chunk.action.label}
            title={chunk.action.disabledReason ?? chunk.action.title}
            aria-disabled={actionBlocked}
            disabled={actionHardDisabled}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (actionBlocked) {
                return;
              }
              onChunkAction?.(chunk.lines, chunk.action);
            }}
          >
            {chunk.action.op === "unstage" ? "-" : "+"}
          </button>
        ) : null}
      </div>
    );
  };

  if (diffStyle === "split") {
    const handleChunkPointerMove = (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const chunkNode = target.closest<HTMLElement>("[data-chunk-id]");
      const nextChunkId = chunkNode?.dataset.chunkId ?? null;
      setHoveredChunkId((current) => (current === nextChunkId ? current : nextChunkId));
    };

    return (
      <div
        className="diff-split-block"
        onMouseMove={handleChunkPointerMove}
        onMouseLeave={() => {
          setHoveredChunkId(null);
        }}
      >
        {splitRows.map((row, rowIndex) => {
          if (row.type === "meta") {
            const metaClass =
              row.line.type === "hunk" ? "diff-line-hunk" : "diff-line-meta";
            return (
              <div key={`meta-${rowIndex}`} className={`diff-split-meta ${metaClass}`}>
                {row.line.text}
              </div>
            );
          }
          const leftMeta = row.left
            ? chunkMetaByIndex.get(row.left.index)
            : undefined;
          const rightMeta = row.right
            ? chunkMetaByIndex.get(row.right.index)
            : undefined;
          const mirroredChunk =
            leftMeta?.chunk &&
            rightMeta?.chunk &&
            leftMeta.chunk.id === rightMeta.chunk.id &&
            (leftMeta.isChunkStart || rightMeta.isChunkStart)
              ? leftMeta.chunk
              : undefined;
          return (
            <div key={`row-${rowIndex}`} className="diff-split-row">
              {row.left ? (
                renderLine(
                  row.left.line,
                  row.left.index,
                  "left",
                  mirroredChunk,
                )
              ) : (
                <div className="diff-line diff-line-context diff-line-empty" data-has-gutter="true">
                  <div className="diff-gutter">
                    <span className="diff-line-number" />
                    <span className="diff-line-number" />
                  </div>
                  <span className="diff-line-content" />
                </div>
              )}
              {row.right ? (
                renderLine(
                  row.right.line,
                  row.right.index,
                  "right",
                  mirroredChunk,
                )
              ) : (
                <div className="diff-line diff-line-context diff-line-empty" data-has-gutter="true">
                  <div className="diff-gutter">
                    <span className="diff-line-number" />
                    <span className="diff-line-number" />
                  </div>
                  <span className="diff-line-content" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      onMouseMove={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const chunkNode = target.closest<HTMLElement>("[data-chunk-id]");
        const nextChunkId = chunkNode?.dataset.chunkId ?? null;
        setHoveredChunkId((current) => (current === nextChunkId ? current : nextChunkId));
      }}
      onMouseLeave={() => {
        setHoveredChunkId(null);
      }}
    >
      {parsedLines.map((line, index) => (
        <div key={index}>{renderLine(line, index)}</div>
      ))}
    </div>
  );
}
