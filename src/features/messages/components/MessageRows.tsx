import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import Check from "lucide-react/dist/esm/icons/check";
import Copy from "lucide-react/dist/esm/icons/copy";
import X from "lucide-react/dist/esm/icons/x";
import type { ConversationItem } from "../../../types";
import { languageFromPath } from "../../../utils/syntax";
import { DiffBlock } from "../../git/components/DiffBlock";
import {
  MAX_COMMAND_OUTPUT_LINES,
  basename,
  buildToolSummary,
  exploreKindLabel,
  formatDurationMs,
  normalizeMessageImageSrc,
  toolStatusTone,
  type MessageImage,
  type ParsedReasoning,
  type StatusTone,
} from "../utils/messageRenderUtils";
import { Markdown } from "./Markdown";

type MarkdownFileLinkProps = {
  showMessageFilePath?: boolean;
  workspaceId?: string | null;
  workspacePath?: string | null;
  onOpenFileLink?: (path: string) => void;
  onOpenFileLinkMenu?: (event: MouseEvent, path: string) => void;
  onOpenThreadLink?: (threadId: string) => void;
};

type WorkingIndicatorProps = {
  isThinking: boolean;
  isStreaming?: boolean;
  processingStartedAt?: number | null;
  lastDurationMs?: number | null;
  hasItems: boolean;
  reasoningLabel?: string | null;
  showPollingFetchStatus?: boolean;
  pollingIntervalMs?: number;
};

type MessageRowProps = MarkdownFileLinkProps & {
  item: Extract<ConversationItem, { kind: "message" }>;
  isCopied: boolean;
  onCopy: (item: Extract<ConversationItem, { kind: "message" }>) => void;
  codeBlockCopyUseModifier?: boolean;
  shouldAutoCollapseLongAssistantMessage?: boolean;
};

type ReasoningRowProps = MarkdownFileLinkProps & {
  item: Extract<ConversationItem, { kind: "reasoning" }>;
  parsed: ParsedReasoning;
  isExpanded: boolean;
  onToggle: (id: string) => void;
};

type ReviewRowProps = MarkdownFileLinkProps & {
  item: Extract<ConversationItem, { kind: "review" }>;
};

type DiffRowProps = {
  item: Extract<ConversationItem, { kind: "diff" }>;
};

type ToolRowProps = MarkdownFileLinkProps & {
  item: Extract<ConversationItem, { kind: "tool" }>;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onRequestAutoScroll?: () => void;
};

type ExploreRowProps = {
  item: Extract<ConversationItem, { kind: "explore" }>;
};

type CommandOutputProps = {
  output: string;
  command: string;
  tone: StatusTone;
};

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
          aria-label={`打开图片 ${index + 1}`}
        >
          <img
            src={image.src}
            srcSet={`${image.src} 1x, ${image.src} 2x`}
            alt={image.label}
            loading="lazy"
            decoding="async"
            width={88}
            height={88}
            sizes="88px"
          />
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
  const [activeImageDimensions, setActiveImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

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

  useEffect(() => {
    if (!activeImage?.src) {
      setActiveImageDimensions(null);
      return;
    }
    let canceled = false;
    const probe = new Image();
    probe.decoding = "async";
    probe.onload = () => {
      if (canceled) {
        return;
      }
      setActiveImageDimensions({
        width: probe.naturalWidth || 1,
        height: probe.naturalHeight || 1,
      });
    };
    probe.onerror = () => {
      if (!canceled) {
        setActiveImageDimensions(null);
      }
    };
    probe.src = activeImage.src;
    return () => {
      canceled = true;
    };
  }, [activeImage?.src]);

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
          aria-label="关闭图片预览"
        >
          <X size={16} aria-hidden />
        </button>
        <img
          src={activeImage.src}
          srcSet={`${activeImage.src} 1x, ${activeImage.src} 2x`}
          alt={activeImage.label}
          loading="eager"
          width={activeImageDimensions?.width}
          height={activeImageDimensions?.height}
          sizes="90vw"
          decoding="async"
        />
      </div>
    </div>,
    document.body,
  );
});

