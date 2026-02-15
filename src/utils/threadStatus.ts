type ThreadStatusSnapshot = {
  isProcessing: boolean;
  hasUnread: boolean;
  isReviewing: boolean;
  processingStartedAt?: number | null;
  lastActivityAt?: number | null;
  lastErrorAt?: number | null;
  lastErrorMessage?: string | null;
};

export type ThreadVisualStatus =
  | "processing"
  | "waiting"
  | "stalled"
  | "reviewing"
  | "unread"
  | "ready"
  | "error";

const WAITING_AFTER_MS = 8_000;
const STALLED_AFTER_MS = 45_000;
const ERROR_HIGHLIGHT_MS = 5 * 60_000;

export function deriveThreadVisualStatus(
  status: ThreadStatusSnapshot | null | undefined,
  now = Date.now(),
): ThreadVisualStatus {
  if (!status) {
    return "ready";
  }

  const hasRecentError =
    typeof status.lastErrorAt === "number" &&
    Number.isFinite(status.lastErrorAt) &&
    now - status.lastErrorAt <= ERROR_HIGHLIGHT_MS;

  if (!status.isProcessing && hasRecentError) {
    return "error";
  }

  if (status.isReviewing) {
    return "reviewing";
  }

  if (status.isProcessing) {
    const activityBase =
      status.lastActivityAt ?? status.processingStartedAt ?? null;
    const quietForMs =
      typeof activityBase === "number" && Number.isFinite(activityBase)
        ? Math.max(0, now - activityBase)
        : 0;
    if (quietForMs >= STALLED_AFTER_MS) {
      return "stalled";
    }
    if (quietForMs >= WAITING_AFTER_MS) {
      return "waiting";
    }
    return "processing";
  }

  if (status.hasUnread) {
    return "unread";
  }

  return "ready";
}

export function getThreadVisualStatusLabel(status: ThreadVisualStatus): string {
  switch (status) {
    case "processing":
      return "运行中";
    case "waiting":
      return "等待响应";
    case "stalled":
      return "可能卡住";
    case "reviewing":
      return "审查中";
    case "unread":
      return "有未读消息";
    case "error":
      return "发生错误";
    default:
      return "空闲";
  }
}

export function getThreadVisualStatusBadge(status: ThreadVisualStatus): string | null {
  switch (status) {
    case "processing":
      return "运行";
    case "waiting":
      return "等待";
    case "stalled":
      return "卡住";
    case "reviewing":
      return "审查";
    case "error":
      return "错误";
    default:
      return null;
  }
}
