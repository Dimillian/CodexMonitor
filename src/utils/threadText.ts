import type { ConversationItem } from "../types";

function formatMessage(item: Extract<ConversationItem, { kind: "message" }>) {
  const roleLabel = item.role === "user" ? "User" : "Assistant";
  return `${roleLabel}: ${item.text}`;
}

function formatReasoning(item: Extract<ConversationItem, { kind: "reasoning" }>) {
  const parts = ["Reasoning:"];
  if (item.summary) {
    parts.push(item.summary);
  }
  if (item.content) {
    parts.push(item.content);
  }
  return parts.join("\n");
}

function formatTool(item: Extract<ConversationItem, { kind: "tool" }>) {
  const parts = [`Tool: ${item.title}`];
  if (item.detail) {
    parts.push(item.detail);
  }
  if (item.status) {
    parts.push(`Status: ${item.status}`);
  }
  if (item.output) {
    parts.push(item.output);
  }
  if (item.changes && item.changes.length > 0) {
    parts.push(
      "Changes:\n" +
        item.changes
          .map((change) => `- ${change.path}${change.kind ? ` (${change.kind})` : ""}`)
          .join("\n"),
    );
  }
  return parts.join("\n");
}

function formatDiff(item: Extract<ConversationItem, { kind: "diff" }>) {
  const header = `Diff: ${item.title}`;
  const status = item.status ? `Status: ${item.status}` : null;
  return [header, status, item.diff].filter(Boolean).join("\n");
}

function formatReview(item: Extract<ConversationItem, { kind: "review" }>) {
  return `Review (${item.state}): ${item.text}`;
}

function formatExplore(item: Extract<ConversationItem, { kind: "explore" }>) {
  const title = item.status === "exploring" ? "Exploring" : "Explored";
  const lines = item.entries.map((entry) => {
    const prefix = entry.kind[0].toUpperCase() + entry.kind.slice(1);
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
