import type { ConversationItem } from "../types";

const MAX_ITEMS_PER_THREAD = 200;
const MAX_ITEM_TEXT = 20000;
const MAX_LARGE_TOOL_TEXT = 200000;
const TOOL_OUTPUT_RECENT_ITEMS = 40;
const LARGE_TOOL_TYPES = new Set(["fileChange", "commandExecution"]);
const READ_COMMANDS = new Set(["cat", "sed", "head", "tail", "less", "more", "nl"]);
const LIST_COMMANDS = new Set(["ls", "tree", "find", "fd"]);
const SEARCH_COMMANDS = new Set(["rg", "grep", "ripgrep", "findstr"]);
const PATH_HINT_REGEX = /[\\/]/;
const PATHLIKE_REGEX = /(\.[a-z0-9]+$)|(^\.{1,2}$)/i;
const GLOB_HINT_REGEX = /[*?[\]{}]/;
const RG_FLAGS_WITH_VALUES = new Set([
  "-g",
  "--glob",
  "--iglob",
  "-t",
  "--type",
  "--type-add",
  "--type-not",
  "-m",
  "--max-count",
  "-A",
  "-B",
  "-C",
  "--context",
  "--max-depth",
]);

function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function truncateText(text: string, maxLength = MAX_ITEM_TEXT) {
  if (text.length <= maxLength) {
    return text;
  }
  const sliceLength = Math.max(0, maxLength - 3);
  return `${text.slice(0, sliceLength)}...`;
}

function truncateToolText(toolType: string, text: string) {
  const maxLength = LARGE_TOOL_TYPES.has(toolType)
    ? MAX_LARGE_TOOL_TEXT
    : MAX_ITEM_TEXT;
  return truncateText(text, maxLength);
}

function normalizeStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => asString(entry)).filter(Boolean);
  }
  const single = asString(value);
  return single ? [single] : [];
}

function formatCollabAgentStates(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([id, state]) => {
      const status = asString(
        (state as Record<string, unknown>)?.status ?? state ?? "",
      );
      return status ? `${id}: ${status}` : id;
    })
    .filter(Boolean);
  if (entries.length === 0) {
    return "";
  }
  return entries.join("\n");
}

export function normalizeItem(item: ConversationItem): ConversationItem {
  if (item.kind === "message") {
    return { ...item, text: truncateText(item.text) };
  }
  if (item.kind === "explore") {
    return item;
  }
  if (item.kind === "reasoning") {
    return {
      ...item,
      summary: truncateText(item.summary),
      content: truncateText(item.content),
    };
  }
  if (item.kind === "diff") {
    return { ...item, diff: truncateText(item.diff) };
  }
  if (item.kind === "tool") {
    return {
      ...item,
      title: truncateText(item.title, 200),
      detail: truncateText(item.detail, 2000),
      output: item.output
        ? truncateToolText(item.toolType, item.output)
        : item.output,
      changes: item.changes
        ? item.changes.map((change) => ({
            ...change,
            diff: change.diff
              ? truncateToolText(item.toolType, change.diff)
              : change.diff,
          }))
        : item.changes,
    };
  }
  return item;
}