const CommandOutput = memo(function CommandOutput({ output, command, tone }: CommandOutputProps) {
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

  const statusLabel =
    tone === "completed"
      ? "✓ Success"
      : tone === "failed"
        ? "✕ Failed"
        : "● Running";
  const statusClass =
    tone === "completed"
      ? "success"
      : tone === "failed"
        ? "failed"
        : "running";

  if (lineWindow.lines.length === 0 && !command.trim()) {
    return null;
  }

  return (
    <div className="tool-inline-terminal" role="log" aria-live="polite">
      <div className="tool-inline-terminal-shell">bash</div>
      <div className="tool-inline-terminal-command">$ {command}</div>
      {lineWindow.lines.length > 0 ? (
        <>
          <div className="tool-inline-terminal-divider" aria-hidden />
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
        </>
      ) : null}
      <div className={`tool-inline-terminal-status ${statusClass}`}>{statusLabel}</div>
    </div>
  );
});

const USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD = 800;
const USER_MESSAGE_COLLAPSE_LINE_THRESHOLD = 12;
const ASSISTANT_MESSAGE_COLLAPSE_CHAR_THRESHOLD = 900;
const ASSISTANT_MESSAGE_COLLAPSE_LINE_THRESHOLD = 14;
const MESSAGE_PREVIEW_CHAR_LIMIT = 1200;

function shouldCollapseUserMessage(text: string): boolean {
  if (text.length >= USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD) {
    return true;
  }
  return text.split(/\r?\n/).length >= USER_MESSAGE_COLLAPSE_LINE_THRESHOLD;
}

function shouldCollapseAssistantMessage(text: string): boolean {
  if (text.length >= ASSISTANT_MESSAGE_COLLAPSE_CHAR_THRESHOLD) {
    return true;
  }
  return text.split(/\r?\n/).length >= ASSISTANT_MESSAGE_COLLAPSE_LINE_THRESHOLD;
}

function buildMessagePreview(text: string): string {
  if (text.length <= MESSAGE_PREVIEW_CHAR_LIMIT) {
    return text;
  }
  return `${text.slice(0, MESSAGE_PREVIEW_CHAR_LIMIT).trimEnd()}…`;
}

