import type {
  ApprovalRequest,
  ConversationItem,
  RateLimitSnapshot,
  ThreadSummary,
  ThreadTokenUsage,
  TurnPlan,
} from "../../../types";
import { normalizeItem, prepareThreadItems, upsertItem } from "../../../utils/threadItems";

const MAX_THREAD_NAME_LENGTH = 38;

function formatThreadName(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > MAX_THREAD_NAME_LENGTH
    ? `${trimmed.slice(0, MAX_THREAD_NAME_LENGTH)}…`
    : trimmed;
}

function getAssistantTextForRename(
  items: ConversationItem[],
  itemId?: string,
): string {
  if (itemId) {
    const match = items.find(
      (item) =>
        item.kind === "message" &&
        item.role === "assistant" &&
        item.id === itemId,
    );
    if (match && match.kind === "message") {
      return match.text;
    }
  }
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === "message" && item.role === "assistant") {
      return item.text;
    }
  }
  return "";
}

function maybeRenameThreadFromAgent({
  workspaceId,
  threadId,
  items,
  itemId,
  threadsByWorkspace,
}: {
  workspaceId: string;
  threadId: string;
  items: ConversationItem[];
  itemId?: string;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
}) {
  const threads = threadsByWorkspace[workspaceId] ?? [];
  if (!threads.length) {
    return threadsByWorkspace;
  }
  const hasUserMessage = items.some(
    (item) => item.kind === "message" && item.role === "user",
  );
  if (hasUserMessage) {
    return threadsByWorkspace;
  }
  const nextName = formatThreadName(getAssistantTextForRename(items, itemId));
  if (!nextName) {
    return threadsByWorkspace;
  }
  let didChange = false;
  const nextThreads = threads.map((thread) => {
    if (thread.id !== threadId || thread.name === nextName) {
      return thread;
    }
    didChange = true;
    return { ...thread, name: nextName };
  });
  return didChange
    ? { ...threadsByWorkspace, [workspaceId]: nextThreads }
    : threadsByWorkspace;
}

type ThreadActivityStatus = {
  isProcessing: boolean;
  hasUnread: boolean;
  isReviewing: boolean;
  processingStartedAt: number | null;
  lastDurationMs: number | null;
};

export type ThreadState = {
  activeThreadIdByWorkspace: Record<string, string | null>;
  itemsByThread: Record<string, ConversationItem[]>;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadParentById: Record<string, string>;
  threadStatusById: Record<string, ThreadActivityStatus>;
  threadListLoadingByWorkspace: Record<string, boolean>;
  threadListPagingByWorkspace: Record<string, boolean>;
  threadListCursorByWorkspace: Record<string, string | null>;
  activeTurnIdByThread: Record<string, string | null>;
  approvals: ApprovalRequest[];
  tokenUsageByThread: Record<string, ThreadTokenUsage>;
  rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null>;
  planByThread: Record<string, TurnPlan | null>;
  lastAgentMessageByThread: Record<string, { text: string; timestamp: number }>;
};

export type ThreadAction =
  | { type: "setActiveThreadId"; workspaceId: string; threadId: string | null }
  | { type: "ensureThread"; workspaceId: string; threadId: string }
  | { type: "removeThread"; workspaceId: string; threadId: string }
  | { type: "setThreadParent"; threadId: string; parentId: string }
  | {
      type: "markProcessing";
      threadId: string;
      isProcessing: boolean;
      timestamp: number;
    }
  | { type: "markReviewing"; threadId: string; isReviewing: boolean }
  | { type: "markUnread"; threadId: string; hasUnread: boolean }
  | {
      type: "addUserMessage";
      workspaceId: string;
      threadId: string;
      text: string;
      images?: string[];
    }
  | { type: "addAssistantMessage"; threadId: string; text: string }
  | { type: "setThreadName"; workspaceId: string; threadId: string; name: string }
  | {
      type: "appendAgentDelta";
      workspaceId: string;
      threadId: string;
      itemId: string;
      delta: string;
    }
  | {
      type: "completeAgentMessage";
      workspaceId: string;
      threadId: string;
      itemId: string;
      text: string;
    }
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
  | {
      type: "setThreadListLoading";
      workspaceId: string;
      isLoading: boolean;
    }
  | {
      type: "setThreadListPaging";
      workspaceId: string;
      isLoading: boolean;
    }
  | {
      type: "setThreadListCursor";
      workspaceId: string;
      cursor: string | null;
    }
  | { type: "addApproval"; approval: ApprovalRequest }
  | { type: "removeApproval"; requestId: number; workspaceId: string }
  | { type: "setThreadTokenUsage"; threadId: string; tokenUsage: ThreadTokenUsage }
  | {
      type: "setRateLimits";
      workspaceId: string;
      rateLimits: RateLimitSnapshot | null;
    }
  | { type: "setActiveTurnId"; threadId: string; turnId: string | null }
  | { type: "setThreadPlan"; threadId: string; plan: TurnPlan | null }
  | { type: "clearThreadPlan"; threadId: string }
  | {
      type: "setLastAgentMessage";
      threadId: string;
      text: string;
      timestamp: number;
    };

