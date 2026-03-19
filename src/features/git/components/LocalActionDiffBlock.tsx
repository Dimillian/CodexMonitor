import { useMemo, useRef, useState, type MouseEvent } from "react";
import type { GitFileDisplayHunk } from "../../../types";
import type { ParsedDiffLine } from "../../../utils/diff";
import { highlightLine } from "../../../utils/syntax";
import type { LocalLineAction } from "./GitDiffViewer.types";

type SplitLineEntry = {
  line: ParsedDiffLine;
  index: number;
};

type SplitRow =
  | { type: "meta"; line: ParsedDiffLine }
  | { type: "content"; left: SplitLineEntry | null; right: SplitLineEntry | null };

type LineDisplayHunkMeta = {
  activeHunkIds: string[];
  startHunkIds: string[];
  hasStaged: boolean;
};

type ResolvedDisplayHunkAction = GitFileDisplayHunk & LocalLineAction;

type LocalActionDiffBlockProps = {
  filePath: string;
  parsedLines: ParsedDiffLine[];
  diffStyle: "split" | "unified";
  language?: string | null;
  displayHunks: GitFileDisplayHunk[];
  disabledReason?: string;
  lineActionBusy?: boolean;
  onChunkAction?: (action: LocalLineAction) => void;
};

function gitSelectionDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem("codexMonitor.gitSelectionDebug") === "1";
  } catch {
    return false;
  }
}

function gitSelectionDebugLog(event: string, payload: unknown) {
  if (!gitSelectionDebugEnabled()) {
    return;
  }
  console.debug("[git-selection]", event, payload);
}

