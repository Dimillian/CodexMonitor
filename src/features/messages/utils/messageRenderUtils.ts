import { convertFileSrc } from "@tauri-apps/api/core";
import type { ConversationItem } from "../../../types";

export type ToolSummary = {
  label: string;
  value?: string;
  detail?: string;
  output?: string;
};

export type StatusTone = "completed" | "processing" | "failed" | "unknown";

export type ParsedReasoning = {
  summaryTitle: string;
  bodyText: string;
  hasBody: boolean;
  workingLabel: string | null;
};

export type MessageImage = {
  src: string;
  label: string;
};

export type ToolGroupItem = Extract<
  ConversationItem,
  { kind: "tool" | "reasoning" | "explore" }
>;

export type ToolGroup = {
  id: string;
  items: ToolGroupItem[];
  toolCount: number;
  messageCount: number;
};

export type MessageListEntry =
  | { kind: "item"; item: ConversationItem }
  | { kind: "toolGroup"; group: ToolGroup };

export const SCROLL_THRESHOLD_PX = 120;
export const MAX_COMMAND_OUTPUT_LINES = 200;

export function basename(path: string) {
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

export function toolNameFromTitle(title: string) {
  if (!title.toLowerCase().startsWith("tool:")) {
    return "";
  }
  const [, toolPart = ""] = title.split(":");
  const segments = toolPart.split("/").map((segment) => segment.trim());
  return segments.length ? segments[segments.length - 1] : "";
}

export function formatCount(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function sanitizeReasoningTitle(title: string) {
  return title
    .replace(/[`*_~]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .trim();
}

export function parseReasoning(
  item: Extract<ConversationItem, { kind: "reasoning" }>,
): ParsedReasoning {
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

export function normalizeMessageImageSrc(path: string) {
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

export function buildToolGroups(items: ConversationItem[]): MessageListEntry[] {
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

export function cleanCommandText(commandText: string) {
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

export function buildToolSummary(
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
      label: statusToneFromText(item.status) === "processing" ? "searching" : "searched",
      value: item.detail || "the web",
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
        label: statusToneFromText(item.status) === "processing" ? "searching" : "searched",
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

export function formatDurationMs(durationMs: number) {
  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const durationMinutes = Math.floor(durationSeconds / 60);
  const durationRemainder = durationSeconds % 60;
  return `${durationMinutes}:${String(durationRemainder).padStart(2, "0")}`;
}

export function statusToneFromText(status?: string): StatusTone {
  if (!status) {
    return "unknown";
  }
  const normalized = status.toLowerCase();
  if (/(fail|error)/.test(normalized)) {
    return "failed";
  }
  if (/(pending|running|processing|started|in[_\s-]?progress)/.test(normalized)) {
    return "processing";
  }
  if (/(complete|completed|success|done)/.test(normalized)) {
    return "completed";
  }
  return "unknown";
}

export function toolStatusTone(
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


export type PlanFollowupState = {
  shouldShow: boolean;
  planItemId: string | null;
};

export function computePlanFollowupState({
  threadId,
  items,
  isThinking,
  hasVisibleUserInputRequest,
}: {
  threadId: string | null;
  items: ConversationItem[];
  isThinking: boolean;
  hasVisibleUserInputRequest: boolean;
}): PlanFollowupState {
  if (!threadId) {
    return { shouldShow: false, planItemId: null };
  }
  if (hasVisibleUserInputRequest) {
    return { shouldShow: false, planItemId: null };
  }

  let planIndex = -1;
  let planItem: Extract<ConversationItem, { kind: "tool" }> | null = null;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === "tool" && item.toolType === "plan") {
      planIndex = index;
      planItem = item;
      break;
    }
  }

  if (!planItem) {
    return { shouldShow: false, planItemId: null };
  }

  const planItemId = planItem.id;

  if (!(planItem.output ?? "").trim()) {
    return { shouldShow: false, planItemId };
  }

  const planTone = toolStatusTone(planItem, false);
  if (planTone === "failed") {
    return { shouldShow: false, planItemId };
  }

  // Some backends stream plan output deltas without a final status update. As
  // soon as the turn stops thinking, treat the latest plan output as ready.
  if (isThinking && planTone !== "completed") {
    return { shouldShow: false, planItemId };
  }

  for (let index = planIndex + 1; index < items.length; index += 1) {
    const item = items[index];
    if (item.kind === "message" && item.role === "user") {
      return { shouldShow: false, planItemId };
    }
  }

  return { shouldShow: true, planItemId };
}

export function scrollKeyForItems(items: ConversationItem[]) {
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

export function exploreKindLabel(
  kind: Extract<ConversationItem, { kind: "explore" }>["entries"][number]["kind"],
) {
  return kind[0].toUpperCase() + kind.slice(1);
}
