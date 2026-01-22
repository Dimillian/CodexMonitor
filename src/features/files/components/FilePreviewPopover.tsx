import { useMemo } from "react";
import type { CSSProperties, MouseEvent } from "react";
import X from "lucide-react/dist/esm/icons/x";
import { highlightLine, languageFromPath } from "../../../utils/syntax";
import { OpenAppMenu } from "../../app/components/OpenAppMenu";

type FilePreviewPopoverProps = {
  path: string;
  absolutePath: string;
  content: string;
  truncated: boolean;
  selection: { start: number; end: number } | null;
  onSelectLine: (index: number, event: MouseEvent<HTMLButtonElement>) => void;
  onClearSelection: () => void;
  onAddSelection: () => void;
  onClose: () => void;
  style?: CSSProperties;
  isLoading?: boolean;
  error?: string | null;
};

export function FilePreviewPopover({
  path,
  absolutePath,
  content,
  truncated,
  selection,
  onSelectLine,
  onClearSelection,
  onAddSelection,
  onClose,
  style,
  isLoading = false,
  error = null,
}: FilePreviewPopoverProps) {
  const lines = useMemo(() => content.split("\n"), [content]);
  const language = useMemo(() => languageFromPath(path), [path]);
  const selectionLabel = selection
    ? `Lines ${selection.start + 1}-${selection.end + 1}`
    : "No selection";
  const highlightedLines = useMemo(
    () =>
      lines.map((line) => {
        const html = highlightLine(line, language);
        return html || "&nbsp;";
      }),
    [lines, language],
  );

  return (
    <div className="file-preview-popover popover-surface" style={style}>
      <div className="file-preview-header">
        <div className="file-preview-title">
          <span className="file-preview-path">{path}</span>
          {truncated && (
            <span className="file-preview-warning">Truncated</span>
          )}
        </div>
        <button
          type="button"
          className="icon-button file-preview-close"
          onClick={onClose}
          aria-label="Close preview"
          title="Close preview"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      {isLoading ? (
        <div className="file-preview-status">Loading file...</div>
      ) : error ? (
        <div className="file-preview-status file-preview-error">{error}</div>
      ) : (
        <div className="file-preview-body">
          <div className="file-preview-toolbar">
            <span className="file-preview-selection">{selectionLabel}</span>
            <div className="file-preview-actions">
              <OpenAppMenu path={absolutePath} />
              <button
                type="button"
                className="ghost file-preview-action"
                onClick={onClearSelection}
                disabled={!selection}
              >
                Clear
              </button>
              <button
                type="button"
                className="primary file-preview-action file-preview-action--add"
                onClick={onAddSelection}
                disabled={!selection}
              >
                Add to chat
              </button>
            </div>
          </div>
          <div className="file-preview-lines" role="list">
            {lines.map((_, index) => {
              const html = highlightedLines[index] ?? "&nbsp;";
              const isSelected =
                selection &&
                index >= selection.start &&
                index <= selection.end;
              const isStart = isSelected && selection?.start === index;
              const isEnd = isSelected && selection?.end === index;
              return (
                <button
                  key={`line-${index}`}
                  type="button"
                  className={`file-preview-line${
                    isSelected ? " is-selected" : ""
                  }${isStart ? " is-start" : ""}${isEnd ? " is-end" : ""}`}
                  onClick={(event) => onSelectLine(index, event)}
                >
                  <span className="file-preview-line-number">{index + 1}</span>
                  <span
                    className="file-preview-line-text"
                    dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