function isHighlightableLine(line: ParsedDiffLine) {
  return line.type === "add" || line.type === "del" || line.type === "context";
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

function toLocalLineAction(
  displayHunk: GitFileDisplayHunk,
  disabledReason?: string,
): ResolvedDisplayHunkAction {
  const action = displayHunk.action;
  return {
    ...displayHunk,
    id: displayHunk.id,
    source: displayHunk.source,
    action,
    label: action === "unstage" ? "Unstage" : "Stage",
    title: action === "unstage" ? "Unstage this hunk" : "Stage this hunk",
    disabledReason,
  };
}

function buildDisplayHunkMeta(displayHunks: ResolvedDisplayHunkAction[]) {
  const actionsById = new Map<string, LocalLineAction>();
  const metaByIndex = new Map<number, LineDisplayHunkMeta>();

  const ensureMeta = (index: number) => {
    const existing = metaByIndex.get(index);
    if (existing) {
      return existing;
    }
    const next: LineDisplayHunkMeta = {
      activeHunkIds: [],
      startHunkIds: [],
      hasStaged: false,
    };
    metaByIndex.set(index, next);
    return next;
  };

  displayHunks.forEach((displayHunk) => {
    actionsById.set(displayHunk.id, displayHunk);

    const startMeta = ensureMeta(displayHunk.startDisplayLineIndex);
    startMeta.startHunkIds.push(displayHunk.id);

    for (
      let index = displayHunk.startDisplayLineIndex;
      index <= displayHunk.endDisplayLineIndex;
      index += 1
    ) {
      const meta = ensureMeta(index);
      meta.activeHunkIds.push(displayHunk.id);
      if (displayHunk.source === "staged") {
        meta.hasStaged = true;
      }
    }
  });

  return { actionsById, metaByIndex };
}

export function LocalActionDiffBlock({
  filePath,
  parsedLines,
  diffStyle,
  language,
  displayHunks,
  disabledReason,
  lineActionBusy = false,
  onChunkAction,
}: LocalActionDiffBlockProps) {
  const [hoveredHunkIds, setHoveredHunkIds] = useState<string[]>([]);
  const hoveredHunkIdsRef = useRef<string[]>([]);
  const splitRows = useMemo(
    () => (diffStyle === "split" ? buildSplitRows(parsedLines) : []),
    [diffStyle, parsedLines],
  );
  const highlightedHtmlByIndex = useMemo(
    () =>
      parsedLines.map((line) => {
        const shouldHighlight = isHighlightableLine(line);
        return highlightLine(line.text, shouldHighlight ? language : null);
      }),
    [language, parsedLines],
  );

  const displayHunkActions = useMemo(
    () =>
      displayHunks.map((displayHunk) => toLocalLineAction(displayHunk, disabledReason)),
    [disabledReason, displayHunks],
  );

  const { actionsById, metaByIndex } = useMemo(
    () => buildDisplayHunkMeta(displayHunkActions),
    [displayHunkActions],
  );

  const updateHoveredHunkIds = (nextHunkIds: string[]) => {
    if (
      hoveredHunkIdsRef.current.length === nextHunkIds.length &&
      hoveredHunkIdsRef.current.every((value, index) => value === nextHunkIds[index])
    ) {
      return;
    }
    hoveredHunkIdsRef.current = nextHunkIds;
    setHoveredHunkIds(nextHunkIds);
  };

  const handleLineMouseEnter = (index: number) => {
    updateHoveredHunkIds(metaByIndex.get(index)?.activeHunkIds ?? []);
  };

  const handleLineMouseLeave = (event: MouseEvent<HTMLDivElement>) => {
    const nextTarget =
      event.relatedTarget instanceof Element ? event.relatedTarget : null;
    const nextLineIndex = nextTarget?.closest<HTMLElement>("[data-display-line-index]")
      ?.dataset.displayLineIndex;
    if (typeof nextLineIndex === "string") {
      const parsedIndex = Number(nextLineIndex);
      if (!Number.isNaN(parsedIndex)) {
        updateHoveredHunkIds(metaByIndex.get(parsedIndex)?.activeHunkIds ?? []);
        return;
      }
    }
    updateHoveredHunkIds([]);
  };

  const renderActionButtons = (
    actions: LocalLineAction[],
    side?: "left" | "right",
  ) => {
    if (!actions.length) {
      return null;
    }

    return (
      <div
        className={`diff-line-action-group${
          side === "left"
            ? " diff-line-action-group--after-gutter"
            : side === "right"
              ? " diff-line-action-group--before-gutter"
              : ""
        }`}
      >
        {actions.map((action) => {
          const actionHardDisabled = Boolean(action.disabledReason);
          const actionBlocked = lineActionBusy || actionHardDisabled;

          return (
            <button
              key={action.id}
              type="button"
              className={`diff-line-action${
                action.action === "unstage" ? " diff-line-action--unstage" : ""
              }${
                side === "left" ? " diff-line-action--after-gutter" : ""
              }${
                side === "right" ? " diff-line-action--before-gutter" : ""
              }`}
              aria-label={action.label}
              title={action.disabledReason ?? action.title}
              aria-disabled={actionBlocked}
              disabled={actionHardDisabled}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (actionBlocked) {
                  return;
                }
                gitSelectionDebugLog("display-hunk-action-click", {
                  filePath,
                  displayHunkId: action.id,
                  source: action.source,
                  action: action.action,
                });
                onChunkAction?.(action);
              }}
            >
              {action.action === "unstage" ? "-" : "+"}
            </button>
          );
        })}
      </div>
    );
  };

  const renderLine = (
    line: ParsedDiffLine,
    index: number,
    side?: "left" | "right",
    actionOverride?: LocalLineAction[],
  ) => {
    const html = highlightedHtmlByIndex[index] ?? "";
    const meta = metaByIndex.get(index);
    const startActions = actionOverride ??
      (meta?.startHunkIds
        .map((id) => actionsById.get(id))
        .filter((value): value is LocalLineAction => Boolean(value)) ?? []);
    const isLineActive = Boolean(
      meta?.activeHunkIds.some((id) => hoveredHunkIds.includes(id)),
    );
    const lineClassName = `diff-line diff-line-${line.type}${
      startActions.length > 0 ? " has-line-action" : ""
    }${isLineActive ? " chunk-action-visible" : ""}${
      meta?.hasStaged ? " diff-line-staged" : ""
    }`;

    return (
      <div
        className={lineClassName}
        data-display-line-index={index}
        data-has-gutter="true"
        onMouseEnter={() => {
          handleLineMouseEnter(index);
        }}
        onMouseLeave={handleLineMouseLeave}
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
        {renderActionButtons(startActions, side)}
      </div>
    );
  };

  const renderEmptySplitLine = (hoverIndex?: number) => (
    <div
      className="diff-line diff-line-context diff-line-empty"
      data-display-line-index={typeof hoverIndex === "number" ? hoverIndex : undefined}
      data-has-gutter="true"
      onMouseEnter={
        typeof hoverIndex === "number"
          ? () => {
              handleLineMouseEnter(hoverIndex);
            }
          : undefined
      }
      onMouseLeave={typeof hoverIndex === "number" ? handleLineMouseLeave : undefined}
    >
      <div className="diff-gutter">
        <span className="diff-line-number" />
        <span className="diff-line-number" />
      </div>
      <span className="diff-line-content" />
    </div>
  );

  if (diffStyle === "split") {
    return (
      <div
        className="diff-split-block"
        onMouseLeave={() => {
          updateHoveredHunkIds([]);
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
          const leftMeta = row.left ? metaByIndex.get(row.left.index) : undefined;
          const rightMeta = row.right ? metaByIndex.get(row.right.index) : undefined;
          const rowStartActions = Array.from(
            new Set([
              ...(leftMeta?.startHunkIds ?? []),
              ...(rightMeta?.startHunkIds ?? []),
            ]),
          )
            .map((id) => actionsById.get(id))
            .filter((value): value is LocalLineAction => Boolean(value));
          const preferRightActions = Boolean(row.right && row.right.line.type === "add");
          const leftActions =
            rowStartActions.length > 0
              ? preferRightActions
                ? []
                : row.left
                  ? rowStartActions
                  : []
              : undefined;
          const rightActions =
            rowStartActions.length > 0
              ? preferRightActions || !row.left
                ? rowStartActions
                : []
              : undefined;
          return (
            <div key={`row-${rowIndex}`} className="diff-split-row">
              {row.left ? (
                renderLine(row.left.line, row.left.index, "left", leftActions)
              ) : (
                renderEmptySplitLine(row.right?.index)
              )}
              {row.right ? (
                renderLine(row.right.line, row.right.index, "right", rightActions)
              ) : (
                renderEmptySplitLine(row.left?.index)
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      onMouseLeave={() => {
        updateHoveredHunkIds([]);
      }}
    >
      {parsedLines.map((line, index) => (
        <div key={index}>{renderLine(line, index)}</div>
      ))}
    </div>
  );
}