function cleanCommandText(commandText: string) {
  if (!commandText) {
    return "";
  }
  const trimmed = commandText.trim();
  const shellMatch = trimmed.match(
    /^(?:\/\S+\/)?(?:bash|zsh|sh|fish)(?:\.exe)?\s+-lc\s+(?:(['"])([\s\S]+)\1|([\s\S]+))$/,
  );
  const inner = shellMatch ? (shellMatch[2] ?? shellMatch[3] ?? "") : trimmed;
  const cdMatch = inner.match(
    /^\s*cd\s+[^&;]+(?:\s*&&\s*|\s*;\s*)([\s\S]+)$/i,
  );
  const stripped = cdMatch ? cdMatch[1] : inner;
  return stripped.trim();
}

function tokenizeCommand(command: string) {
  const tokens: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|`([^`]*)`|(\S+)/g;
  let match: RegExpExecArray | null = regex.exec(command);
  while (match) {
    const [, doubleQuoted, singleQuoted, backticked, bare] = match;
    const value = doubleQuoted ?? singleQuoted ?? backticked ?? bare ?? "";
    if (value) {
      tokens.push(value);
    }
    match = regex.exec(command);
  }
  return tokens;
}

function splitCommandSegments(command: string) {
  return command
    .split(/\s*(?:&&|;)\s*/g)
    .map((segment) => trimAtPipe(segment))
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function trimAtPipe(command: string) {
  if (!command) {
    return "";
  }
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char !== "|" || inSingle || inDouble) {
      continue;
    }
    const prev = index > 0 ? command[index - 1] : "";
    const next = index + 1 < command.length ? command[index + 1] : "";
    const prevIsSpace = prev === "" || /\s/.test(prev);
    const nextIsSpace = next === "" || /\s/.test(next);
    if (!prevIsSpace || !nextIsSpace) {
      continue;
    }
    return command.slice(0, index).trim();
  }
  return command.trim();
}

function isOptionToken(token: string) {
  return token.startsWith("-");
}

function isPathLike(token: string) {
  if (!token || isOptionToken(token)) {
    return false;
  }
  if (GLOB_HINT_REGEX.test(token)) {
    return false;
  }
  return PATH_HINT_REGEX.test(token) || PATHLIKE_REGEX.test(token);
}

function collectNonFlagOperands(tokens: string[], commandName: string) {
  const operands: string[] = [];
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (isOptionToken(token)) {
      if (commandName === "rg" && RG_FLAGS_WITH_VALUES.has(token)) {
        index += 1;
      }
      continue;
    }
    operands.push(token);
  }
  return operands;
}

function findPathTokens(tokens: string[]) {
  const commandName = tokens[0]?.toLowerCase() ?? "";
  const positional = collectNonFlagOperands(tokens, commandName);
  const pathLike = positional.filter(isPathLike);
  return pathLike.length > 0 ? pathLike : positional;
}

function normalizeCommandStatus(status?: string) {
  const normalized = (status ?? "").toLowerCase();
  return /(pending|running|processing|started|in[_ -]?progress|inprogress)/.test(
    normalized,
  )
    ? "exploring"
    : "explored";
}

function isFailedStatus(status?: string) {
  const normalized = (status ?? "").toLowerCase();
  return /(fail|error)/.test(normalized);
}

type ExploreEntry = Extract<ConversationItem, { kind: "explore" }>["entries"][number];
type ExploreItem = Extract<ConversationItem, { kind: "explore" }>;

function parseSearch(tokens: string[]): ExploreEntry | null {
  const commandName = tokens[0]?.toLowerCase() ?? "";
  const hasFilesFlag = tokens.some((token) => token === "--files");
  if (tokens[0] === "rg" && hasFilesFlag) {
    const paths = findPathTokens(tokens);
    const path = paths[paths.length - 1] || "rg --files";
    return { kind: "list", label: path };
  }
  const positional = collectNonFlagOperands(tokens, commandName);
  if (positional.length === 0) {
    return null;
  }
  const query = positional[0];
  const rawPath = positional.length > 1 ? positional[1] : "";
  const path =
    commandName === "rg" ? rawPath : rawPath && isPathLike(rawPath) ? rawPath : "";
  const label = path ? `${query} in ${path}` : query;
  return { kind: "search", label };
}

function parseRead(tokens: string[]): ExploreEntry[] | null {
  const paths = findPathTokens(tokens).filter(Boolean);
  if (paths.length === 0) {
    return null;
  }
  const entries = paths.map((path) => {
    const name = path.split(/[\\/]/g).filter(Boolean).pop() ?? path;
    return name && name !== path
      ? ({ kind: "read", label: name, detail: path } satisfies ExploreEntry)
      : ({ kind: "read", label: path } satisfies ExploreEntry);
  });
  const seen = new Set<string>();
  const deduped: ExploreEntry[] = [];
  for (const entry of entries) {
    const key = entry.detail ? `${entry.label}|${entry.detail}` : entry.label;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function parseList(tokens: string[]): ExploreEntry {
  const paths = findPathTokens(tokens);
  const path = paths[paths.length - 1];
  return { kind: "list", label: path || tokens[0] };
}

function parseCommandSegment(command: string): ExploreEntry[] | null {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) {
    return null;
  }
  const commandName = tokens[0].toLowerCase();
  if (READ_COMMANDS.has(commandName)) {
    return parseRead(tokens);
  }
  if (LIST_COMMANDS.has(commandName)) {
    return [parseList(tokens)];
  }
  if (SEARCH_COMMANDS.has(commandName)) {
    const entry = parseSearch(tokens);
    return entry ? [entry] : null;
  }
  return null;
}

function coalesceReadEntries(entries: ExploreEntry[]) {
  const result: ExploreEntry[] = [];
  const seenReads = new Set<string>();

  for (const entry of entries) {
    if (entry.kind !== "read") {
      result.push(entry);
      continue;
    }
    const key = entry.detail ? `${entry.label}|${entry.detail}` : entry.label;
    if (seenReads.has(key)) {
      continue;
    }
    seenReads.add(key);
    result.push(entry);
  }
  return result;
}

function mergeExploreEntries(base: ExploreEntry[], next: ExploreEntry[]) {
  const merged = [...base, ...next];
  const seen = new Set<string>();
  const deduped: ExploreEntry[] = [];
  for (const entry of merged) {
    const key = `${entry.kind}|${entry.label}|${entry.detail ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function summarizeCommandExecution(item: Extract<ConversationItem, { kind: "tool" }>) {
  if (isFailedStatus(item.status)) {
    return null;
  }
  const rawCommand = item.title.replace(/^Command:\s*/i, "").trim();
  const cleaned = cleanCommandText(rawCommand);
  if (!cleaned) {
    return null;
  }
  const segments = splitCommandSegments(cleaned);
  if (segments.length === 0) {
    return null;
  }
  const entries: ExploreEntry[] = [];
  for (const segment of segments) {
    const parsed = parseCommandSegment(segment);
    if (!parsed) {
      return null;
    }
    entries.push(...parsed);
  }
  if (entries.length === 0) {
    return null;
  }
  const coalescedEntries = coalesceReadEntries(entries);
  const status: ExploreItem["status"] = normalizeCommandStatus(item.status);
  const summary: ExploreItem = {
    id: item.id,
    kind: "explore",
    status,
    entries: coalescedEntries,
  };
  return summary;
}

function summarizeExploration(items: ConversationItem[]) {
  const result: ConversationItem[] = [];

  for (const item of items) {
    if (item.kind === "explore") {
      const last = result[result.length - 1];
      if (last?.kind === "explore" && last.status === item.status) {
        result[result.length - 1] = {
          ...last,
          entries: mergeExploreEntries(last.entries, item.entries),
        };
        continue;
      }
      result.push(item);
      continue;
    }
    if (item.kind === "tool" && item.toolType === "commandExecution") {
      const summary = summarizeCommandExecution(item);
      if (!summary) {
        result.push(item);
        continue;
      }
      const last = result[result.length - 1];
      if (last?.kind === "explore" && last.status === summary.status) {
        result[result.length - 1] = {
          ...last,
          entries: mergeExploreEntries(last.entries, summary.entries),
        };
        continue;
      }
      result.push(summary);
      continue;
    }
    result.push(item);
  }
  return result;
}

export function prepareThreadItems(items: ConversationItem[]) {
  const filtered: ConversationItem[] = [];
  for (const item of items) {
    const last = filtered[filtered.length - 1];
    if (
      item.kind === "message" &&
      item.role === "assistant" &&
      last?.kind === "review" &&
      last.state === "completed" &&
      item.text.trim() === last.text.trim()
    ) {
      continue;
    }
    filtered.push(item);
  }
  const normalized = filtered.map((item) => normalizeItem(item));
  const limited =
    normalized.length > MAX_ITEMS_PER_THREAD
      ? normalized.slice(-MAX_ITEMS_PER_THREAD)
      : normalized;
  const summarized = summarizeExploration(limited);
  const cutoff = Math.max(0, summarized.length - TOOL_OUTPUT_RECENT_ITEMS);
  return summarized.map((item, index) => {
    if (index >= cutoff || item.kind !== "tool") {
      return item;
    }
    const output = item.output ? truncateText(item.output) : item.output;
    const changes = item.changes
      ? item.changes.map((change) => ({
          ...change,
          diff: change.diff ? truncateText(change.diff) : change.diff,
        }))
      : item.changes;
    if (output === item.output && changes === item.changes) {
      return item;
    }
    return { ...item, output, changes };
  });
}

export function upsertItem(list: ConversationItem[], item: ConversationItem) {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) {
    return [...list, item];
  }
  const existing = list[index];
  const next = [...list];

  if (existing.kind !== item.kind) {
    next[index] = item;
    return next;
  }

  if (existing.kind === "message" && item.kind === "message") {
    const existingText = existing.text ?? "";
    const incomingText = item.text ?? "";
    next[index] = {
      ...existing,
      ...item,
      text: incomingText.length >= existingText.length ? incomingText : existingText,
      images: item.images?.length ? item.images : existing.images,
    };
    return next;
  }

  if (existing.kind === "reasoning" && item.kind === "reasoning") {
    const existingSummary = existing.summary ?? "";
    const incomingSummary = item.summary ?? "";
    const existingContent = existing.content ?? "";
    const incomingContent = item.content ?? "";
    next[index] = {
      ...existing,
      ...item,
      summary:
        incomingSummary.length >= existingSummary.length
          ? incomingSummary
          : existingSummary,
      content:
        incomingContent.length >= existingContent.length
          ? incomingContent
          : existingContent,
    };
    return next;
  }

  if (existing.kind === "tool" && item.kind === "tool") {
    const existingOutput = existing.output ?? "";
    const incomingOutput = item.output ?? "";
    const hasIncomingOutput = incomingOutput.trim().length > 0;
    const hasIncomingChanges = (item.changes?.length ?? 0) > 0;
    next[index] = {
      ...existing,
      ...item,
      title: item.title?.trim() ? item.title : existing.title,
      detail: item.detail?.trim() ? item.detail : existing.detail,
      status: item.status?.trim() ? item.status : existing.status,
      output: hasIncomingOutput ? incomingOutput : existingOutput,
      changes: hasIncomingChanges ? item.changes : existing.changes,
      durationMs:
        typeof item.durationMs === "number" ? item.durationMs : existing.durationMs,
    };
    return next;
  }

  if (existing.kind === "diff" && item.kind === "diff") {
    const existingDiff = existing.diff ?? "";
    const incomingDiff = item.diff ?? "";
    next[index] = {
      ...existing,
      ...item,
      title: item.title?.trim() ? item.title : existing.title,
      status: item.status?.trim() ? item.status : existing.status,
      diff: incomingDiff.length >= existingDiff.length ? incomingDiff : existingDiff,
    };
    return next;
  }

  if (existing.kind === "review" && item.kind === "review") {
    const existingText = existing.text ?? "";
    const incomingText = item.text ?? "";
    next[index] = {
      ...existing,
      ...item,
      text: incomingText.length >= existingText.length ? incomingText : existingText,
    };
    return next;
  }

  next[index] = { ...existing, ...item };
  return next;
}

function normalizeThreadTimestamp(raw: unknown) {
  let numeric: number;
  if (typeof raw === "string") {
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber)) {
      numeric = asNumber;
    } else {
      const parsed = Date.parse(raw);
      if (!Number.isFinite(parsed)) {
        return 0;
      }
      numeric = parsed;
    }
  } else {
    numeric = Number(raw);
  }
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}

