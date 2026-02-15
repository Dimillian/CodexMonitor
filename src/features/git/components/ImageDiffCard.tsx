import { memo, useEffect, useMemo, useState } from "react";
import ImageOff from "lucide-react/dist/esm/icons/image-off";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import { splitPath } from "./GitDiffPanel.utils";

type ImageDiffCardProps = {
  path: string;
  status: string;
  oldImageData?: string | null;
  newImageData?: string | null;
  oldImageMime?: string | null;
  newImageMime?: string | null;
  isSelected: boolean;
  showRevert?: boolean;
  onRequestRevert?: (path: string) => void;
};

function getImageMimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".ico")) return "image/x-icon";
  return "image/png";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useIntrinsicImageDimensions(src: string | null) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    if (!src) {
      setDimensions(null);
      return;
    }
    let canceled = false;
    const probe = new Image();
    probe.decoding = "async";
    probe.onload = () => {
      if (canceled) {
        return;
      }
      setDimensions({
        width: probe.naturalWidth || 1,
        height: probe.naturalHeight || 1,
      });
    };
    probe.onerror = () => {
      if (!canceled) {
        setDimensions(null);
      }
    };
    probe.src = src;
    return () => {
      canceled = true;
    };
  }, [src]);

  return dimensions;
}

export const ImageDiffCard = memo(function ImageDiffCard({
  path,
  status,
  oldImageData,
  newImageData,
  oldImageMime,
  newImageMime,
  isSelected,
  showRevert = false,
  onRequestRevert,
}: ImageDiffCardProps) {
  const { name: fileName, dir } = useMemo(() => splitPath(path), [path]);
  const displayDir = dir ? `${dir}/` : "";
  const oldDataUri = useMemo(
    () => {
      if (!oldImageData) return null;
      const mimeType = oldImageMime ?? getImageMimeType(path);
      return `data:${mimeType};base64,${oldImageData}`;
    },
    [oldImageData, oldImageMime, path],
  );

  const newDataUri = useMemo(
    () => {
      if (!newImageData) return null;
      const mimeType = newImageMime ?? getImageMimeType(path);
      return `data:${mimeType};base64,${newImageData}`;
    },
    [newImageData, newImageMime, path],
  );

  const oldSize = useMemo(() => {
    if (!oldImageData) return null;
    const bytes = Math.ceil((oldImageData.length * 3) / 4);
    return formatFileSize(bytes);
  }, [oldImageData]);

  const newSize = useMemo(() => {
    if (!newImageData) return null;
    const bytes = Math.ceil((newImageData.length * 3) / 4);
    return formatFileSize(bytes);
  }, [newImageData]);
  const oldImageDimensions = useIntrinsicImageDimensions(oldDataUri);
  const newImageDimensions = useIntrinsicImageDimensions(newDataUri);

  const isAdded = status === "A";
  const isDeleted = status === "D";
  const isModified = !isAdded && !isDeleted;
  const placeholderLabel = "图片预览不可用。";
  const renderPlaceholder = () => (
    <div className="image-diff-placeholder">
      <ImageOff className="image-diff-placeholder-icon" aria-hidden />
      <div className="image-diff-placeholder-text">{placeholderLabel}</div>
    </div>
  );

  return (
    <div
      data-diff-path={path}
      className={`diff-viewer-item diff-viewer-item-image ${isSelected ? "active" : ""}`}
    >
      <div className="diff-viewer-header">
        <span className="diff-viewer-status" data-status={status}>
          {status}
        </span>
        <span className="diff-viewer-path" title={path}>
          <span className="diff-viewer-name">{fileName}</span>
          {displayDir && <span className="diff-viewer-dir">{displayDir}</span>}
        </span>
        {showRevert && (
          <button
            type="button"
            className="diff-viewer-header-action diff-viewer-header-action--discard"
            title="丢弃该文件更改"
            aria-label="丢弃该文件更改"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRequestRevert?.(path);
            }}
          >
            <RotateCcw size={14} aria-hidden />
          </button>
        )}
      </div>
      <div className="image-diff-content">
        {isModified && (
          <div className="image-diff-side-by-side">
            <div className="image-diff-pane image-diff-pane-old">
              {oldDataUri ? (
                <img
                  src={oldDataUri}
                  srcSet={`${oldDataUri} 1x, ${oldDataUri} 2x`}
                  alt="旧版本"
                  className="image-diff-preview"
                  loading="lazy"
                  width={oldImageDimensions?.width}
                  height={oldImageDimensions?.height}
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  decoding="async"
                />
              ) : (
                renderPlaceholder()
              )}
              {oldSize && <div className="image-diff-meta">{oldSize}</div>}
            </div>
            <div className="image-diff-pane image-diff-pane-new">
              {newDataUri ? (
                <img
                  src={newDataUri}
                  srcSet={`${newDataUri} 1x, ${newDataUri} 2x`}
                  alt="当前版本"
                  className="image-diff-preview"
                  loading="lazy"
                  width={newImageDimensions?.width}
                  height={newImageDimensions?.height}
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  decoding="async"
                />
              ) : (
                renderPlaceholder()
              )}
              {newSize && <div className="image-diff-meta">{newSize}</div>}
            </div>
          </div>
        )}
        {isAdded && (
          <div className="image-diff-single">
            <div className="image-diff-pane image-diff-pane-new">
              {newDataUri ? (
                <img
                  src={newDataUri}
                  srcSet={`${newDataUri} 1x, ${newDataUri} 2x`}
                  alt="新图片"
                  className="image-diff-preview"
                  loading="lazy"
                  width={newImageDimensions?.width}
                  height={newImageDimensions?.height}
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  decoding="async"
                />
              ) : (
                renderPlaceholder()
              )}
              {newSize && <div className="image-diff-meta">{newSize}</div>}
            </div>
          </div>
        )}
        {isDeleted && (
          <div className="image-diff-single">
            <div className="image-diff-pane image-diff-pane-old">
              {oldDataUri ? (
                <img
                  src={oldDataUri}
                  srcSet={`${oldDataUri} 1x, ${oldDataUri} 2x`}
                  alt="已删除图片"
                  className="image-diff-preview"
                  loading="lazy"
                  width={oldImageDimensions?.width}
                  height={oldImageDimensions?.height}
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  decoding="async"
                />
              ) : (
                renderPlaceholder()
              )}
              {oldSize && <div className="image-diff-meta">{oldSize}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