const emptyItems: Record<string, ConversationItem[]> = {};

export const initialState: ThreadState = {
  activeThreadIdByWorkspace: {},
  itemsByThread: emptyItems,
  threadsByWorkspace: {},
  threadParentById: {},
  threadStatusById: {},
  threadListLoadingByWorkspace: {},
  threadListPagingByWorkspace: {},
  threadListCursorByWorkspace: {},
  activeTurnIdByThread: {},
  approvals: [],
  tokenUsageByThread: {},
  rateLimitsByWorkspace: {},
  planByThread: {},
  lastAgentMessageByThread: {},
};

function mergeStreamingText(existing: string, delta: string) {
  if (!delta) {
    return existing;
  }
  if (!existing) {
    return delta;
  }
  if (delta === existing) {
    return existing;
  }
  if (delta.startsWith(existing)) {
    return delta;
  }
  if (existing.startsWith(delta)) {
    return existing;
  }
  const maxOverlap = Math.min(existing.length, delta.length);
  for (let length = maxOverlap; length > 0; length -= 1) {
    if (existing.endsWith(delta.slice(0, length))) {
      return `${existing}${delta.slice(length)}`;
    }
  }
  return `${existing}${delta}`;
}

function dropLatestLocalReviewStart(list: ConversationItem[]) {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index];
    if (
      item.kind === "review" &&
      item.state === "started" &&
      item.id.startsWith("review-start-")
    ) {
      return [...list.slice(0, index), ...list.slice(index + 1)];
    }
  }
  return list;
}

