import { memo, useMemo } from "react";
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

  const isAdded = status === "A";
  const isDeleted = status === "D";
  const isModified = !isAdded && !isDeleted;
  const placeholderLabel = "Image preview unavailable.";
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
            title="Discard changes in this file"
            aria-label="Discard changes in this file"
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
                  alt="Previous version"
                  className="image-diff-preview"
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
                  alt="Current version"
                  className="image-diff-preview"
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
                  alt="New image"
                  className="image-diff-preview"
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
                  alt="Deleted image"
                  className="image-diff-preview"
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
