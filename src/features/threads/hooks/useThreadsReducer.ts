import type {
  AccountSnapshot,
  ApprovalRequest,
  ConversationItem,
  RateLimitSnapshot,
  RequestUserInputRequest,
  ThreadListSortKey,
  ThreadSummary,
  ThreadTokenUsage,
  TurnPlan,
} from "@/types";
import { reduceThreadItems } from "./threadReducer/threadItemsSlice";
import { reduceThreadLifecycle } from "./threadReducer/threadLifecycleSlice";
import { reduceThreadQueue } from "./threadReducer/threadQueueSlice";
import { reduceThreadSnapshots } from "./threadReducer/threadSnapshotSlice";

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
  hiddenThreadIdsByWorkspace: Record<string, Record<string, true>>;
  threadParentById: Record<string, string>;
  threadStatusById: Record<string, ThreadActivityStatus>;
  threadResumeLoadingById: Record<string, boolean>;
  threadListLoadingByWorkspace: Record<string, boolean>;
  threadListPagingByWorkspace: Record<string, boolean>;
  threadListCursorByWorkspace: Record<string, string | null>;
  threadSortKeyByWorkspace: Record<string, ThreadListSortKey>;
  activeTurnIdByThread: Record<string, string | null>;
  turnDiffByThread: Record<string, string>;
  approvals: ApprovalRequest[];
  userInputRequests: RequestUserInputRequest[];
  tokenUsageByThread: Record<string, ThreadTokenUsage>;
  rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null>;
  accountByWorkspace: Record<string, AccountSnapshot | null>;
  planByThread: Record<string, TurnPlan | null>;
  lastAgentMessageByThread: Record<string, { text: string; timestamp: number }>;
};

export type ThreadAction =
  | { type: "setActiveThreadId"; workspaceId: string; threadId: string | null }
  | { type: "ensureThread"; workspaceId: string; threadId: string }
  | { type: "hideThread"; workspaceId: string; threadId: string }
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
  | { type: "addAssistantMessage"; threadId: string; text: string }
  | { type: "setThreadName"; workspaceId: string; threadId: string; name: string }
  | {
      type: "setThreadTimestamp";
      workspaceId: string;
      threadId: string;
      timestamp: number;
    }
  | {
      type: "appendAgentDelta";
      workspaceId: string;
      threadId: string;
      itemId: string;
      delta: string;
      hasCustomName: boolean;
    }
  | {
      type: "completeAgentMessage";
      workspaceId: string;
      threadId: string;
      itemId: string;
      text: string;
      hasCustomName: boolean;
    }
  | {
      type: "upsertItem";
      workspaceId: string;
      threadId: string;
      item: ConversationItem;
      hasCustomName?: boolean;
    }
  | { type: "setThreadItems"; threadId: string; items: ConversationItem[] }
  | {
      type: "appendReasoningSummary";
      threadId: string;
      itemId: string;
      delta: string;
    }
  | {
      type: "appendReasoningSummaryBoundary";
      threadId: string;
      itemId: string;
    }
  | { type: "appendReasoningContent"; threadId: string; itemId: string; delta: string }
  | { type: "appendPlanDelta"; threadId: string; itemId: string; delta: string }
  | { type: "appendToolOutput"; threadId: string; itemId: string; delta: string }
  | {
      type: "setThreads";
      workspaceId: string;
      threads: ThreadSummary[];
      sortKey: ThreadListSortKey;
    }
  | {
      type: "setThreadListLoading";
      workspaceId: string;
      isLoading: boolean;
    }
  | {
      type: "setThreadResumeLoading";
      threadId: string;
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
  | { type: "removeApproval"; requestId: number | string; workspaceId: string }
  | { type: "addUserInputRequest"; request: RequestUserInputRequest }
  | {
      type: "removeUserInputRequest";
      requestId: number | string;
      workspaceId: string;
    }
  | { type: "setThreadTokenUsage"; threadId: string; tokenUsage: ThreadTokenUsage }
  | {
      type: "setRateLimits";
      workspaceId: string;
      rateLimits: RateLimitSnapshot | null;
    }
  | {
      type: "setAccountInfo";
      workspaceId: string;
      account: AccountSnapshot | null;
    }
  | { type: "setActiveTurnId"; threadId: string; turnId: string | null }
  | { type: "setThreadTurnDiff"; threadId: string; diff: string }
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
  hiddenThreadIdsByWorkspace: {},
  threadParentById: {},
  threadStatusById: {},
  threadResumeLoadingById: {},
  threadListLoadingByWorkspace: {},
  threadListPagingByWorkspace: {},
  threadListCursorByWorkspace: {},
  threadSortKeyByWorkspace: {},
  activeTurnIdByThread: {},
  turnDiffByThread: {},
  approvals: [],
  userInputRequests: [],
  tokenUsageByThread: {},
  rateLimitsByWorkspace: {},
  accountByWorkspace: {},
  planByThread: {},
  lastAgentMessageByThread: {},
};

type ThreadSliceReducer = (state: ThreadState, action: ThreadAction) => ThreadState;

const threadSliceReducers: ThreadSliceReducer[] = [
  reduceThreadLifecycle,
  reduceThreadItems,
  reduceThreadQueue,
  reduceThreadSnapshots,
];

export function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  for (const reduceSlice of threadSliceReducers) {
    const nextState = reduceSlice(state, action);
    if (nextState !== state) {
      return nextState;
    }
  }
  return state;
}