function formatTokenCount(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.?0+$/, "")}K`;
  }
  return String(Math.round(value));
}

/**
 * Derive streaming phase from elapsed time, whether we have content, and
 * whether the agent is actively streaming output.
 * - "start": waiting for the first response (no streaming yet)
 * - "in-progress": actively generating content (streaming data received)
 * - "done": finished (shown via turn-complete)
 */
function deriveStreamingPhase(
  isThinking: boolean,
  hasItems: boolean,
  isStreaming: boolean,
  elapsedMs: number,
): "start" | "in-progress" | "done" {
  if (!isThinking) {
    return "done";
  }
  // Only show "in-progress" when we have evidence of actual output.
  // Previously this was purely time-based (>2s → in-progress) which
  // misleadingly showed "输出中" even when no content had arrived.
  if (isStreaming) {
    return "in-progress";
  }
  if (!hasItems && elapsedMs < 2000) {
    return "start";
  }
  // After the initial start window, remain in "start" (等待响应) until
  // real streaming data arrives, rather than falsely claiming "输出中".
  return "start";
}

const PHASE_LABELS: Record<"start" | "in-progress", string> = {
  start: "等待 Agent 响应…",
  "in-progress": "Agent 正在输出…",
};

export const WorkingIndicator = memo(function WorkingIndicator({
  isThinking,
  isStreaming = false,
  processingStartedAt = null,
  lastDurationMs = null,
  hasItems,
  reasoningLabel = null,
  showPollingFetchStatus = false,
  pollingIntervalMs = 12000,
}: WorkingIndicatorProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [pollCountdownSeconds, setPollCountdownSeconds] = useState(() =>
    Math.max(1, Math.ceil(pollingIntervalMs / 1000)),
  );

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

  const phase = deriveStreamingPhase(isThinking, hasItems, isStreaming, elapsedMs);

  return (
    <>
      {isThinking && (
        <div className={`working working-phase-${phase}`} aria-live="polite">
          <span className="working-spinner" aria-hidden />
          <div className="working-timer">
            <span className="working-timer-clock">{formatDurationMs(elapsedMs)}</span>
          </div>
          <span className="working-text">
            {reasoningLabel || (phase !== "done" ? PHASE_LABELS[phase] : "Agent 正在输出…")}
          </span>
          <span className="working-phase-badge" aria-label={`阶段：${phase}`}>
            {phase === "start" ? "等待中" : "输出中"}
          </span>
        </div>
      )}
      {!isThinking && lastDurationMs !== null && hasItems && (
        <div className="turn-complete working-phase-done" aria-live="polite">
          <span className="turn-complete-line" aria-hidden />
          <span className="turn-complete-label">
            Worked for {formatDurationMs(lastDurationMs)}
          </span>
          <span className="turn-complete-line" aria-hidden />
        </div>
      )}
    </>
  );
});

export const MessageRow = memo(function MessageRow({
  item,
  isCopied,
  onCopy,
  codeBlockCopyUseModifier,
  showMessageFilePath,
  workspaceId,
  workspacePath,
  onOpenFileLink,
  onOpenFileLinkMenu,
  onOpenThreadLink,
  shouldAutoCollapseLongAssistantMessage = false,
}: MessageRowProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const hasText = item.text.trim().length > 0;
  const isLongUserMessage =
    item.role === "user" && hasText && shouldCollapseUserMessage(item.text);
  const isLongAssistantMessage =
    item.role === "assistant" &&
    hasText &&
    shouldAutoCollapseLongAssistantMessage &&
    shouldCollapseAssistantMessage(item.text);
  const [isUserCollapsed, setIsUserCollapsed] = useState(isLongUserMessage);
  const [isAssistantCollapsed, setIsAssistantCollapsed] = useState(
    isLongAssistantMessage,
  );

  useEffect(() => {
    setIsUserCollapsed(isLongUserMessage);
  }, [isLongUserMessage, item.id]);

  useEffect(() => {
    setIsAssistantCollapsed(isLongAssistantMessage);
  }, [isLongAssistantMessage, item.id]);

  const messagePreviewText = useMemo(() => buildMessagePreview(item.text), [item.text]);
  const assistantModel = useMemo(() => {
    if (item.role !== "assistant") {
      return null;
    }
    const raw = item.model;
    if (typeof raw !== "string") {
      return null;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [item.model, item.role]);
  const assistantContextWindow = useMemo(
    () => formatTokenCount(item.role === "assistant" ? item.contextWindow : null),
    [item.contextWindow, item.role],
  );

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

  const bubbleClasses = ["bubble", "message-bubble"];
  if (isLongUserMessage) {
    bubbleClasses.push("message-bubble-long-user");
  }

  return (
    <div className={`message ${item.role}`}>
      <div className={bubbleClasses.join(" ")}>
        {imageItems.length > 0 && (
          <MessageImageGrid
            images={imageItems}
            onOpen={setLightboxIndex}
            hasText={hasText}
          />
        )}
        {item.role === "assistant" && (assistantModel || assistantContextWindow) && (
          <div className="message-assistant-meta">
            {assistantModel ? <span>模型: {assistantModel}</span> : null}
            {assistantContextWindow ? (
              <span>上下文窗口: {assistantContextWindow}</span>
            ) : null}
          </div>
        )}
        {hasText && isLongUserMessage && isUserCollapsed && (
          <div className="message-user-collapsed">
            <div className="message-user-preview">{messagePreviewText}</div>
            <button
              type="button"
              className="ghost message-user-collapse-toggle"
              onClick={() => setIsUserCollapsed(false)}
            >
              展开全文
            </button>
          </div>
        )}
        {hasText && isLongAssistantMessage && isAssistantCollapsed && (
          <div className="message-assistant-collapsed">
            <div className="message-assistant-preview">{messagePreviewText}</div>
            <button
              type="button"
              className="ghost message-assistant-collapse-toggle"
              onClick={() => setIsAssistantCollapsed(false)}
            >
              展开全文
            </button>
          </div>
        )}
        {hasText && !((isLongUserMessage && isUserCollapsed) || (isLongAssistantMessage && isAssistantCollapsed)) && (
          <>
            <Markdown
              value={item.text}
              className="markdown"
              codeBlockStyle="message"
              codeBlockCopyUseModifier={codeBlockCopyUseModifier}
              showFilePath={showMessageFilePath}
              workspaceId={workspaceId}
              workspacePath={workspacePath}
              onOpenFileLink={onOpenFileLink}
              onOpenFileLinkMenu={onOpenFileLinkMenu}
              onOpenThreadLink={onOpenThreadLink}
            />
            {isLongUserMessage && (
              <button
                type="button"
                className="ghost message-user-collapse-toggle"
                onClick={() => setIsUserCollapsed(true)}
              >
                收起
              </button>
            )}
            {isLongAssistantMessage && (
              <button
                type="button"
                className="ghost message-assistant-collapse-toggle"
                onClick={() => setIsAssistantCollapsed(true)}
              >
                收起
              </button>
            )}
          </>
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
          aria-label="复制消息"
          title="复制消息"
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

export const ReasoningRow = memo(function ReasoningRow({
  item,
  parsed,
  isExpanded,
  onToggle,
  showMessageFilePath,
  workspaceId,
  workspacePath,
  onOpenFileLink,
  onOpenFileLinkMenu,
  onOpenThreadLink,
}: ReasoningRowProps) {
  const { summaryTitle, bodyText, hasBody } = parsed;
  const reasoningTone: StatusTone = hasBody ? "completed" : "processing";
  return (
    <div className="tool-inline reasoning-inline">
      <div className="tool-inline-content">
        <button
          type="button"
          className="tool-inline-summary tool-inline-toggle"
          onClick={() => onToggle(item.id)}
          aria-expanded={isExpanded}
          aria-label="切换推理详情"
        >
          <span className={`tool-inline-dot ${reasoningTone}`} aria-hidden />
          <span className="tool-inline-activity">{summaryTitle || "Thinking"}</span>
        </button>
        {hasBody && (
          <Markdown
            value={bodyText}
            className={`reasoning-inline-detail markdown ${
              isExpanded ? "" : "tool-inline-clamp"
            }`}
            showFilePath={showMessageFilePath}
            workspaceId={workspaceId}
            workspacePath={workspacePath}
            onOpenFileLink={onOpenFileLink}
            onOpenFileLinkMenu={onOpenFileLinkMenu}
            onOpenThreadLink={onOpenThreadLink}
          />
        )}
      </div>
    </div>
  );
});

export const ReviewRow = memo(function ReviewRow({
  item,
  showMessageFilePath,
  workspaceId,
  workspacePath,
  onOpenFileLink,
  onOpenFileLinkMenu,
  onOpenThreadLink,
}: ReviewRowProps) {
  const title = item.state === "started" ? "审查已开始" : "审查已完成";
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
          showFilePath={showMessageFilePath}
          workspaceId={workspaceId}
          workspacePath={workspacePath}
          onOpenFileLink={onOpenFileLink}
          onOpenFileLinkMenu={onOpenFileLinkMenu}
          onOpenThreadLink={onOpenThreadLink}
        />
      )}
    </div>
  );
});

export const DiffRow = memo(function DiffRow({ item }: DiffRowProps) {
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

export const ToolRow = memo(function ToolRow({
  item,
  isExpanded,
  onToggle,
  showMessageFilePath,
  workspaceId,
  workspacePath,
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
  const summaryValue = isFileChange
    ? changeNames.length > 1
      ? `${changeNames[0]} +${changeNames.length - 1}`
      : changeNames[0] || "changes"
    : summary.value;
  const activityText = isFileChange
    ? `Edited ${summaryValue || "files"}`
    : isCommand
      ? "Ran command"
      : summary.label === "searched"
        ? `Searched ${summaryValue || ""}`.trim()
        : summary.label === "read"
          ? `Read ${summaryValue || ""}`.trim()
          : summaryValue || item.title || "Used tool";
  const shouldFadeCommand =
    isCommand && !isExpanded && activityText.length > 96;
  const showToolOutput = isExpanded && (!isFileChange || !hasChanges);
  const normalizedStatus = (item.status ?? "").toLowerCase();
  const statusText = item.status
    ? item.status.replace(/[_-]+/g, " ").trim()
    : "";
  const isCommandRunning = isCommand && /in[_\s-]*progress|running|started/.test(normalizedStatus);
  const showCommandOutput = isCommand && isExpanded;

  useEffect(() => {
    if (showCommandOutput && isCommandRunning) {
      onRequestAutoScroll?.();
    }
  }, [isCommandRunning, onRequestAutoScroll, showCommandOutput]);

  return (
    <div className={`tool-inline ${isExpanded ? "tool-inline-expanded" : ""}`}>
      <div className="tool-inline-content">
        <button
          type="button"
          className="tool-inline-summary tool-inline-toggle"
          onClick={() => onToggle(item.id)}
          aria-expanded={isExpanded}
          aria-label="切换工具详情"
        >
          <span className={`tool-inline-dot ${tone}`} aria-hidden />
          <span
            className={`tool-inline-activity ${isCommand ? "tool-inline-command" : ""} ${
              isCommand && isExpanded ? "tool-inline-command-full" : ""
            }`}
          >
            {isCommand ? (
              <span
                className={`tool-inline-command-text ${
                  shouldFadeCommand ? "tool-inline-command-fade" : ""
                }`}
              >
                {activityText}
              </span>
            ) : (
              activityText
            )}
          </span>
          {statusText ? <span className="tool-inline-status">{statusText}</span> : null}
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
            showFilePath={showMessageFilePath}
            workspaceId={workspaceId}
            workspacePath={workspacePath}
            onOpenFileLink={onOpenFileLink}
            onOpenFileLinkMenu={onOpenFileLinkMenu}
            onOpenThreadLink={onOpenThreadLink}
          />
        )}
        {showCommandOutput && (
          <CommandOutput
            output={summary.output ?? ""}
            command={summaryValue || commandText || "command"}
            tone={tone}
          />
        )}
        {showToolOutput && summary.output && !isCommand && (
          <Markdown
            value={summary.output}
            className="tool-inline-output markdown"
            codeBlock
            showFilePath={showMessageFilePath}
            workspaceId={workspaceId}
            workspacePath={workspacePath}
            onOpenFileLink={onOpenFileLink}
            onOpenFileLinkMenu={onOpenFileLinkMenu}
            onOpenThreadLink={onOpenThreadLink}
          />
        )}
      </div>
    </div>
  );
});

export const ExploreRow = memo(function ExploreRow({ item }: ExploreRowProps) {
  const tone = item.status === "exploring" ? "processing" : "completed";
  return (
    <div className="tool-inline explore-inline">
      <div className="tool-inline-content">
        <div className="explore-inline-list">
          {item.entries.map((entry, index) => {
            const detailSuffix =
              entry.detail && entry.detail !== entry.label ? ` — ${entry.detail}` : "";
            return (
              <div key={`${entry.kind}-${entry.label}-${index}`} className="explore-inline-item">
                <span className={`tool-inline-dot ${tone}`} aria-hidden />
                <span className="explore-inline-label">
                  {exploreKindLabel(entry.kind)} {entry.label}
                  {detailSuffix}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
