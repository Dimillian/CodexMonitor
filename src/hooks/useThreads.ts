import { useCallback, useMemo, useReducer, useRef } from "react";
import type {
  ApprovalRequest,
  ConversationItem,
  DebugEntry,
  ThreadSummary,
  WorkspaceInfo,
} from "../types";
import {
  respondToServerRequest,
  sendUserMessage as sendUserMessageService,
  startReview as startReviewService,
  startThread as startThreadService,
  listThreads as listThreadsService,
  resumeThread as resumeThreadService,
  archiveThread as archiveThreadService,
} from "../services/tauri";
import { useAppServerEvents } from "./useAppServerEvents";

const emptyItems: Record<string, ConversationItem[]> = {};

type ThreadState = {
  activeThreadIdByWorkspace: Record<string, string | null>;
  itemsByThread: Record<string, ConversationItem[]>;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadStatusById: Record<
    string,
    { isProcessing: boolean; hasUnread: boolean; isReviewing: boolean }
  >;
  approvals: ApprovalRequest[];
};

type ThreadAction =
  | { type: "setActiveThreadId"; workspaceId: string; threadId: string | null }
  | { type: "ensureThread"; workspaceId: string; threadId: string }
  | { type: "removeThread"; workspaceId: string; threadId: string }
  | { type: "markProcessing"; threadId: string; isProcessing: boolean }
  | { type: "markReviewing"; threadId: string; isReviewing: boolean }
  | { type: "markUnread"; threadId: string; hasUnread: boolean }
  | { type: "addUserMessage"; threadId: string; text: string }
  | { type: "setThreadName"; workspaceId: string; threadId: string; name: string }
  | { type: "appendAgentDelta"; threadId: string; itemId: string; delta: string }
  | { type: "completeAgentMessage"; threadId: string; itemId: string; text: string }
  | { type: "upsertItem"; threadId: string; item: ConversationItem }
  | { type: "setThreadItems"; threadId: string; items: ConversationItem[] }
  | {
      type: "appendReasoningSummary";
      threadId: string;
      itemId: string;
      delta: string;
    }
  | { type: "appendReasoningContent"; threadId: string; itemId: string; delta: string }
  | { type: "appendToolOutput"; threadId: string; itemId: string; delta: string }
  | { type: "setThreads"; workspaceId: string; threads: ThreadSummary[] }
  | { type: "addApproval"; approval: ApprovalRequest }
  | { type: "removeApproval"; requestId: number };

const initialState: ThreadState = {
  activeThreadIdByWorkspace: {},
  itemsByThread: emptyItems,
  threadsByWorkspace: {},
  threadStatusById: {},
  approvals: [],
};

function upsertItem(list: ConversationItem[], item: ConversationItem) {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) {
    return [...list, item];
  }
  const next = [...list];
  next[index] = { ...next[index], ...item };
  return next;
}

