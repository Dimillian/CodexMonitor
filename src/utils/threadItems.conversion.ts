import type { ConversationItem } from "../types";
import { parseCollabToolCallItem } from "./threadItems.collab";
import { asNumber, asString } from "./threadItems.shared";

function extractTurnId(record: Record<string, unknown>) {
  return asString(record.turnId ?? record.turn_id ?? record.id).trim();
}

function extractImageInputValue(input: Record<string, unknown>) {
  const value =
    asString(input.url ?? "") ||
    asString(input.path ?? "") ||
    asString(input.value ?? "") ||
    asString(input.data ?? "") ||
    asString(input.source ?? "");
  return value.trim();
}

function parseUserInputs(inputs: Array<Record<string, unknown>>) {
  const textParts: string[] = [];
  const images: string[] = [];
  inputs.forEach((input) => {
    const type = asString(input.type);
    if (type === "text") {
      const text = asString(input.text);
      if (text) {
        textParts.push(text);
      }
      return;
    }
    if (type === "skill") {
      const name = asString(input.name);
      if (name) {
        textParts.push(`$${name}`);
      }
      return;
    }
    if (type === "image" || type === "localImage") {
      const value = extractImageInputValue(input);
      if (value) {
        images.push(value);
      }
    }
  });
  return { text: textParts.join(" ").trim(), images };
}

export function buildConversationItem(
  item: Record<string, unknown>,
): ConversationItem | null {
  const type = asString(item.type);
  const id = asString(item.id);
  const turnId = extractTurnId(item);
  if (!id || !type) {
    return null;
  }
  if (type === "agentMessage") {
    return null;
  }
  if (type === "userMessage") {
    const content = Array.isArray(item.content) ? item.content : [];
    const { text, images } = parseUserInputs(content as Array<Record<string, unknown>>);
    return {
      id,
      ...(turnId ? { turnId } : {}),
      kind: "message",
      role: "user",
      text,
      images: images.length > 0 ? images : undefined,
    };
  }
  if (type === "reasoning") {
    const summary = asString(item.summary ?? "");
    const content = Array.isArray(item.content)
      ? item.content.map((entry) => asString(entry)).join("\n")
      : asString(item.content ?? "");
    return { id, kind: "reasoning", summary, content };
  }
  if (type === "plan") {
    return {
      id,
      kind: "tool",
      toolType: "plan",
      title: "Plan",
      detail: asString(item.status ?? ""),
      status: asString(item.status ?? ""),
      output: asString(item.text ?? ""),
    };
  }
  if (type === "commandExecution") {
    const command = Array.isArray(item.command)
      ? item.command.map((part) => asString(part)).join(" ")
      : asString(item.command ?? "");
    const durationMs = asNumber(item.durationMs ?? item.duration_ms);
    return {
      id,
      kind: "tool",
      toolType: type,
      title: command ? `Command: ${command}` : "Command",
      detail: asString(item.cwd ?? ""),
      status: asString(item.status ?? ""),
      output: asString(item.aggregatedOutput ?? ""),
      durationMs,
    };
  }
  if (type === "fileChange") {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const normalizedChanges = changes
      .map((change) => {
        const path = asString(change?.path ?? "");
        const kind = change?.kind as Record<string, unknown> | string | undefined;
        const kindType =
          typeof kind === "string"
            ? kind
            : typeof kind === "object" && kind
              ? asString((kind as Record<string, unknown>).type ?? "")
              : "";
        const normalizedKind = kindType ? kindType.toLowerCase() : "";
        const diff = asString(change?.diff ?? "");
        return { path, kind: normalizedKind || undefined, diff: diff || undefined };
      })
      .filter((change) => change.path);
    const formattedChanges = normalizedChanges
      .map((change) => {
        const prefix =
          change.kind === "add"
            ? "A"
            : change.kind === "delete"
              ? "D"
              : change.kind
                ? "M"
                : "";
        return [prefix, change.path].filter(Boolean).join(" ");
      })
      .filter(Boolean);
    const paths = formattedChanges.join(", ");
    const diffOutput = normalizedChanges
      .map((change) => change.diff ?? "")
      .filter(Boolean)
      .join("\n\n");
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "File changes",
      detail: paths || "Pending changes",
      status: asString(item.status ?? ""),
      output: diffOutput,
      changes: normalizedChanges,
    };
  }
  if (type === "mcpToolCall") {
    const server = asString(item.server ?? "");
    const tool = asString(item.tool ?? "");
    const args = item.arguments ? JSON.stringify(item.arguments, null, 2) : "";
    return {
      id,
      kind: "tool",
      toolType: type,
      title: `Tool: ${server}${tool ? ` / ${tool}` : ""}`,
      detail: args,
      status: asString(item.status ?? ""),
      output: asString(item.result ?? item.error ?? ""),
    };
  }
  if (type === "collabToolCall" || type === "collabAgentToolCall") {
    return parseCollabToolCallItem(item);
  }
  if (type === "webSearch") {
    const status = asString(item.status ?? "").trim();
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "Web search",
      detail: asString(item.query ?? ""),
      status: status || "completed",
      output: "",
    };
  }
  if (type === "imageView") {
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "Image view",
      detail: asString(item.path ?? ""),
      status: "",
      output: "",
    };
  }
  if (type === "contextCompaction") {
    const status = asString(item.status ?? "").trim();
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "Context compaction",
      detail: "Compacting conversation context to fit token limits.",
      status: status || "completed",
      output: "",
    };
  }
  if (type === "enteredReviewMode" || type === "exitedReviewMode") {
    return {
      id,
      kind: "review",
      state: type === "enteredReviewMode" ? "started" : "completed",
      text: asString(item.review ?? ""),
    };
  }
  return null;
}

