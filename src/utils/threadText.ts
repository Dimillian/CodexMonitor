import type { ConversationItem } from "../types";

function formatMessage(item: Extract<ConversationItem, { kind: "message" }>) {
  const roleLabel = item.role === "user" ? "用户" : "助手";
  return `${roleLabel}: ${item.text}`;
}

function formatReasoning(item: Extract<ConversationItem, { kind: "reasoning" }>) {
  const parts = ["推理:"];
  if (item.summary) {
    parts.push(item.summary);
  }
  if (item.content) {
    parts.push(item.content);
  }
  return parts.join("\n");
}

function formatTool(item: Extract<ConversationItem, { kind: "tool" }>) {
  const parts = [`工具: ${item.title}`];
  if (item.detail) {
    parts.push(item.detail);
  }
  if (item.status) {
    parts.push(`状态: ${item.status}`);
  }
  if (item.output) {
    parts.push(item.output);
  }
  if (item.changes && item.changes.length > 0) {
    parts.push(
      "变更:\n" +
        item.changes
          .map((change) => `- ${change.path}${change.kind ? ` (${change.kind})` : ""}`)
          .join("\n"),
    );
  }
  return parts.join("\n");
}

function formatDiff(item: Extract<ConversationItem, { kind: "diff" }>) {
  const header = `差异: ${item.title}`;
  const status = item.status ? `状态: ${item.status}` : null;
  return [header, status, item.diff].filter(Boolean).join("\n");
}

function formatReview(item: Extract<ConversationItem, { kind: "review" }>) {
  const stateLabel = item.state === "started" ? "已开始" : "已完成";
  return `评审（${stateLabel}）: ${item.text}`;
}

function formatExplore(item: Extract<ConversationItem, { kind: "explore" }>) {
  const title = item.status === "exploring" ? "探索中" : "已探索";
  const lines = item.entries.map((entry) => {
    const prefix =
      entry.kind === "search"
        ? "搜索"
        : entry.kind === "read"
          ? "读取"
          : entry.kind === "list"
            ? "列表"
            : entry.kind === "open"
              ? "打开"
              : entry.kind === "write"
                ? "写入"
                : entry.kind;
    return `- ${prefix} ${entry.label}${entry.detail ? ` (${entry.detail})` : ""}`;
  });
  return [title, ...lines].join("\n");
}

export function buildThreadTranscript(items: ConversationItem[]) {
  return items
    .map((item) => {
      switch (item.kind) {
        case "message":
          return formatMessage(item);
        case "reasoning":
          return formatReasoning(item);
        case "explore":
          return formatExplore(item);
        case "tool":
          return formatTool(item);
        case "diff":
          return formatDiff(item);
        case "review":
          return formatReview(item);
      }
      return "";
    })
    .filter((value) => value.trim().length > 0)
    .join("\n\n");
}
