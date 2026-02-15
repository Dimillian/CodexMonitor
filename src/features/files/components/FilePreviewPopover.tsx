import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import X from "lucide-react/dist/esm/icons/x";
import { highlightLine, languageFromPath } from "../../../utils/syntax";
import { OpenAppMenu } from "../../app/components/OpenAppMenu";
import { PopoverSurface } from "../../design-system/components/popover/PopoverPrimitives";
import type { OpenAppTarget } from "../../../types";

type FilePreviewPopoverProps = {
  path: string;
  absolutePath: string;
  content: string;
  truncated: boolean;
  previewKind?: "text" | "image";
  imageSrc?: string | null;
  openTargets: OpenAppTarget[];
  openAppIconById: Record<string, string>;
  selectedOpenAppId: string;
  onSelectOpenAppId: (id: string) => void;
  selection: { start: number; end: number } | null;
  onSelectLine: (index: number, event: MouseEvent<HTMLButtonElement>) => void;
  onLineMouseDown?: (index: number, event: MouseEvent<HTMLButtonElement>) => void;
  onLineMouseEnter?: (index: number, event: MouseEvent<HTMLButtonElement>) => void;
  onLineMouseUp?: (index: number, event: MouseEvent<HTMLButtonElement>) => void;
  onClearSelection: () => void;
  onAddSelection: () => void;
  canInsertText?: boolean;
  onClose: () => void;
  selectionHints?: string[];
  anchor?: {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    arrowTop: number;
  } | null;
  isLoading?: boolean;
  error?: string | null;
};

export function FilePreviewPopover({
  path,
  absolutePath,
  content,
  truncated,
  previewKind = "text",
  imageSrc = null,
  openTargets,
  openAppIconById,
  selectedOpenAppId,
  onSelectOpenAppId,
  selection,
  onSelectLine,
  onLineMouseDown,
  onLineMouseEnter,
  onLineMouseUp,
  onClearSelection,
  onAddSelection,
  canInsertText = true,
  onClose,
  selectionHints = [],
  anchor = null,
  isLoading = false,
  error = null,
}: FilePreviewPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const isImagePreview = previewKind === "image";
  const lines = useMemo(
    () => (isImagePreview ? [] : content.split("\n")),
    [content, isImagePreview],
  );
  const language = useMemo(() => languageFromPath(path), [path]);
  const selectionLabel = selection
    ? `第 ${selection.start + 1}-${selection.end + 1} 行`
    : isImagePreview
      ? "图片预览"
      : "未选择";
  const highlightedLines = useMemo(
    () =>
      isImagePreview
        ? []
        : lines.map((line) => {
            const html = highlightLine(line, language);
            return html || "&nbsp;";
          }),
    [lines, language, isImagePreview],
  );

  useLayoutEffect(() => {
    if (!popoverRef.current || !anchor) {
      return;
    }
    popoverRef.current.style.setProperty("--file-preview-top", `${anchor.top}px`);
    popoverRef.current.style.setProperty("--file-preview-left", `${anchor.left}px`);
    popoverRef.current.style.setProperty("--file-preview-width", `${anchor.width}px`);
    popoverRef.current.style.setProperty(
      "--file-preview-max-height",
      `${anchor.maxHeight}px`,
    );
    popoverRef.current.style.setProperty(
      "--file-preview-arrow-top",
      `${anchor.arrowTop}px`,
    );
  }, [anchor]);

  useEffect(() => {
    if (!imageSrc) {
      setImageDimensions(null);
      return;
    }
    let canceled = false;
    const probe = new Image();
    probe.decoding = "async";
    probe.onload = () => {
      if (canceled) {
        return;
      }
      setImageDimensions({
        width: probe.naturalWidth || 1,
        height: probe.naturalHeight || 1,
      });
    };
    probe.onerror = () => {
      if (!canceled) {
        setImageDimensions(null);
      }
    };
    probe.src = imageSrc;
    return () => {
      canceled = true;
    };
  }, [imageSrc]);

  return (
    <PopoverSurface className="file-preview-popover" ref={popoverRef}>
      <div className="file-preview-header">
        <div className="file-preview-title">
          <span className="file-preview-path">{path}</span>
          {truncated && (
            <span className="file-preview-warning">已截断</span>
          )}
        </div>
        <button
          type="button"
          className="icon-button file-preview-close"
          onClick={onClose}
          aria-label="关闭预览"
          title="关闭预览"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      {isLoading ? (
        <div className="file-preview-status">正在加载文件...</div>
      ) : error ? (
        <div className="file-preview-status file-preview-error">{error}</div>
      ) : isImagePreview ? (
        <div className="file-preview-body file-preview-body--image">
          <div className="file-preview-toolbar">
            <span className="file-preview-selection">{selectionLabel}</span>
            <div className="file-preview-actions">
              <OpenAppMenu
                path={absolutePath}
                openTargets={openTargets}
                selectedOpenAppId={selectedOpenAppId}
                onSelectOpenAppId={onSelectOpenAppId}
                iconById={openAppIconById}
              />
            </div>
          </div>
          {imageSrc ? (
            <div className="file-preview-image">
              <img
                src={imageSrc}
                srcSet={`${imageSrc} 1x, ${imageSrc} 2x`}
                alt={path}
                loading="eager"
                width={imageDimensions?.width}
                height={imageDimensions?.height}
                sizes="(max-width: 768px) 100vw, 640px"
                decoding="async"
              />
            </div>
          ) : (
            <div className="file-preview-status file-preview-error">
              图片预览不可用。
            </div>
          )}
        </div>
      ) : (
        <div className="file-preview-body">
          <div className="file-preview-toolbar">
            <div className="file-preview-selection-group">
              <span className="file-preview-selection">{selectionLabel}</span>
              {selectionHints.length > 0 ? (
                <div className="file-preview-hints" aria-label="选择提示">
                  {selectionHints.map((hint) => (
                    <span key={hint} className="file-preview-hint">
                      {hint}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="file-preview-actions">
              <OpenAppMenu
                path={absolutePath}
                openTargets={openTargets}
                selectedOpenAppId={selectedOpenAppId}
                onSelectOpenAppId={onSelectOpenAppId}
                iconById={openAppIconById}
              />
              <button
                type="button"
                className="ghost file-preview-action"
                onClick={onClearSelection}
                disabled={!selection}
              >
                清除
              </button>
              <button
                type="button"
                className="primary file-preview-action file-preview-action--add"
                onClick={onAddSelection}
                disabled={!selection || !canInsertText}
              >
                添加到对话
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
                  onMouseDown={(event) => onLineMouseDown?.(index, event)}
                  onMouseEnter={(event) => onLineMouseEnter?.(index, event)}
                  onMouseUp={(event) => onLineMouseUp?.(index, event)}
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
    </PopoverSurface>
  );
}