export function getThreadTimestamp(thread: Record<string, unknown>) {
  const raw =
    (thread.updatedAt ?? thread.updated_at ?? thread.createdAt ?? thread.created_at) ??
    0;
  return normalizeThreadTimestamp(raw);
}

export function getThreadCreatedTimestamp(thread: Record<string, unknown>) {
  const raw = (thread.createdAt ?? thread.created_at) ?? 0;
  return normalizeThreadTimestamp(raw);
}

export function previewThreadName(text: string, fallback: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed;
}

export function buildConversationItem(
  item: Record<string, unknown>,
): ConversationItem | null {
  const type = asString(item.type);
  const id = asString(item.id);
  if (!id || !type) {
    return null;
  }
  if (type === "agentMessage") {
    return null;
  }
  if (type === "userMessage") {
    const content = Array.isArray(item.content) ? item.content : [];
    const { text, images } = parseUserInputs(content);
    return {
      id,
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
    const tool = asString(item.tool ?? "");
    const status = asString(item.status ?? "");
    const sender = asString(item.senderThreadId ?? item.sender_thread_id ?? "");
    const receivers = [
      ...normalizeStringList(item.receiverThreadId ?? item.receiver_thread_id),
      ...normalizeStringList(item.receiverThreadIds ?? item.receiver_thread_ids),
      ...normalizeStringList(item.newThreadId ?? item.new_thread_id),
    ];
    const prompt = asString(item.prompt ?? "");
    const agentsState = formatCollabAgentStates(
      item.agentStatus ?? item.agentsStates ?? item.agents_states,
    );
    const detailParts = [sender ? `From ${sender}` : ""]
      .concat(receivers.length > 0 ? `→ ${receivers.join(", ")}` : "")
      .filter(Boolean);
    const outputParts = [prompt, agentsState].filter(Boolean);
    return {
      id,
      kind: "tool",
      toolType: "collabToolCall",
      title: tool ? `Collab: ${tool}` : "Collab tool call",
      detail: detailParts.join(" "),
      status,
      output: outputParts.join("\n\n"),
    };
  }
  if (type === "webSearch") {
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "Web search",
      detail: asString(item.query ?? ""),
      status: "",
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

export function buildConversationItemFromThreadItem(
  item: Record<string, unknown>,
): ConversationItem | null {
  const type = asString(item.type);
  const id = asString(item.id);
  if (!id || !type) {
    return null;
  }
  if (type === "userMessage") {
    const content = Array.isArray(item.content) ? item.content : [];
    const { text, images } = parseUserInputs(content);
    return {
      id,
      kind: "message",
      role: "user",
      text,
      images: images.length > 0 ? images : undefined,
    };
  }
  if (type === "agentMessage") {
    return {
      id,
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
    const turnItems = Array.isArray(turnRecord.items)
      ? (turnRecord.items as Record<string, unknown>[])
      : [];
    turnItems.forEach((item) => {
      const converted = buildConversationItemFromThreadItem(item);
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

function chooseRicherItem(remote: ConversationItem, local: ConversationItem) {
  if (remote.kind !== local.kind) {
    return remote;
  }
  if (remote.kind === "message" && local.kind === "message") {
    return local.text.length > remote.text.length ? local : remote;
  }
  if (remote.kind === "reasoning" && local.kind === "reasoning") {
    const remoteLength = remote.summary.length + remote.content.length;
    const localLength = local.summary.length + local.content.length;
    return localLength > remoteLength ? local : remote;
  }
  if (remote.kind === "tool" && local.kind === "tool") {
    const remoteOutput = remote.output ?? "";
    const localOutput = local.output ?? "";
    const hasRemoteOutput = remoteOutput.trim().length > 0;
    return {
      ...remote,
      status: remote.status ?? local.status,
      output: hasRemoteOutput ? remoteOutput : localOutput,
      changes: remote.changes ?? local.changes,
    };
  }
  if (remote.kind === "diff" && local.kind === "diff") {
    const useLocal = local.diff.length > remote.diff.length;
    return {
      ...remote,
      diff: useLocal ? local.diff : remote.diff,
      status: remote.status ?? local.status,
    };
  }
  return remote;
}

export function mergeThreadItems(
  remoteItems: ConversationItem[],
  localItems: ConversationItem[],
) {
  if (!localItems.length) {
    return remoteItems;
  }
  const byId = new Map(remoteItems.map((item) => [item.id, item]));
  const merged = remoteItems.map((item) => {
    const local = localItems.find((entry) => entry.id === item.id);
    return local ? chooseRicherItem(item, local) : item;
  });
  localItems.forEach((item) => {
    if (!byId.has(item.id)) {
      merged.push(item);
    }
  });
  return merged;
}