function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case "setActiveThreadId":
      return {
        ...state,
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]: action.threadId,
        },
        threadStatusById: action.threadId
          ? {
              ...state.threadStatusById,
              [action.threadId]: {
                isProcessing:
                  state.threadStatusById[action.threadId]?.isProcessing ?? false,
                hasUnread: false,
                isReviewing:
                  state.threadStatusById[action.threadId]?.isReviewing ?? false,
              },
            }
          : state.threadStatusById,
      };
    case "ensureThread": {
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      if (list.some((thread) => thread.id === action.threadId)) {
        return state;
      }
      const thread: ThreadSummary = {
        id: action.threadId,
        name: `Agent ${list.length + 1}`,
      };
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: [thread, ...list],
        },
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: {
            isProcessing: false,
            hasUnread: false,
            isReviewing: false,
          },
        },
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]:
            state.activeThreadIdByWorkspace[action.workspaceId] ?? action.threadId,
        },
      };
    }
    case "removeThread": {
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      const filtered = list.filter((thread) => thread.id !== action.threadId);
      const nextActive =
        state.activeThreadIdByWorkspace[action.workspaceId] === action.threadId
          ? filtered[0]?.id ?? null
          : state.activeThreadIdByWorkspace[action.workspaceId] ?? null;
      const { [action.threadId]: _, ...restItems } = state.itemsByThread;
      const { [action.threadId]: __, ...restStatus } = state.threadStatusById;
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: filtered,
        },
        itemsByThread: restItems,
        threadStatusById: restStatus,
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]: nextActive,
        },
      };
    }
    case "markProcessing":
      return {
        ...state,
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: {
            isProcessing: action.isProcessing,
            hasUnread: state.threadStatusById[action.threadId]?.hasUnread ?? false,
            isReviewing:
              state.threadStatusById[action.threadId]?.isReviewing ?? false,
          },
        },
      };
    case "markReviewing":
      return {
        ...state,
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: {
            isProcessing:
              state.threadStatusById[action.threadId]?.isProcessing ?? false,
            hasUnread: state.threadStatusById[action.threadId]?.hasUnread ?? false,
            isReviewing: action.isReviewing,
          },
        },
      };
    case "markUnread":
      return {
        ...state,
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: {
            isProcessing:
              state.threadStatusById[action.threadId]?.isProcessing ?? false,
            hasUnread: action.hasUnread,
            isReviewing:
              state.threadStatusById[action.threadId]?.isReviewing ?? false,
          },
        },
      };
    case "addUserMessage": {
      const list = state.itemsByThread[action.threadId] ?? [];
      const message: ConversationItem = {
        id: `${Date.now()}-user`,
        kind: "message",
        role: "user",
        text: action.text,
      };
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: [...list, message],
        },
      };
    }
    case "setThreadName": {
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      const next = list.map((thread) =>
        thread.id === action.threadId ? { ...thread, name: action.name } : thread,
      );
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: next,
        },
      };
    }
    case "appendAgentDelta": {
      const list = [...(state.itemsByThread[action.threadId] ?? [])];
      const index = list.findIndex((msg) => msg.id === action.itemId);
      if (index >= 0 && list[index].kind === "message") {
        const existing = list[index] as Extract<ConversationItem, { kind: "message" }>;
        list[index] = {
          ...existing,
          text: `${existing.text}${action.delta}`,
        };
      } else {
        list.push({
          id: action.itemId,
          kind: "message",
          role: "assistant",
          text: action.delta,
        });
      }
      return {
        ...state,
        itemsByThread: { ...state.itemsByThread, [action.threadId]: list },
      };
    }
    case "completeAgentMessage": {
      const list = [...(state.itemsByThread[action.threadId] ?? [])];
      const index = list.findIndex((msg) => msg.id === action.itemId);
      if (index >= 0 && list[index].kind === "message") {
        const existing = list[index] as Extract<ConversationItem, { kind: "message" }>;
        list[index] = {
          ...existing,
          text: action.text || existing.text,
        };
      } else {
        list.push({
          id: action.itemId,
          kind: "message",
          role: "assistant",
          text: action.text,
        });
      }
      return {
        ...state,
        itemsByThread: { ...state.itemsByThread, [action.threadId]: list },
      };
    }
    case "upsertItem": {
      const list = state.itemsByThread[action.threadId] ?? [];
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: upsertItem(list, action.item),
        },
      };
    }
    case "setThreadItems":
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: action.items,
        },
      };
    case "appendReasoningSummary": {
      const list = state.itemsByThread[action.threadId] ?? [];
      const index = list.findIndex((entry) => entry.id === action.itemId);
      const base =
        index >= 0 && list[index].kind === "reasoning"
          ? (list[index] as ConversationItem)
          : {
              id: action.itemId,
              kind: "reasoning",
              summary: "",
              content: "",
            };
      const updated: ConversationItem = {
        ...base,
        summary: `${"summary" in base ? base.summary : ""}${action.delta}`,
      } as ConversationItem;
      const next = index >= 0 ? [...list] : [...list, updated];
      if (index >= 0) {
        next[index] = updated;
      }
      return {
        ...state,
        itemsByThread: { ...state.itemsByThread, [action.threadId]: next },
      };
    }
    case "appendReasoningContent": {
      const list = state.itemsByThread[action.threadId] ?? [];
      const index = list.findIndex((entry) => entry.id === action.itemId);
      const base =
        index >= 0 && list[index].kind === "reasoning"
          ? (list[index] as ConversationItem)
          : {
              id: action.itemId,
              kind: "reasoning",
              summary: "",
              content: "",
            };
      const updated: ConversationItem = {
        ...base,
        content: `${"content" in base ? base.content : ""}${action.delta}`,
      } as ConversationItem;
      const next = index >= 0 ? [...list] : [...list, updated];
      if (index >= 0) {
        next[index] = updated;
      }
      return {
        ...state,
        itemsByThread: { ...state.itemsByThread, [action.threadId]: next },
      };
    }
    case "appendToolOutput": {
      const list = state.itemsByThread[action.threadId] ?? [];
      const index = list.findIndex((entry) => entry.id === action.itemId);
      if (index < 0 || list[index].kind !== "tool") {
        return state;
      }
      const existing = list[index] as Extract<ConversationItem, { kind: "tool" }>;
      const updated: ConversationItem = {
        ...existing,
        output: `${existing.output ?? ""}${action.delta}`,
      };
      const next = [...list];
      next[index] = updated;
      return {
        ...state,
        itemsByThread: { ...state.itemsByThread, [action.threadId]: next },
      };
    }
    case "addApproval":
      return { ...state, approvals: [...state.approvals, action.approval] };
    case "removeApproval":
      return {
        ...state,
        approvals: state.approvals.filter(
          (item) => item.request_id !== action.requestId,
        ),
      };
    case "setThreads": {
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: action.threads,
        },
      };
    }
    default:
      return state;
  }
}

type UseThreadsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onWorkspaceConnected: (id: string) => void;
  onDebug?: (entry: DebugEntry) => void;
  model?: string | null;
  effort?: string | null;
  accessMode?: "read-only" | "current" | "full-access";
  onMessageActivity?: () => void;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function parseReviewTarget(input: string) {
  const trimmed = input.trim();
  const rest = trimmed.replace(/^\/review\b/i, "").trim();
  if (!rest) {
    return { type: "uncommittedChanges" } as const;
  }
  const lower = rest.toLowerCase();
  if (lower.startsWith("base ")) {
    const branch = rest.slice(5).trim();
    return { type: "baseBranch", branch } as const;
  }
  if (lower.startsWith("commit ")) {
    const payload = rest.slice(7).trim();
    const [sha, ...titleParts] = payload.split(/\s+/);
    const title = titleParts.join(" ").trim();
    return {
      type: "commit",
      sha,
      ...(title ? { title } : {}),
    } as const;
  }
  if (lower.startsWith("custom ")) {
    const instructions = rest.slice(7).trim();
    return { type: "custom", instructions } as const;
  }
  return { type: "custom", instructions: rest } as const;
}

function formatReviewLabel(target: ReturnType<typeof parseReviewTarget>) {
  if (target.type === "uncommittedChanges") {
    return "current changes";
  }
  if (target.type === "baseBranch") {
    return `base branch ${target.branch}`;
  }
  if (target.type === "commit") {
    return target.title
      ? `commit ${target.sha}: ${target.title}`
      : `commit ${target.sha}`;
  }
  const instructions = target.instructions.trim();
  if (!instructions) {
    return "custom review";
  }
  return instructions.length > 80
    ? `${instructions.slice(0, 80)}…`
    : instructions;
}

