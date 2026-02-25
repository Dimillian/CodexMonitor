import { useCallback } from "react";
import type { Dispatch } from "react";
import type { ThreadAction } from "./useThreadsReducer";
import { asString, normalizeStringList } from "@threads/utils/threadNormalize";

type UseThreadLinkingOptions = {
  dispatch: Dispatch<ThreadAction>;
  threadParentById: Record<string, string>;
  onSubagentThreadDetected?: (workspaceId: string, threadId: string) => void;
};

function normalizeThreadId(value: unknown) {
  return asString(value).trim();
}

function normalizeThreadIdsFromAgentRefs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return "";
      }
      const record = entry as Record<string, unknown>;
      const nestedThread =
        record.thread && typeof record.thread === "object"
          ? (record.thread as Record<string, unknown>)
          : null;
      return normalizeThreadId(
        record.threadId ??
          record.thread_id ??
          record.id ??
          nestedThread?.id ??
          nestedThread?.threadId ??
          nestedThread?.thread_id,
      );
    })
    .filter(Boolean);
}

function normalizeThreadIdsFromAgentStatuses(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return "";
      }
      const record = entry as Record<string, unknown>;
      const nestedThread =
        record.thread && typeof record.thread === "object"
          ? (record.thread as Record<string, unknown>)
          : null;
      return normalizeThreadId(
        record.threadId ??
          record.thread_id ??
          record.id ??
          nestedThread?.id ??
          nestedThread?.threadId ??
          nestedThread?.thread_id,
      );
    })
    .filter(Boolean);
}

function normalizeThreadIdsFromStatusMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as Record<string, unknown>)
    .map((key) => normalizeThreadId(key))
    .filter(Boolean);
}

function hasCollabLinkHints(item: Record<string, unknown>) {
  return Boolean(
    item.senderThreadId ??
      item.sender_thread_id ??
      item.receiverThreadId ??
      item.receiver_thread_id ??
      item.receiverThreadIds ??
      item.receiver_thread_ids ??
      item.newThreadId ??
      item.new_thread_id ??
      item.receiverAgents ??
      item.receiver_agents ??
      item.receiverAgent ??
      item.receiver_agent ??
      item.agentStatuses ??
      item.agent_statuses ??
      item.agentStatus ??
      item.agentsStates ??
      item.agents_states ??
      item.statuses,
  );
}

export function useThreadLinking({
  dispatch,
  threadParentById,
  onSubagentThreadDetected,
}: UseThreadLinkingOptions) {
  const wouldCreateThreadCycle = useCallback(
    (parentId: string, childId: string) => {
      const visited = new Set([childId]);
      let current: string | undefined = parentId;
      while (current) {
        if (visited.has(current)) {
          return true;
        }
        visited.add(current);
        current = threadParentById[current];
      }
      return false;
    },
    [threadParentById],
  );

  const updateThreadParent = useCallback(
    (parentId: string, childIds: string[]) => {
      if (!parentId || childIds.length === 0) {
        return;
      }
      childIds.forEach((childId) => {
        if (!childId || childId === parentId) {
          return;
        }
        const existingParent = threadParentById[childId];
        if (existingParent === parentId) {
          return;
        }
        if (existingParent) {
          return;
        }
        if (wouldCreateThreadCycle(parentId, childId)) {
          return;
        }
        dispatch({ type: "setThreadParent", threadId: childId, parentId });
      });
    },
    [dispatch, threadParentById, wouldCreateThreadCycle],
  );

  const applyCollabThreadLinks = useCallback(
    (
      workspaceId: string,
      fallbackThreadId: string,
      item: Record<string, unknown>,
    ) => {
      const itemType = asString(item?.type ?? "");
      const isCollabType =
        itemType === "collabToolCall" || itemType === "collabAgentToolCall";
      if (!isCollabType && !hasCollabLinkHints(item)) {
        return;
      }
      const sender = asString(item.senderThreadId ?? item.sender_thread_id ?? "");
      const parentId = sender || fallbackThreadId;
      if (!parentId) {
        return;
      }
      const receivers = Array.from(
        new Set([
          ...normalizeStringList(item.receiverThreadId ?? item.receiver_thread_id),
          ...normalizeStringList(item.receiverThreadIds ?? item.receiver_thread_ids),
          ...normalizeStringList(item.newThreadId ?? item.new_thread_id),
          ...normalizeThreadIdsFromAgentRefs(
            item.receiverAgent || item.receiver_agent
              ? [item.receiverAgent ?? item.receiver_agent]
              : [],
          ),
          ...normalizeThreadIdsFromAgentRefs(item.receiverAgents ?? item.receiver_agents),
          ...normalizeThreadIdsFromAgentStatuses(
            item.agentStatuses ?? item.agent_statuses,
          ),
          ...normalizeThreadIdsFromStatusMap(item.statuses),
          ...normalizeThreadIdsFromStatusMap(
            item.agentStatus ?? item.agentsStates ?? item.agents_states,
          ),
        ]),
      );
      updateThreadParent(parentId, receivers);
      receivers.forEach((receiver) => {
        if (!receiver) {
          return;
        }
        onSubagentThreadDetected?.(workspaceId, receiver);
      });
    },
    [onSubagentThreadDetected, updateThreadParent],
  );

  const applyCollabThreadLinksFromThread = useCallback(
    (
      workspaceId: string,
      fallbackThreadId: string,
      thread: Record<string, unknown>,
    ) => {
      const turns = Array.isArray(thread.turns) ? thread.turns : [];
      turns.forEach((turn) => {
        const turnRecord = turn as Record<string, unknown>;
        const turnItems = Array.isArray(turnRecord.items)
          ? (turnRecord.items as Record<string, unknown>[])
          : [];
        turnItems.forEach((item) => {
          applyCollabThreadLinks(workspaceId, fallbackThreadId, item);
        });
      });
    },
    [applyCollabThreadLinks],
  );

  return {
    applyCollabThreadLinks,
    applyCollabThreadLinksFromThread,
    updateThreadParent,
  };
}
