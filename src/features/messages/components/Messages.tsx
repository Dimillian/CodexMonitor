import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import Brain from "lucide-react/dist/esm/icons/brain";
import Check from "lucide-react/dist/esm/icons/check";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import Copy from "lucide-react/dist/esm/icons/copy";
import Diff from "lucide-react/dist/esm/icons/diff";
import FileDiff from "lucide-react/dist/esm/icons/file-diff";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Image from "lucide-react/dist/esm/icons/image";
import Search from "lucide-react/dist/esm/icons/search";
import Terminal from "lucide-react/dist/esm/icons/terminal";
import Users from "lucide-react/dist/esm/icons/users";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import X from "lucide-react/dist/esm/icons/x";
import type {
  ConversationItem,
  OpenAppTarget,
  RequestUserInputRequest,
  RequestUserInputResponse,
} from "../../../types";
import { Markdown } from "./Markdown";
import { DiffBlock } from "../../git/components/DiffBlock";
import { languageFromPath } from "../../../utils/syntax";
import { useFileLinkOpener } from "../hooks/useFileLinkOpener";
import { RequestUserInputMessage } from "../../app/components/RequestUserInputMessage";

type MessagesProps = {
  items: ConversationItem[];
  threadId: string | null;
  workspaceId?: string | null;
  isThinking: boolean;
  processingStartedAt?: number | null;
  lastDurationMs?: number | null;
  workspacePath?: string | null;
  openTargets: OpenAppTarget[];
  selectedOpenAppId: string;
  codeBlockCopyUseModifier?: boolean;
  userInputRequests?: RequestUserInputRequest[];
  onUserInputSubmit?: (
    request: RequestUserInputRequest,
    response: RequestUserInputResponse,
  ) => void;
  onOpenThreadLink?: (threadId: string) => void;
};

type ToolSummary = {
  label: string;
  value?: string;
  detail?: string;
  output?: string;
};

type StatusTone = "completed" | "processing" | "failed" | "unknown";

type WorkingIndicatorProps = {
  isThinking: boolean;
  processingStartedAt?: number | null;
  lastDurationMs?: number | null;
  hasItems: boolean;
  reasoningLabel?: string | null;
};

type MessageRowProps = {
  item: Extract<ConversationItem, { kind: "message" }>;
  isCopied: boolean;
  onCopy: (item: Extract<ConversationItem, { kind: "message" }>) => void;
  codeBlockCopyUseModifier?: boolean;
  onOpenFileLink?: (path: string) => void;
  onOpenFileLinkMenu?: (event: React.MouseEvent, path: string) => void;
  onOpenThreadLink?: (threadId: string) => void;
};

type ReasoningRowProps = {
  item: Extract<ConversationItem, { kind: "reasoning" }>;
  parsed: ReturnType<typeof parseReasoning>;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onOpenFileLink?: (path: string) => void;
  onOpenFileLinkMenu?: (event: React.MouseEvent, path: string) => void;
  onOpenThreadLink?: (threadId: string) => void;
};

type ReviewRowProps = {
  item: Extract<ConversationItem, { kind: "review" }>;
  onOpenFileLink?: (path: string) => void;
  onOpenFileLinkMenu?: (event: React.MouseEvent, path: string) => void;
  onOpenThreadLink?: (threadId: string) => void;
};

type DiffRowProps = {
  item: Extract<ConversationItem, { kind: "diff" }>;
};

type ToolRowProps = {
  item: Extract<ConversationItem, { kind: "tool" }>;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onOpenFileLink?: (path: string) => void;
  onOpenFileLinkMenu?: (event: React.MouseEvent, path: string) => void;
  onOpenThreadLink?: (threadId: string) => void;
  onRequestAutoScroll?: () => void;
};

type ExploreRowProps = {
  item: Extract<ConversationItem, { kind: "explore" }>;
};

type CommandOutputProps = {
  output: string;
};

type MessageImage = {
  src: string;
  label: string;
};

type ToolGroupItem = Extract<ConversationItem, { kind: "tool" | "reasoning" | "explore" }>;

type ToolGroup = {
  id: string;
  items: ToolGroupItem[];
  toolCount: number;
  messageCount: number;
};

type MessageListEntry =
  | { kind: "item"; item: ConversationItem }
  | { kind: "toolGroup"; group: ToolGroup };

const SCROLL_THRESHOLD_PX = 120;
const MAX_COMMAND_OUTPUT_LINES = 200;