function buildConversationItem(item: Record<string, unknown>): ConversationItem | null {
  const type = asString(item.type);
  const id = asString(item.id);
  if (!id || !type) {
    return null;
  }
  if (type === "agentMessage" || type === "userMessage") {
    return null;
  }
  if (type === "reasoning") {
    const summary = asString(item.summary ?? "");
    const content = Array.isArray(item.content)
      ? item.content.map((entry) => asString(entry)).join("\n")
      : asString(item.content ?? "");
    return { id, kind: "reasoning", summary, content };
  }
  if (type === "commandExecution") {
    const command = Array.isArray(item.command)
      ? item.command.map((part) => asString(part)).join(" ")
      : asString(item.command ?? "");
    return {
      id,
      kind: "tool",
      toolType: type,
      title: command ? `Command: ${command}` : "Command",
      detail: asString(item.cwd ?? ""),
      status: asString(item.status ?? ""),
      output: asString(item.aggregatedOutput ?? ""),
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

function userInputsToText(inputs: Array<Record<string, unknown>>) {
  return inputs
    .map((input) => {
      const type = asString(input.type);
      if (type === "text") {
        return asString(input.text);
      }
      if (type === "skill") {
        const name = asString(input.name);
        return name ? `$${name}` : "";
      }
      if (type === "image" || type === "localImage") {
        return "[image]";
      }
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildConversationItemFromThreadItem(
  item: Record<string, unknown>,
): ConversationItem | null {
  const type = asString(item.type);
  const id = asString(item.id);
  if (!id || !type) {
    return null;
  }
  if (type === "userMessage") {
    const content = Array.isArray(item.content) ? item.content : [];
    const text = userInputsToText(content);
    return {
      id,
      kind: "message",
      role: "user",
      text: text || "[message]",
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

function buildItemsFromThread(thread: Record<string, unknown>) {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const items: ConversationItem[] = [];
  turns.forEach((turn) => {
    const turnItems = Array.isArray((turn as any)?.items) ? (turn as any).items : [];
    turnItems.forEach((item: Record<string, unknown>) => {
      const converted = buildConversationItemFromThreadItem(item);
      if (converted) {
        items.push(converted);
      }
    });
  });
  return items;
}

function isReviewingFromThread(thread: Record<string, unknown>) {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  let reviewing = false;
  turns.forEach((turn) => {
    const turnItems = Array.isArray((turn as any)?.items) ? (turn as any).items : [];
    turnItems.forEach((item) => {
      const type = asString((item as Record<string, unknown>)?.type ?? "");
      if (type === "enteredReviewMode") {
        reviewing = true;
      } else if (type === "exitedReviewMode") {
        reviewing = false;
      }
    });
  });
  return reviewing;
}

function previewThreadName(text: string, fallback: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.length > 38 ? `${trimmed.slice(0, 38)}…` : trimmed;
}

export function useThreads({
  activeWorkspace,
  onWorkspaceConnected,
  onDebug,
  model,
  effort,
  accessMode,
  onMessageActivity,
}: UseThreadsOptions) {
  const [state, dispatch] = useReducer(threadReducer, initialState);
  const loadedThreads = useRef<Record<string, boolean>>({});

  const activeWorkspaceId = activeWorkspace?.id ?? null;
  const activeThreadId = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }
    return state.activeThreadIdByWorkspace[activeWorkspaceId] ?? null;
  }, [activeWorkspaceId, state.activeThreadIdByWorkspace]);

  const activeItems = useMemo(
    () => (activeThreadId ? state.itemsByThread[activeThreadId] ?? [] : []),
    [activeThreadId, state.itemsByThread],
  );

  const handleWorkspaceConnected = useCallback(
    (workspaceId: string) => {
      onWorkspaceConnected(workspaceId);
    },
    [onWorkspaceConnected],
  );

  const handlers = useMemo(
    () => ({
      onWorkspaceConnected: handleWorkspaceConnected,
      onApprovalRequest: (approval: ApprovalRequest) => {
        dispatch({ type: "addApproval", approval });
      },
      onAppServerEvent: (event: { message?: { method?: string } }) => {
        const method = String(event.message?.method ?? "");
        const inferredSource =
          method === "codex/stderr" ? "stderr" : "event";
        onDebug?.({
          id: `${Date.now()}-server-event`,
          timestamp: Date.now(),
          source: inferredSource,
          label: method || "event",
          payload: event,
        });
      },
      onAgentMessageDelta: ({
        workspaceId,
        threadId,
        itemId,
        delta,
      }: {
        workspaceId: string;
        threadId: string;
        itemId: string;
        delta: string;
      }) => {
        dispatch({ type: "ensureThread", workspaceId, threadId });
        dispatch({ type: "appendAgentDelta", threadId, itemId, delta });
      },
      onAgentMessageCompleted: ({
        workspaceId,
        threadId,
        itemId,
        text,
      }: {
        workspaceId: string;
        threadId: string;
        itemId: string;
        text: string;
      }) => {
        dispatch({ type: "ensureThread", workspaceId, threadId });
        dispatch({ type: "completeAgentMessage", threadId, itemId, text });
        dispatch({ type: "markProcessing", threadId, isProcessing: false });
        try {
          void onMessageActivity?.();
        } catch {
          // Ignore refresh errors to avoid breaking the UI.
        }
        if (threadId !== activeThreadId) {
          dispatch({ type: "markUnread", threadId, hasUnread: true });
        }
      },
      onItemStarted: (workspaceId: string, threadId: string, item: Record<string, unknown>) => {
        dispatch({ type: "ensureThread", workspaceId, threadId });
        const itemType = asString((item as Record<string, unknown>)?.type ?? "");
        if (itemType === "enteredReviewMode") {
          dispatch({ type: "markReviewing", threadId, isReviewing: true });
        } else if (itemType === "exitedReviewMode") {
          dispatch({ type: "markReviewing", threadId, isReviewing: false });
          dispatch({ type: "markProcessing", threadId, isProcessing: false });
        }
        const converted = buildConversationItem(item);
        if (converted) {
          dispatch({ type: "upsertItem", threadId, item: converted });
        }
        try {
          void onMessageActivity?.();
        } catch {
          // Ignore refresh errors to avoid breaking the UI.
        }
      },
      onItemCompleted: (workspaceId: string, threadId: string, item: Record<string, unknown>) => {
        dispatch({ type: "ensureThread", workspaceId, threadId });
        const itemType = asString((item as Record<string, unknown>)?.type ?? "");
        if (itemType === "enteredReviewMode") {
          dispatch({ type: "markReviewing", threadId, isReviewing: true });
        } else if (itemType === "exitedReviewMode") {
          dispatch({ type: "markReviewing", threadId, isReviewing: false });
          dispatch({ type: "markProcessing", threadId, isProcessing: false });
        }
        const converted = buildConversationItem(item);
        if (converted) {
          dispatch({ type: "upsertItem", threadId, item: converted });
        }
        try {
          void onMessageActivity?.();
        } catch {
          // Ignore refresh errors to avoid breaking the UI.
        }
      },
      onReasoningSummaryDelta: (
        _workspaceId: string,
        threadId: string,
        itemId: string,
        delta: string,
      ) => {
        dispatch({ type: "appendReasoningSummary", threadId, itemId, delta });
      },
      onReasoningTextDelta: (
        _workspaceId: string,
        threadId: string,
        itemId: string,
        delta: string,
      ) => {
        dispatch({ type: "appendReasoningContent", threadId, itemId, delta });
      },
      onCommandOutputDelta: (
        _workspaceId: string,
        threadId: string,
        itemId: string,
        delta: string,
      ) => {
        dispatch({ type: "appendToolOutput", threadId, itemId, delta });
        try {
          void onMessageActivity?.();
        } catch {
          // Ignore refresh errors to avoid breaking the UI.
        }
      },
      onFileChangeOutputDelta: (
        _workspaceId: string,
        threadId: string,
        itemId: string,
        delta: string,
      ) => {
        dispatch({ type: "appendToolOutput", threadId, itemId, delta });
        try {
          void onMessageActivity?.();
        } catch {
          // Ignore refresh errors to avoid breaking the UI.
        }
      },
      onTurnStarted: (workspaceId: string, threadId: string) => {
        dispatch({
          type: "ensureThread",
          workspaceId,
          threadId,
        });
        dispatch({ type: "markProcessing", threadId, isProcessing: true });
      },
      onTurnCompleted: (_workspaceId: string, threadId: string) => {
        dispatch({ type: "markProcessing", threadId, isProcessing: false });
      },
    }),
    [
      activeThreadId,
      activeWorkspaceId,
      handleWorkspaceConnected,
      onDebug,
      onMessageActivity,
    ],
  );

  useAppServerEvents(handlers);

  const startThreadForWorkspace = useCallback(
    async (workspaceId: string) => {
      onDebug?.({
        id: `${Date.now()}-client-thread-start`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/start",
        payload: { workspaceId },
      });
      try {
        const response = await startThreadService(workspaceId);
        onDebug?.({
          id: `${Date.now()}-server-thread-start`,
          timestamp: Date.now(),
          source: "server",
          label: "thread/start response",
          payload: response,
        });
        const thread = response.result?.thread ?? response.thread;
        const threadId = String(thread?.id ?? "");
      if (threadId) {
        dispatch({ type: "ensureThread", workspaceId, threadId });
        dispatch({ type: "setActiveThreadId", workspaceId, threadId });
        loadedThreads.current[threadId] = true;
        return threadId;
      }
      return null;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-start-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/start error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [onDebug],
  );

  const startThread = useCallback(async () => {
    if (!activeWorkspaceId) {
      return null;
    }
    return startThreadForWorkspace(activeWorkspaceId);
  }, [activeWorkspaceId, startThreadForWorkspace]);

  const resumeThreadForWorkspace = useCallback(
    async (workspaceId: string, threadId: string, force = false) => {
      if (!threadId) {
        return null;
      }
      if (!force && loadedThreads.current[threadId]) {
        return threadId;
      }
      onDebug?.({
        id: `${Date.now()}-client-thread-resume`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/resume",
        payload: { workspaceId, threadId },
      });
      try {
        const response = await resumeThreadService(workspaceId, threadId);
        onDebug?.({
          id: `${Date.now()}-server-thread-resume`,
          timestamp: Date.now(),
          source: "server",
          label: "thread/resume response",
          payload: response,
        });
        const thread = response.result?.thread ?? response.thread;
        if (thread) {
          const items = buildItemsFromThread(thread);
          if (items.length > 0) {
            dispatch({ type: "setThreadItems", threadId, items });
          }
          dispatch({
            type: "markReviewing",
            threadId,
            isReviewing: isReviewingFromThread(thread),
          });
          const preview = asString(thread?.preview ?? "");
          if (preview) {
            dispatch({
              type: "setThreadName",
              workspaceId,
              threadId,
              name: previewThreadName(preview, `Agent ${threadId.slice(0, 4)}`),
            });
          }
        }
        loadedThreads.current[threadId] = true;
        return threadId;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-resume-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/resume error",
          payload: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
    [onDebug],
  );

  const listThreadsForWorkspace = useCallback(
    async (workspace: WorkspaceInfo) => {
      onDebug?.({
        id: `${Date.now()}-client-thread-list`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/list",
        payload: { workspaceId: workspace.id, path: workspace.path },
      });
      try {
        const allThreads: any[] = [];
        let cursor: string | null = null;
        do {
          const response = await listThreadsService(workspace.id, cursor, 50);
          onDebug?.({
            id: `${Date.now()}-server-thread-list`,
            timestamp: Date.now(),
            source: "server",
            label: "thread/list response",
            payload: response,
          });
          const result = response.result ?? response;
          const data = Array.isArray(result?.data) ? result.data : [];
          const nextCursor = result?.nextCursor ?? result?.next_cursor ?? null;
          allThreads.push(...data);
          cursor = nextCursor;
        } while (cursor);

        const matching = allThreads.filter(
          (thread) => String(thread?.cwd ?? "") === workspace.path,
        );
        matching.sort((a, b) => {
          const aCreated = Number(a?.createdAt ?? a?.created_at ?? 0);
          const bCreated = Number(b?.createdAt ?? b?.created_at ?? 0);
          return bCreated - aCreated;
        });
        const summaries = matching
          .map((thread, index) => {
            const preview = asString(thread?.preview ?? "").trim();
            const fallbackName = `Agent ${index + 1}`;
            const name =
              preview.length > 0
                ? preview.length > 38
                  ? `${preview.slice(0, 38)}…`
                  : preview
                : fallbackName;
            return { id: String(thread?.id ?? ""), name };
          })
          .filter((entry) => entry.id);

        const unique = new Map<string, ThreadSummary>();
        summaries.forEach((thread) => {
          if (!unique.has(thread.id)) {
            unique.set(thread.id, thread);
          }
        });
        dispatch({
          type: "setThreads",
          workspaceId: workspace.id,
          threads: Array.from(unique.values()),
        });
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-list-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/list error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [onDebug],
  );

  const sendUserMessage = useCallback(
    async (text: string) => {
      if (!activeWorkspace || !text.trim()) {
        return;
      }
      let threadId = activeThreadId;
      if (!threadId) {
        threadId = await startThread();
        if (!threadId) {
          return;
        }
      } else if (!loadedThreads.current[threadId]) {
        await resumeThreadForWorkspace(activeWorkspace.id, threadId);
      }

      const messageText = text.trim();
      dispatch({ type: "addUserMessage", threadId, text: messageText });
      dispatch({
        type: "setThreadName",
        workspaceId: activeWorkspace.id,
        threadId,
        name: previewThreadName(messageText, `Agent ${threadId.slice(0, 4)}`),
      });
      dispatch({ type: "markProcessing", threadId, isProcessing: true });
      try {
        void onMessageActivity?.();
      } catch {
        // Ignore refresh errors to avoid breaking the UI.
      }
      onDebug?.({
        id: `${Date.now()}-client-turn-start`,
        timestamp: Date.now(),
        source: "client",
        label: "turn/start",
        payload: {
          workspaceId: activeWorkspace.id,
          threadId,
          text: messageText,
          model,
          effort,
        },
      });
      try {
        const response = await sendUserMessageService(
          activeWorkspace.id,
          threadId,
          messageText,
          { model, effort, accessMode },
        );
        onDebug?.({
          id: `${Date.now()}-server-turn-start`,
          timestamp: Date.now(),
          source: "server",
          label: "turn/start response",
          payload: response,
        });
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-turn-start-error`,
          timestamp: Date.now(),
          source: "error",
          label: "turn/start error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [
      activeWorkspace,
      activeThreadId,
      effort,
      accessMode,
      model,
      onDebug,
      onMessageActivity,
      startThread,
    ],
  );

  const startReview = useCallback(
    async (text: string) => {
      if (!activeWorkspace || !text.trim()) {
        return;
      }
      let threadId = activeThreadId;
      if (!threadId) {
        threadId = await startThread();
        if (!threadId) {
          return;
        }
      } else if (!loadedThreads.current[threadId]) {
        await resumeThreadForWorkspace(activeWorkspace.id, threadId);
      }

      const target = parseReviewTarget(text);
      dispatch({ type: "markProcessing", threadId, isProcessing: true });
      dispatch({ type: "markReviewing", threadId, isReviewing: true });
      dispatch({
        type: "upsertItem",
        threadId,
        item: {
          id: `review-start-${threadId}-${Date.now()}`,
          kind: "review",
          state: "started",
          text: formatReviewLabel(target),
        },
      });
      try {
        void onMessageActivity?.();
      } catch {
        // Ignore refresh errors to avoid breaking the UI.
      }
      onDebug?.({
        id: `${Date.now()}-client-review-start`,
        timestamp: Date.now(),
        source: "client",
        label: "review/start",
        payload: {
          workspaceId: activeWorkspace.id,
          threadId,
          target,
        },
      });
      try {
        const response = await startReviewService(
          activeWorkspace.id,
          threadId,
          target,
          "inline",
        );
        onDebug?.({
          id: `${Date.now()}-server-review-start`,
          timestamp: Date.now(),
          source: "server",
          label: "review/start response",
          payload: response,
        });
      } catch (error) {
        dispatch({ type: "markProcessing", threadId, isProcessing: false });
        dispatch({ type: "markReviewing", threadId, isReviewing: false });
        onDebug?.({
          id: `${Date.now()}-client-review-start-error`,
          timestamp: Date.now(),
          source: "error",
          label: "review/start error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [
      activeWorkspace,
      activeThreadId,
      onDebug,
      onMessageActivity,
      startThread,
      resumeThreadForWorkspace,
    ],
  );

  const handleApprovalDecision = useCallback(
    async (request: ApprovalRequest, decision: "accept" | "decline") => {
      await respondToServerRequest(
        request.workspace_id,
        request.request_id,
        decision,
      );
      dispatch({ type: "removeApproval", requestId: request.request_id });
    },
    [],
  );

  const setActiveThreadId = useCallback(
    (threadId: string | null, workspaceId?: string) => {
      const targetId = workspaceId ?? activeWorkspaceId;
      if (!targetId) {
        return;
      }
      dispatch({ type: "setActiveThreadId", workspaceId: targetId, threadId });
      if (threadId) {
        void resumeThreadForWorkspace(targetId, threadId, true);
      }
    },
    [activeWorkspaceId, resumeThreadForWorkspace],
  );

  const removeThread = useCallback((workspaceId: string, threadId: string) => {
    dispatch({ type: "removeThread", workspaceId, threadId });
    (async () => {
      try {
        await archiveThreadService(workspaceId, threadId);
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-archive-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/archive error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, [onDebug]);

  return {
    activeThreadId,
    setActiveThreadId,
    activeItems,
    approvals: state.approvals,
    threadsByWorkspace: state.threadsByWorkspace,
    threadStatusById: state.threadStatusById,
    removeThread,
    startThread,
    startThreadForWorkspace,
    listThreadsForWorkspace,
    sendUserMessage,
    startReview,
    handleApprovalDecision,
  };
}