export function buildConversationItemFromThreadItem(
  item: Record<string, unknown>,
  turnIdOverride?: string,
): ConversationItem | null {
  const type = asString(item.type);
  const id = asString(item.id);
  const turnId = turnIdOverride || extractTurnId(item);
  if (!id || !type) {
    return null;
  }
  if (type === "userMessage") {
    const content = Array.isArray(item.content) ? item.content : [];
    const { text, images } = parseUserInputs(content as Array<Record<string, unknown>>);
    return {
      id,
      ...(turnId ? { turnId } : {}),
      kind: "message",
      role: "user",
      text,
      images: images.length > 0 ? images : undefined,
    };
  }
  if (type === "agentMessage") {
    return {
      id,
      ...(turnId ? { turnId } : {}),
      kind: "message",
      role: "assistant",
      text: asString(item.text),
    };
  }
  if (type === "reasoning") {
    const summary = Array.isArray(item.summary)
      ? item.summary.map((entry) => asString(entry)).join("\n")
      : asString(item.summary ?? "");
    const content = Array.isArray(item.content)
      ? item.content.map((entry) => asString(entry)).join("\n")
      : asString(item.content ?? "");
    return { id, kind: "reasoning", summary, content };
  }
  return buildConversationItem(item);
}

export function buildItemsFromThread(thread: Record<string, unknown>) {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const items: ConversationItem[] = [];
  turns.forEach((turn) => {
    const turnRecord = turn as Record<string, unknown>;
    const turnId = extractTurnId(turnRecord);
    const turnItems = Array.isArray(turnRecord.items)
      ? (turnRecord.items as Record<string, unknown>[])
      : [];
    turnItems.forEach((item) => {
      const converted = buildConversationItemFromThreadItem(item, turnId);
      if (converted) {
        items.push(converted);
      }
    });
  });
  return items;
}

export function isReviewingFromThread(thread: Record<string, unknown>) {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  let reviewing = false;
  turns.forEach((turn) => {
    const turnRecord = turn as Record<string, unknown>;
    const turnItems = Array.isArray(turnRecord.items)
      ? (turnRecord.items as Record<string, unknown>[])
      : [];
    turnItems.forEach((item) => {
      const type = asString(item?.type ?? "");
      if (type === "enteredReviewMode") {
        reviewing = true;
      } else if (type === "exitedReviewMode") {
        reviewing = false;
      }
    });
  });
  return reviewing;
}
