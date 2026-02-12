import type { KeyboardEvent, MouseEvent } from "react";
import { useMemo } from "react";
import { parseDiff, type ParsedDiffLine } from "../../../utils/diff";
import { highlightLine } from "../../../utils/syntax";

type DiffBlockProps = {
  diff: string;
  language?: string | null;
  showLineNumbers?: boolean;
  onLineSelect?: (
    line: ParsedDiffLine,
    index: number,
    event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
  ) => void;
  onLineMouseDown?: (
    line: ParsedDiffLine,
    index: number,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  onLineMouseEnter?: (
    line: ParsedDiffLine,
    index: number,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  onLineMouseUp?: (
    line: ParsedDiffLine,
    index: number,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  selectedRange?: { start: number; end: number } | null;
  parsedLines?: ParsedDiffLine[] | null;
};

export function DiffBlock({
  diff,
  language,
  showLineNumbers = true,
  onLineSelect,
  onLineMouseDown,
  onLineMouseEnter,
  onLineMouseUp,
  selectedRange = null,
  parsedLines = null,
}: DiffBlockProps) {
  const parsed = useMemo(
    () => parsedLines ?? parseDiff(diff),
    [diff, parsedLines],
  );
  return (
    <div>
      {parsed.map((line, index) => {
        const shouldHighlight =
          line.type === "add" || line.type === "del" || line.type === "context";
        const html = highlightLine(line.text, shouldHighlight ? language : null);
        const isSelectable = Boolean(onLineSelect) && shouldHighlight;
        const isSelected = Boolean(
          isSelectable &&
            selectedRange &&
            index >= selectedRange.start &&
            index <= selectedRange.end,
        );
        const isRangeStart = isSelected && selectedRange?.start === index;
        const isRangeEnd = isSelected && selectedRange?.end === index;
        return (
          <div
            key={index}
            className={`diff-line diff-line-${line.type}${
              isSelectable ? " is-selectable" : ""
            }${isSelected ? " is-selected" : ""}${
              isRangeStart ? " is-range-start" : ""
            }${isRangeEnd ? " is-range-end" : ""}`}
            role={isSelectable ? "button" : undefined}
            tabIndex={isSelectable ? 0 : undefined}
            aria-pressed={isSelectable ? isSelected : undefined}
            onClick={
              isSelectable
                ? (event) => {
                    onLineSelect?.(line, index, event);
                  }
                : undefined
            }
            onMouseDown={
              isSelectable
                ? (event) => {
                    onLineMouseDown?.(line, index, event);
                  }
                : undefined
            }
            onMouseEnter={
              isSelectable
                ? (event) => {
                    onLineMouseEnter?.(line, index, event);
                  }
                : undefined
            }
            onMouseUp={
              isSelectable
                ? (event) => {
                    onLineMouseUp?.(line, index, event);
                  }
                : undefined
            }
            onKeyDown={
              isSelectable
                ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onLineSelect?.(line, index, event);
                  }
                }
                : undefined
            }
          >
            {showLineNumbers && (
              <div className="diff-gutter">
                <span className="diff-line-number">{line.oldLine ?? ""}</span>
                <span className="diff-line-number">{line.newLine ?? ""}</span>
              </div>
            )}
            <div
              className="diff-line-content"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        );
      })}
    </div>
  );
}
