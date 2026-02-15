import { convertFileSrc } from "@tauri-apps/api/core";
import Image from "lucide-react/dist/esm/icons/image";
import X from "lucide-react/dist/esm/icons/x";

type ComposerAttachmentsProps = {
  attachments: string[];
  disabled: boolean;
  onRemoveAttachment?: (path: string) => void;
};

function fileTitle(path: string) {
  if (path.startsWith("data:")) {
    return "粘贴的图片";
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return "图片";
  }
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function attachmentPreviewSrc(path: string) {
  if (path.startsWith("data:")) {
    return path;
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  try {
    return convertFileSrc(path);
  } catch {
    return "";
  }
}

export function ComposerAttachments({
  attachments,
  disabled,
  onRemoveAttachment,
}: ComposerAttachmentsProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="composer-attachments">
      {attachments.map((path) => {
        const title = fileTitle(path);
        const titleAttr = path.startsWith("data:") ? "粘贴的图片" : path;
        const previewSrc = attachmentPreviewSrc(path);
        return (
          <div
            key={path}
            className="composer-attachment"
            title={titleAttr}
          >
            {previewSrc && (
              <span className="composer-attachment-preview" aria-hidden>
                <img
                  src={previewSrc}
                  srcSet={`${previewSrc} 1x, ${previewSrc} 2x`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={240}
                  height={180}
                  sizes="240px"
                />
              </span>
            )}
            {previewSrc ? (
              <span className="composer-attachment-thumb" aria-hidden>
                <img
                  src={previewSrc}
                  srcSet={`${previewSrc} 1x, ${previewSrc} 2x`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={20}
                  height={20}
                  sizes="20px"
                />
              </span>
            ) : (
              <span className="composer-icon" aria-hidden>
                <Image size={14} />
              </span>
            )}
            <span className="composer-attachment-name">{title}</span>
            <button
              type="button"
              className="composer-attachment-remove"
              onClick={() => onRemoveAttachment?.(path)}
              aria-label={`移除 ${title}`}
              disabled={disabled}
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