export function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
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
                processingStartedAt:
                  state.threadStatusById[action.threadId]?.processingStartedAt ??
                  null,
                lastDurationMs:
                  state.threadStatusById[action.threadId]?.lastDurationMs ?? null,
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
        updatedAt: Date.now(),
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
            processingStartedAt: null,
            lastDurationMs: null,
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
      const { [action.threadId]: ___, ...restTurns } = state.activeTurnIdByThread;
      const { [action.threadId]: ____, ...restPlans } = state.planByThread;
      const { [action.threadId]: _____, ...restParents } = state.threadParentById;
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: filtered,
        },
        itemsByThread: restItems,
        threadStatusById: restStatus,
        activeTurnIdByThread: restTurns,
        planByThread: restPlans,
        threadParentById: restParents,
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]: nextActive,
        },
      };
    }
    case "setThreadParent": {
      if (!action.parentId || action.parentId === action.threadId) {
        return state;
      }
      if (state.threadParentById[action.threadId] === action.parentId) {
        return state;
      }
      return {
        ...state,
        threadParentById: {
          ...state.threadParentById,
          [action.threadId]: action.parentId,
        },
      };
    }
    case "markProcessing": {
      const previous = state.threadStatusById[action.threadId];
      const wasProcessing = previous?.isProcessing ?? false;
      const startedAt = previous?.processingStartedAt ?? null;
      const lastDurationMs = previous?.lastDurationMs ?? null;
      if (action.isProcessing) {
        return {
          ...state,
          threadStatusById: {
            ...state.threadStatusById,
            [action.threadId]: {
              isProcessing: true,
              hasUnread: previous?.hasUnread ?? false,
              isReviewing: previous?.isReviewing ?? false,
              processingStartedAt:
                wasProcessing && startedAt ? startedAt : action.timestamp,
              lastDurationMs,
            },
          },
        };
      }
      const nextDuration =
        wasProcessing && startedAt
          ? Math.max(0, action.timestamp - startedAt)
          : lastDurationMs ?? null;
      return {
        ...state,
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: {
            isProcessing: false,
            hasUnread: previous?.hasUnread ?? false,
            isReviewing: previous?.isReviewing ?? false,
            processingStartedAt: null,
            lastDurationMs: nextDuration,
          },
        },
      };
    }
    case "setActiveTurnId":
      return {
        ...state,
        activeTurnIdByThread: {
          ...state.activeTurnIdByThread,
          [action.threadId]: action.turnId,
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
            processingStartedAt:
              state.threadStatusById[action.threadId]?.processingStartedAt ?? null,
            lastDurationMs:
              state.threadStatusById[action.threadId]?.lastDurationMs ?? null,
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
            processingStartedAt:
              state.threadStatusById[action.threadId]?.processingStartedAt ?? null,
            lastDurationMs:
              state.threadStatusById[action.threadId]?.lastDurationMs ?? null,
          },
        },
      };
    case "addUserMessage": {
      const list = state.itemsByThread[action.threadId] ?? [];
      const now = Date.now();
      const imageCount = action.images?.length ?? 0;
      const imageLabel =
        imageCount > 0 ? (imageCount === 1 ? "[image]" : `[image x${imageCount}]`) : "";
      const textValue = action.text.trim();
      const combinedText = textValue
        ? imageLabel
          ? `${textValue}\n${imageLabel}`
          : textValue
        : imageLabel;
      const hasUserMessage = list.some(
        (item) => item.kind === "message" && item.role === "user",
      );
      const message: ConversationItem = {
        id: `${now}-user`,
        kind: "message",
        role: "user",
        text: combinedText || "[message]",
      };
      const threads = state.threadsByWorkspace[action.workspaceId] ?? [];
      const updatedThreads = threads.map((thread) => {
        if (thread.id !== action.threadId) {
          return thread;
        }
        const shouldRename =
          !hasUserMessage &&
          textValue.length > 0 &&
          thread.name.startsWith("Agent ");
        const nextName =
          shouldRename && textValue.length > 38
            ? `${textValue.slice(0, 38)}…`
            : shouldRename
              ? textValue
              : thread.name;
        return { ...thread, updatedAt: now, name: nextName };
      });
      const bumpedThreads = updatedThreads.length
        ? [
            ...updatedThreads.filter((thread) => thread.id === action.threadId),
            ...updatedThreads.filter((thread) => thread.id !== action.threadId),
          ]
        : updatedThreads;
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: prepareThreadItems([...list, message]),
        },
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: bumpedThreads,
        },
      };
    }
    case "addAssistantMessage": {
      const list = state.itemsByThread[action.threadId] ?? [];
      const message: ConversationItem = {
        id: `${Date.now()}-assistant`,
        kind: "message",
        role: "assistant",
        text: action.text,
      };
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: prepareThreadItems([...list, message]),
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
        const existing = list[index];
        list[index] = {
          ...existing,
          text: mergeStreamingText(existing.text, action.delta),
        };
      } else {
        list.push({
          id: action.itemId,
          kind: "message",
          role: "assistant",
          text: action.delta,
        });
      }
      const updatedItems = prepareThreadItems(list);
      const nextThreadsByWorkspace = maybeRenameThreadFromAgent({
        workspaceId: action.workspaceId,
        threadId: action.threadId,
        items: updatedItems,
        itemId: action.itemId,
        threadsByWorkspace: state.threadsByWorkspace,
      });
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: updatedItems,
        },
        threadsByWorkspace: nextThreadsByWorkspace,
      };
    }
    case "completeAgentMessage": {
      const list = [...(state.itemsByThread[action.threadId] ?? [])];
      const index = list.findIndex((msg) => msg.id === action.itemId);
      if (index >= 0 && list[index].kind === "message") {
        const existing = list[index];
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
      const updatedItems = prepareThreadItems(list);
      const nextThreadsByWorkspace = maybeRenameThreadFromAgent({
        workspaceId: action.workspaceId,
        threadId: action.threadId,
        items: updatedItems,
        itemId: action.itemId,
        threadsByWorkspace: state.threadsByWorkspace,
      });
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: updatedItems,
        },
        threadsByWorkspace: nextThreadsByWorkspace,
      };
    }
    case "upsertItem": {
      let list = state.itemsByThread[action.threadId] ?? [];
      const item = normalizeItem(action.item);
      if (
        item.kind === "review" &&
        item.state === "started" &&
        !item.id.startsWith("review-start-")
      ) {
        list = dropLatestLocalReviewStart(list);
      }
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: prepareThreadItems(upsertItem(list, item)),
        },
      };
    }
    case "setThreadItems":
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: prepareThreadItems(action.items),
        },
      };
    case "setLastAgentMessage":
      if (
        state.lastAgentMessageByThread[action.threadId]?.timestamp >= action.timestamp
      ) {
        return state;
      }
      return {
        ...state,
        lastAgentMessageByThread: {
          ...state.lastAgentMessageByThread,
          [action.threadId]: { text: action.text, timestamp: action.timestamp },
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
        summary: mergeStreamingText(
          "summary" in base ? base.summary : "",
          action.delta,
        ),
      } as ConversationItem;
      const next = index >= 0 ? [...list] : [...list, updated];
      if (index >= 0) {
        next[index] = updated;
      }
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: prepareThreadItems(next),
        },
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
        content: mergeStreamingText(
          "content" in base ? base.content : "",
          action.delta,
        ),
      } as ConversationItem;
      const next = index >= 0 ? [...list] : [...list, updated];
      if (index >= 0) {
        next[index] = updated;
      }
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: prepareThreadItems(next),
        },
      };
    }
    case "appendToolOutput": {
      const list = state.itemsByThread[action.threadId] ?? [];
      const index = list.findIndex((entry) => entry.id === action.itemId);
      if (index < 0 || list[index].kind !== "tool") {
        return state;
      }
      const existing = list[index];
      const updated: ConversationItem = {
        ...existing,
        output: mergeStreamingText(existing.output ?? "", action.delta),
      } as ConversationItem;
      const next = [...list];
      next[index] = updated;
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: prepareThreadItems(next),
        },
      };
    }
    case "addApproval": {
      const exists = state.approvals.some(
        (item) =>
          item.request_id === action.approval.request_id &&
          item.workspace_id === action.approval.workspace_id,
      );
      if (exists) {
        return state;
      }
      return { ...state, approvals: [...state.approvals, action.approval] };
    }
    case "removeApproval":
      return {
        ...state,
        approvals: state.approvals.filter(
          (item) =>
            item.request_id !== action.requestId ||
            item.workspace_id !== action.workspaceId,
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
    case "setThreadListLoading":
      return {
        ...state,
        threadListLoadingByWorkspace: {
          ...state.threadListLoadingByWorkspace,
          [action.workspaceId]: action.isLoading,
        },
      };
    case "setThreadListPaging":
      return {
        ...state,
        threadListPagingByWorkspace: {
          ...state.threadListPagingByWorkspace,
          [action.workspaceId]: action.isLoading,
        },
      };
    case "setThreadListCursor":
      return {
        ...state,
        threadListCursorByWorkspace: {
          ...state.threadListCursorByWorkspace,
          [action.workspaceId]: action.cursor,
        },
      };
    case "setThreadTokenUsage":
      return {
        ...state,
        tokenUsageByThread: {
          ...state.tokenUsageByThread,
          [action.threadId]: action.tokenUsage,
        },
      };
    case "setRateLimits":
      return {
        ...state,
        rateLimitsByWorkspace: {
          ...state.rateLimitsByWorkspace,
          [action.workspaceId]: action.rateLimits,
        },
      };
    case "setThreadPlan":
      return {
        ...state,
        planByThread: {
          ...state.planByThread,
          [action.threadId]: action.plan,
        },
      };
    case "clearThreadPlan":
      return {
        ...state,
        planByThread: {
          ...state.planByThread,
          [action.threadId]: null,
        },
      };
    default:
      return state;
  }
}