function basename(path: string) {
  if (!path) {
    return "";
  }
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function parseToolArgs(detail: string) {
  if (!detail) {
    return null;
  }
  try {
    return JSON.parse(detail) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function firstStringField(
  source: Record<string, unknown> | null,
  keys: string[],
) {
  if (!source) {
    return "";
  }
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function toolNameFromTitle(title: string) {
  if (!title.toLowerCase().startsWith("tool:")) {
    return "";
  }
  const [, toolPart = ""] = title.split(":");
  const segments = toolPart.split("/").map((segment) => segment.trim());
  return segments.length ? segments[segments.length - 1] : "";
}

function formatCount(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function sanitizeReasoningTitle(title: string) {
  return title
    .replace(/[`*_~]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .trim();
}

function parseReasoning(item: Extract<ConversationItem, { kind: "reasoning" }>) {
  const summary = item.summary ?? "";
  const content = item.content ?? "";
  const hasSummary = summary.trim().length > 0;
  const titleSource = hasSummary ? summary : content;
  const titleLines = titleSource.split("\n");
  const trimmedLines = titleLines.map((line) => line.trim());
  const titleLineIndex = trimmedLines.findIndex(Boolean);
  const rawTitle = titleLineIndex >= 0 ? trimmedLines[titleLineIndex] : "";
  const cleanTitle = sanitizeReasoningTitle(rawTitle);
  const summaryTitle = cleanTitle
    ? cleanTitle.length > 80
      ? `${cleanTitle.slice(0, 80)}…`
      : cleanTitle
    : "Reasoning";
  const summaryLines = summary.split("\n");
  const contentLines = content.split("\n");
  const summaryBody =
    hasSummary && titleLineIndex >= 0
      ? summaryLines
          .filter((_, index) => index !== titleLineIndex)
          .join("\n")
          .trim()
      : "";
  const contentBody = hasSummary
    ? content.trim()
    : titleLineIndex >= 0
      ? contentLines
          .filter((_, index) => index !== titleLineIndex)
          .join("\n")
          .trim()
      : content.trim();
  const bodyParts = [summaryBody, contentBody].filter(Boolean);
  const bodyText = bodyParts.join("\n\n").trim();
  const hasBody = bodyText.length > 0;
  const hasAnyText = titleSource.trim().length > 0;
  const workingLabel = hasAnyText ? summaryTitle : null;
  return {
    summaryTitle,
    bodyText,
    hasBody,
    workingLabel,
  };
}

function normalizeMessageImageSrc(path: string) {
  if (!path) {
    return "";
  }
  if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (path.startsWith("file://")) {
    return path;
  }
  try {
    return convertFileSrc(path);
  } catch {
    return "";
  }
}

const MessageImageGrid = memo(function MessageImageGrid({
  images,
  onOpen,
  hasText,
}: {
  images: MessageImage[];
  onOpen: (index: number) => void;
  hasText: boolean;
}) {
  return (
    <div
      className={`message-image-grid${hasText ? " message-image-grid--with-text" : ""}`}
      role="list"
    >
      {images.map((image, index) => (
        <button
          key={`${image.src}-${index}`}
          type="button"
          className="message-image-thumb"
          onClick={() => onOpen(index)}
          aria-label={`Open image ${index + 1}`}
        >
          <img src={image.src} alt={image.label} loading="lazy" />
        </button>
      ))}
    </div>
  );
});

const ImageLightbox = memo(function ImageLightbox({
  images,
  activeIndex,
  onClose,
}: {
  images: MessageImage[];
  activeIndex: number;
  onClose: () => void;
}) {
  const activeImage = images[activeIndex];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!activeImage) {
    return null;
  }

  return createPortal(
    <div
      className="message-image-lightbox"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="message-image-lightbox-content"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="message-image-lightbox-close"
          onClick={onClose}
          aria-label="Close image preview"
        >
          <X size={16} aria-hidden />
        </button>
        <img src={activeImage.src} alt={activeImage.label} />
      </div>
    </div>,
    document.body,
  );
});

function isToolGroupItem(item: ConversationItem): item is ToolGroupItem {
  return item.kind === "tool" || item.kind === "reasoning" || item.kind === "explore";
}

function mergeExploreItems(
  items: Extract<ConversationItem, { kind: "explore" }>[],
): Extract<ConversationItem, { kind: "explore" }> {
  const first = items[0];
  const last = items[items.length - 1];
  const status = last?.status ?? "explored";
  const entries = items.flatMap((item) => item.entries);
  return {
    id: first.id,
    kind: "explore",
    status,
    entries,
  };
}

function mergeConsecutiveExploreRuns(items: ToolGroupItem[]): ToolGroupItem[] {
  const result: ToolGroupItem[] = [];
  let run: Extract<ConversationItem, { kind: "explore" }>[] = [];

  const flushRun = () => {
    if (run.length === 0) {
      return;
    }
    if (run.length === 1) {
      result.push(run[0]);
    } else {
      result.push(mergeExploreItems(run));
    }
    run = [];
  };

  items.forEach((item) => {
    if (item.kind === "explore") {
      run.push(item);
      return;
    }
    flushRun();
    result.push(item);
  });
  flushRun();
  return result;
}

function buildToolGroups(items: ConversationItem[]): MessageListEntry[] {
  const entries: MessageListEntry[] = [];
  let buffer: ToolGroupItem[] = [];

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }
    const normalizedBuffer = mergeConsecutiveExploreRuns(buffer);

    const toolCount = normalizedBuffer.reduce((total, item) => {
      if (item.kind === "tool") {
        return total + 1;
      }
      if (item.kind === "explore") {
        return total + item.entries.length;
      }
      return total;
    }, 0);
    const messageCount = normalizedBuffer.filter(
      (item) => item.kind !== "tool" && item.kind !== "explore",
    ).length;
    if (toolCount === 0 || normalizedBuffer.length === 1) {
      normalizedBuffer.forEach((item) => entries.push({ kind: "item", item }));
    } else {
      entries.push({
        kind: "toolGroup",
        group: {
          id: normalizedBuffer[0].id,
          items: normalizedBuffer,
          toolCount,
          messageCount,
        },
      });
    }
    buffer = [];
  };

  items.forEach((item) => {
    if (isToolGroupItem(item)) {
      buffer.push(item);
    } else {
      flush();
      entries.push({ kind: "item", item });
    }
  });
  flush();
  return entries;
}

function buildToolSummary(
  item: Extract<ConversationItem, { kind: "tool" }>,
  commandText: string,
): ToolSummary {
  if (item.toolType === "commandExecution") {
    const cleanedCommand = cleanCommandText(commandText);
    return {
      label: "command",
      value: cleanedCommand || "Command",
      detail: "",
      output: item.output || "",
    };
  }

  if (item.toolType === "webSearch") {
    return {
      label: "searched",
      value: item.detail || "",
    };
  }

  if (item.toolType === "imageView") {
    const file = basename(item.detail || "");
    return {
      label: "read",
      value: file || "image",
    };
  }

  if (item.toolType === "mcpToolCall") {
    const toolName = toolNameFromTitle(item.title);
    const args = parseToolArgs(item.detail);
    if (toolName.toLowerCase().includes("search")) {
      return {
        label: "searched",
        value:
          firstStringField(args, ["query", "pattern", "text"]) || item.detail,
      };
    }
    if (toolName.toLowerCase().includes("read")) {
      const targetPath =
        firstStringField(args, ["path", "file", "filename"]) || item.detail;
      return {
        label: "read",
        value: basename(targetPath),
        detail: targetPath && targetPath !== basename(targetPath) ? targetPath : "",
      };
    }
    if (toolName) {
      return {
        label: "tool",
        value: toolName,
        detail: item.detail || "",
      };
    }
  }

  return {
    label: "tool",
    value: item.title || "",
    detail: item.detail || "",
    output: item.output || "",
  };
}

function toolIconForSummary(
  item: Extract<ConversationItem, { kind: "tool" }>,
  summary: ToolSummary,
) {
  if (item.toolType === "commandExecution") {
    return Terminal;
  }
  if (item.toolType === "fileChange") {
    return FileDiff;
  }
  if (item.toolType === "webSearch") {
    return Search;
  }
  if (item.toolType === "imageView") {
    return Image;
  }
  if (item.toolType === "collabToolCall") {
    return Users;
  }

  const label = summary.label.toLowerCase();
  if (label === "read") {
    return FileText;
  }
  if (label === "searched") {
    return Search;
  }

  const toolName = toolNameFromTitle(item.title).toLowerCase();
  const title = item.title.toLowerCase();
  if (toolName.includes("diff") || title.includes("diff")) {
    return Diff;
  }

  return Wrench;
}

function cleanCommandText(commandText: string) {
  if (!commandText) {
    return "";
  }
  const trimmed = commandText.trim();
  const shellMatch = trimmed.match(
    /^(?:\/\S+\/)?(?:bash|zsh|sh|fish)(?:\.exe)?\s+-lc\s+(['"])([\s\S]+)\1$/,
  );
  const inner = shellMatch ? shellMatch[2] : trimmed;
  const cdMatch = inner.match(
    /^\s*cd\s+[^&;]+(?:\s*&&\s*|\s*;\s*)([\s\S]+)$/i,
  );
  const stripped = cdMatch ? cdMatch[1] : inner;
  return stripped.trim();
}

function formatDurationMs(durationMs: number) {
  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const durationMinutes = Math.floor(durationSeconds / 60);
  const durationRemainder = durationSeconds % 60;
  return `${durationMinutes}:${String(durationRemainder).padStart(2, "0")}`;
}

function statusToneFromText(status?: string): StatusTone {
  if (!status) {
    return "unknown";
  }
  const normalized = status.toLowerCase();
  if (/(fail|error)/.test(normalized)) {
    return "failed";
  }
  if (/(pending|running|processing|started|in_progress)/.test(normalized)) {
    return "processing";
  }
  if (/(complete|completed|success|done)/.test(normalized)) {
    return "completed";
  }
  return "unknown";
}

function toolStatusTone(
  item: Extract<ConversationItem, { kind: "tool" }>,
  hasChanges: boolean,
): StatusTone {
  const fromStatus = statusToneFromText(item.status);
  if (fromStatus !== "unknown") {
    return fromStatus;
  }
  if (item.output || hasChanges) {
    return "completed";
  }
  return "processing";
}

function scrollKeyForItems(items: ConversationItem[]) {
  if (!items.length) {
    return "empty";
  }
  const last = items[items.length - 1];
  switch (last.kind) {
    case "message":
      return `${last.id}-${last.text.length}`;
    case "reasoning":
      return `${last.id}-${last.summary.length}-${last.content.length}`;
    case "explore":
      return `${last.id}-${last.status}-${last.entries.length}`;
    case "tool":
      return `${last.id}-${last.status ?? ""}-${last.output?.length ?? 0}`;
    case "diff":
      return `${last.id}-${last.status ?? ""}-${last.diff.length}`;
    case "review":
      return `${last.id}-${last.state}-${last.text.length}`;
    default: {
      const _exhaustive: never = last;
      return _exhaustive;
    }
  }
}

const WorkingIndicator = memo(function WorkingIndicator({
  isThinking,
  processingStartedAt = null,
  lastDurationMs = null,
  hasItems,
  reasoningLabel = null,
}: WorkingIndicatorProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isThinking || !processingStartedAt) {
      setElapsedMs(0);
      return undefined;
    }
    setElapsedMs(Date.now() - processingStartedAt);
    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - processingStartedAt);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isThinking, processingStartedAt]);

  return (
    <>
      {isThinking && (
        <div className="working">
          <span className="working-spinner" aria-hidden />
          <div className="working-timer">
            <span className="working-timer-clock">{formatDurationMs(elapsedMs)}</span>
          </div>
          <span className="working-text">{reasoningLabel || "Working…"}</span>
        </div>
      )}
      {!isThinking && lastDurationMs !== null && hasItems && (
        <div className="turn-complete" aria-live="polite">
          <span className="turn-complete-line" aria-hidden />
          <span className="turn-complete-label">
            Done in {formatDurationMs(lastDurationMs)}
          </span>
          <span className="turn-complete-line" aria-hidden />
        </div>
      )}
    </>
  );
});

const MessageRow = memo(function MessageRow({
  item,
  isCopied,
  onCopy,
  codeBlockCopyUseModifier,
  onOpenFileLink,
  onOpenFileLinkMenu,
  onOpenThreadLink,
}: MessageRowProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const hasText = item.text.trim().length > 0;
  const imageItems = useMemo(() => {
    if (!item.images || item.images.length === 0) {
      return [];
    }
    return item.images
      .map((image, index) => {
        const src = normalizeMessageImageSrc(image);
        if (!src) {
          return null;
        }
        return { src, label: `Image ${index + 1}` };
      })
      .filter(Boolean) as MessageImage[];
  }, [item.images]);

  return (
    <div className={`message ${item.role}`}>
      <div className="bubble message-bubble">
        {imageItems.length > 0 && (
          <MessageImageGrid
            images={imageItems}
            onOpen={setLightboxIndex}
            hasText={hasText}
          />
        )}
        {hasText && (
          <Markdown
            value={item.text}
            className="markdown"
            codeBlockStyle="message"
            codeBlockCopyUseModifier={codeBlockCopyUseModifier}
            onOpenFileLink={onOpenFileLink}
            onOpenFileLinkMenu={onOpenFileLinkMenu}
            onOpenThreadLink={onOpenThreadLink}
          />
        )}
        {lightboxIndex !== null && imageItems.length > 0 && (
          <ImageLightbox
            images={imageItems}
            activeIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
        <button
          type="button"
          className={`ghost message-copy-button${isCopied ? " is-copied" : ""}`}
          onClick={() => onCopy(item)}
          aria-label="Copy message"
          title="Copy message"
        >
          <span className="message-copy-icon" aria-hidden>
            <Copy className="message-copy-icon-copy" size={14} />
            <Check className="message-copy-icon-check" size={14} />
          </span>
        </button>
      </div>
    </div>
  );
});

const ReasoningRow = memo(function ReasoningRow({
  item,
  parsed,
  isExpanded,
  onToggle,
  onOpenFileLink,
  onOpenFileLinkMenu,
  onOpenThreadLink,
}: ReasoningRowProps) {
  const { summaryTitle, bodyText, hasBody } = parsed;
  const reasoningTone: StatusTone = hasBody ? "completed" : "processing";
  return (
    <div className="tool-inline reasoning-inline">
      <button
        type="button"
        className="tool-inline-bar-toggle"
        onClick={() => onToggle(item.id)}
        aria-expanded={isExpanded}
        aria-label="Toggle reasoning details"
      />
      <div className="tool-inline-content">
        <button
          type="button"
          className="tool-inline-summary tool-inline-toggle"
          onClick={() => onToggle(item.id)}
          aria-expanded={isExpanded}
        >
          <Brain
            className={`tool-inline-icon ${reasoningTone}`}
            size={14}
            aria-hidden
          />
          <span className="tool-inline-value">{summaryTitle}</span>
        </button>
        {hasBody && (
          <Markdown
            value={bodyText}
            className={`reasoning-inline-detail markdown ${
              isExpanded ? "" : "tool-inline-clamp"
            }`}
            onOpenFileLink={onOpenFileLink}
            onOpenFileLinkMenu={onOpenFileLinkMenu}
            onOpenThreadLink={onOpenThreadLink}
          />
        )}
      </div>
    </div>
  );
});

const ReviewRow = memo(function ReviewRow({
  item,
  onOpenFileLink,
  onOpenFileLinkMenu,
  onOpenThreadLink,
}: ReviewRowProps) {
  const title = item.state === "started" ? "Review started" : "Review completed";
  return (
    <div className="item-card review">
      <div className="review-header">
        <span className="review-title">{title}</span>
        <span
          className={`review-badge ${item.state === "started" ? "active" : "done"}`}
        >
          Review
        </span>
      </div>
      {item.text && (
        <Markdown
          value={item.text}
          className="item-text markdown"
          onOpenFileLink={onOpenFileLink}
          onOpenFileLinkMenu={onOpenFileLinkMenu}
          onOpenThreadLink={onOpenThreadLink}
        />
      )}
    </div>
  );
});

const DiffRow = memo(function DiffRow({ item }: DiffRowProps) {
  return (
    <div className="item-card diff">
      <div className="diff-header">
        <span className="diff-title">{item.title}</span>
        {item.status && <span className="item-status">{item.status}</span>}
      </div>
      <div className="diff-viewer-output">
        <DiffBlock diff={item.diff} language={languageFromPath(item.title)} />
      </div>
    </div>
  );
});

const ToolRow = memo(function ToolRow({
  item,
  isExpanded,
  onToggle,
  onOpenFileLink,
  onOpenFileLinkMenu,
  onOpenThreadLink,
  onRequestAutoScroll,
}: ToolRowProps) {
  const isFileChange = item.toolType === "fileChange";
  const isCommand = item.toolType === "commandExecution";
  const commandText = isCommand
    ? item.title.replace(/^Command:\s*/i, "").trim()
    : "";
  const summary = buildToolSummary(item, commandText);
  const changeNames = (item.changes ?? [])
    .map((change) => basename(change.path))
    .filter(Boolean);
  const hasChanges = changeNames.length > 0;
  const tone = toolStatusTone(item, hasChanges);
  const ToolIcon = toolIconForSummary(item, summary);
  const summaryLabel = isFileChange
    ? changeNames.length > 1
      ? "files edited"
      : "file edited"
    : isCommand
      ? ""
      : summary.label;
  const summaryValue = isFileChange
    ? changeNames.length > 1
      ? `${changeNames[0]} +${changeNames.length - 1}`
      : changeNames[0] || "changes"
    : summary.value;
  const shouldFadeCommand =
    isCommand && !isExpanded && (summaryValue?.length ?? 0) > 80;
  const showToolOutput = isExpanded && (!isFileChange || !hasChanges);
  const normalizedStatus = (item.status ?? "").toLowerCase();
  const isCommandRunning = isCommand && /in[_\s-]*progress|running|started/.test(normalizedStatus);
  const commandDurationMs =
    typeof item.durationMs === "number" ? item.durationMs : null;
  const isLongRunning = commandDurationMs !== null && commandDurationMs >= 1200;
  const [showLiveOutput, setShowLiveOutput] = useState(false);

  useEffect(() => {
    if (!isCommandRunning) {
      setShowLiveOutput(false);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setShowLiveOutput(true);
    }, 600);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isCommandRunning]);

  const showCommandOutput =
    isCommand &&
    summary.output &&
    (isExpanded || (isCommandRunning && showLiveOutput) || isLongRunning);

  useEffect(() => {
    if (showCommandOutput && isCommandRunning && showLiveOutput) {
      onRequestAutoScroll?.();
    }
  }, [isCommandRunning, onRequestAutoScroll, showCommandOutput, showLiveOutput]);
  return (
    <div className={`tool-inline ${isExpanded ? "tool-inline-expanded" : ""}`}>
      <button
        type="button"
        className="tool-inline-bar-toggle"
        onClick={() => onToggle(item.id)}
        aria-expanded={isExpanded}
        aria-label="Toggle tool details"
      />
      <div className="tool-inline-content">
        <button
          type="button"
          className="tool-inline-summary tool-inline-toggle"
          onClick={() => onToggle(item.id)}
          aria-expanded={isExpanded}
        >
          <ToolIcon className={`tool-inline-icon ${tone}`} size={14} aria-hidden />
          {summaryLabel && (
            <span className="tool-inline-label">{summaryLabel}:</span>
          )}
          {summaryValue && (
            <span
              className={`tool-inline-value ${isCommand ? "tool-inline-command" : ""} ${
                isCommand && isExpanded ? "tool-inline-command-full" : ""
              }`}
            >
              {isCommand ? (
                <span
                  className={`tool-inline-command-text ${
                    shouldFadeCommand ? "tool-inline-command-fade" : ""
                  }`}
                >
                  {summaryValue}
                </span>
              ) : (
                summaryValue
              )}
            </span>
          )}
        </button>
        {isExpanded && summary.detail && !isFileChange && (
          <div className="tool-inline-detail">{summary.detail}</div>
        )}
        {isExpanded && isCommand && item.detail && (
          <div className="tool-inline-detail tool-inline-muted">
            cwd: {item.detail}
          </div>
        )}
        {isExpanded && isFileChange && hasChanges && (
          <div className="tool-inline-change-list">
            {item.changes?.map((change, index) => (
              <div
                key={`${change.path}-${index}`}
                className="tool-inline-change"
              >
                <div className="tool-inline-change-header">
                  {change.kind && (
                    <span className="tool-inline-change-kind">
                      {change.kind.toUpperCase()}
                    </span>
                  )}
                  <span className="tool-inline-change-path">
                    {basename(change.path)}
                  </span>
                </div>
                {change.diff && (
                  <div className="diff-viewer-output">
                    <DiffBlock
                      diff={change.diff}
                      language={languageFromPath(change.path)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {isExpanded && isFileChange && !hasChanges && item.detail && (
          <Markdown
            value={item.detail}
            className="item-text markdown"
            onOpenFileLink={onOpenFileLink}
            onOpenFileLinkMenu={onOpenFileLinkMenu}
            onOpenThreadLink={onOpenThreadLink}
          />
        )}
        {showCommandOutput && <CommandOutput output={summary.output ?? ""} />}
        {showToolOutput && summary.output && !isCommand && (
          <Markdown
            value={summary.output}
            className="tool-inline-output markdown"
            codeBlock
            onOpenFileLink={onOpenFileLink}
            onOpenFileLinkMenu={onOpenFileLinkMenu}
            onOpenThreadLink={onOpenThreadLink}
          />
        )}
      </div>
    </div>
  );
});

const CommandOutput = memo(function CommandOutput({ output }: CommandOutputProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPinned, setIsPinned] = useState(true);
  const lines = useMemo(() => {
    if (!output) {
      return [];
    }
    return output.split(/\r?\n/);
  }, [output]);
  const lineWindow = useMemo(() => {
    if (lines.length <= MAX_COMMAND_OUTPUT_LINES) {
      return { offset: 0, lines };
    }
    const startIndex = lines.length - MAX_COMMAND_OUTPUT_LINES;
    return { offset: startIndex, lines: lines.slice(startIndex) };
  }, [lines]);

  const handleScroll = useCallback(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }
    const threshold = 6;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    setIsPinned(distanceFromBottom <= threshold);
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !isPinned) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [lineWindow, isPinned]);

  if (lineWindow.lines.length === 0) {
    return null;
  }

  return (
    <div className="tool-inline-terminal" role="log" aria-live="polite">
      <div
        className="tool-inline-terminal-lines"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {lineWindow.lines.map((line, index) => (
          <div
            key={`${lineWindow.offset + index}-${line}`}
            className="tool-inline-terminal-line"
          >
            {line || " "}
          </div>
        ))}
      </div>
    </div>
  );
});

function exploreKindLabel(kind: ExploreRowProps["item"]["entries"][number]["kind"]) {
  return kind[0].toUpperCase() + kind.slice(1);
}

const ExploreRow = memo(function ExploreRow({ item }: ExploreRowProps) {
  const title = item.status === "exploring" ? "Exploring" : "Explored";
  return (
    <div className="tool-inline explore-inline">
      <div className="tool-inline-bar-toggle" aria-hidden />
      <div className="tool-inline-content">
        <div className="explore-inline-header">
          <Terminal
            className={`tool-inline-icon ${
              item.status === "exploring" ? "processing" : "completed"
            }`}
            size={14}
            aria-hidden
          />
          <span className="explore-inline-title">{title}</span>
        </div>
        <div className="explore-inline-list">
          {item.entries.map((entry, index) => (
            <div key={`${entry.kind}-${entry.label}-${index}`} className="explore-inline-item">
              <span className="explore-inline-kind">{exploreKindLabel(entry.kind)}</span>
              <span className="explore-inline-label">{entry.label}</span>
              {entry.detail && entry.detail !== entry.label && (
                <span className="explore-inline-detail">{entry.detail}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export const Messages = memo(function Messages({
  items,
  threadId,
  workspaceId = null,
  isThinking,
  processingStartedAt = null,
  lastDurationMs = null,
  workspacePath = null,
  openTargets,
  selectedOpenAppId,
  codeBlockCopyUseModifier = false,
  userInputRequests = [],
  onUserInputSubmit,
  onOpenThreadLink,
}: MessagesProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [collapsedToolGroups, setCollapsedToolGroups] = useState<Set<string>>(
    new Set(),
  );
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const activeUserInputRequestId =
    threadId && userInputRequests.length
      ? (userInputRequests.find(
          (request) =>
            request.params.thread_id === threadId &&
            (!workspaceId || request.workspace_id === workspaceId),
        )?.request_id ?? null)
      : null;
  const scrollKey = `${scrollKeyForItems(items)}-${activeUserInputRequestId ?? "no-input"}`;
  const { openFileLink, showFileLinkMenu } = useFileLinkOpener(
    workspacePath,
    openTargets,
    selectedOpenAppId,
  );

  const isNearBottom = useCallback(
    (node: HTMLDivElement) =>
      node.scrollHeight - node.scrollTop - node.clientHeight <= SCROLL_THRESHOLD_PX,
    [],
  );

  const updateAutoScroll = () => {
    if (!containerRef.current) {
      return;
    }
    autoScrollRef.current = isNearBottom(containerRef.current);
  };

  const requestAutoScroll = useCallback(() => {
    if (!bottomRef.current) {
      return;
    }
    const container = containerRef.current;
    const shouldScroll =
      autoScrollRef.current || (container ? isNearBottom(container) : true);
    if (!shouldScroll) {
      return;
    }
    bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isNearBottom]);

  useEffect(() => {
    autoScrollRef.current = true;
  }, [threadId]);
  const toggleExpanded = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleToolGroup = useCallback((id: string) => {
    setCollapsedToolGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const reasoningMetaById = useMemo(() => {
    const meta = new Map<string, ReturnType<typeof parseReasoning>>();
    items.forEach((item) => {
      if (item.kind === "reasoning") {
        meta.set(item.id, parseReasoning(item));
      }
    });
    return meta;
  }, [items]);

  const latestReasoningLabel = useMemo(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.kind === "message") {
        break;
      }
      if (item.kind !== "reasoning") {
        continue;
      }
      const parsed = reasoningMetaById.get(item.id);
      if (parsed?.workingLabel) {
        return parsed.workingLabel;
      }
    }
    return null;
  }, [items, reasoningMetaById]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (item.kind !== "reasoning") {
          return true;
        }
        return reasoningMetaById.get(item.id)?.hasBody ?? false;
      }),
    [items, reasoningMetaById],
  );

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyMessage = useCallback(
    async (item: Extract<ConversationItem, { kind: "message" }>) => {
      try {
        await navigator.clipboard.writeText(item.text);
        setCopiedMessageId(item.id);
        if (copyTimeoutRef.current) {
          window.clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = window.setTimeout(() => {
          setCopiedMessageId(null);
        }, 1200);
      } catch {
        // No-op: clipboard errors can occur in restricted contexts.
      }
    },
    [],
  );

  useEffect(() => {
    if (!bottomRef.current) {
      return undefined;
    }
    const container = containerRef.current;
    const shouldScroll =
      autoScrollRef.current ||
      (container ? isNearBottom(container) : true);
    if (!shouldScroll) {
      return undefined;
    }
    let raf1 = 0;
    let raf2 = 0;
    const target = bottomRef.current;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    });
    return () => {
      if (raf1) {
        window.cancelAnimationFrame(raf1);
      }
      if (raf2) {
        window.cancelAnimationFrame(raf2);
      }
    };
  }, [scrollKey, isThinking, isNearBottom]);

  const groupedItems = buildToolGroups(visibleItems);

  const hasActiveUserInputRequest = activeUserInputRequestId !== null;
  const userInputNode =
    hasActiveUserInputRequest && onUserInputSubmit ? (
      <RequestUserInputMessage
        requests={userInputRequests}
        activeThreadId={threadId}
        activeWorkspaceId={workspaceId}
        onSubmit={onUserInputSubmit}
      />
    ) : null;

  const renderItem = (item: ConversationItem) => {
    if (item.kind === "message") {
      const isCopied = copiedMessageId === item.id;
      return (
        <MessageRow
          key={item.id}
          item={item}
          isCopied={isCopied}
          onCopy={handleCopyMessage}
          codeBlockCopyUseModifier={codeBlockCopyUseModifier}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={onOpenThreadLink}
        />
      );
    }
    if (item.kind === "reasoning") {
      const isExpanded = expandedItems.has(item.id);
      const parsed = reasoningMetaById.get(item.id) ?? parseReasoning(item);
      return (
        <ReasoningRow
          key={item.id}
          item={item}
          parsed={parsed}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={onOpenThreadLink}
        />
      );
    }
    if (item.kind === "review") {
      return (
        <ReviewRow
          key={item.id}
          item={item}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={onOpenThreadLink}
        />
      );
    }
    if (item.kind === "diff") {
      return <DiffRow key={item.id} item={item} />;
    }
    if (item.kind === "tool") {
      const isExpanded = expandedItems.has(item.id);
      return (
        <ToolRow
          key={item.id}
          item={item}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={onOpenThreadLink}
          onRequestAutoScroll={requestAutoScroll}
        />
      );
    }
    if (item.kind === "explore") {
      return <ExploreRow key={item.id} item={item} />;
    }
    return null;
  };

  return (
    <div
      className="messages messages-full"
      ref={containerRef}
      onScroll={updateAutoScroll}
    >
      {groupedItems.map((entry) => {
        if (entry.kind === "toolGroup") {
          const { group } = entry;
          const isCollapsed = collapsedToolGroups.has(group.id);
          const summaryParts = [
            formatCount(group.toolCount, "tool call", "tool calls"),
          ];
          if (group.messageCount > 0) {
            summaryParts.push(formatCount(group.messageCount, "message", "messages"));
          }
          const summaryText = summaryParts.join(", ");
          const groupBodyId = `tool-group-${group.id}`;
          const ChevronIcon = isCollapsed ? ChevronDown : ChevronUp;
          return (
            <div
              key={`tool-group-${group.id}`}
              className={`tool-group ${isCollapsed ? "tool-group-collapsed" : ""}`}
            >
              <div className="tool-group-header">
                <button
                  type="button"
                  className="tool-group-toggle"
                  onClick={() => toggleToolGroup(group.id)}
                  aria-expanded={!isCollapsed}
                  aria-controls={groupBodyId}
                  aria-label={isCollapsed ? "Expand tool calls" : "Collapse tool calls"}
                >
                  <span className="tool-group-chevron" aria-hidden>
                    <ChevronIcon size={14} />
                  </span>
                  <span className="tool-group-summary">{summaryText}</span>
                </button>
              </div>
              {!isCollapsed && (
                <div className="tool-group-body" id={groupBodyId}>
                  {group.items.map(renderItem)}
                </div>
              )}
            </div>
          );
        }
        return renderItem(entry.item);
      })}
      {userInputNode}
      <WorkingIndicator
        isThinking={isThinking}
        processingStartedAt={processingStartedAt}
        lastDurationMs={lastDurationMs}
        hasItems={items.length > 0}
        reasoningLabel={latestReasoningLabel}
      />
      {!items.length && !userInputNode && (
        <div className="empty messages-empty">
          Start a thread and send a prompt to the agent.
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
});
