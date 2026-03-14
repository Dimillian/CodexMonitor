import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreadChatTree, ThreadChatTreeNode } from "@/types";
import {
  threadChatTreeRead,
  threadChatTreeSetCurrent,
} from "@services/tauri";

type UseThreadChatTreeOptions = {
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  hasLocalSnapshot: boolean;
  isProcessing: boolean;
  isResumeLoading: boolean;
  refreshThread: (workspaceId: string, threadId: string) => Promise<string | null>;
};

type LoadTreeOptions = {
  silent?: boolean;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeChatTreeNode(node: unknown): ThreadChatTreeNode | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return null;
  }
  const record = node as Record<string, unknown>;
  const nodeId = asString(record.nodeId ?? record.node_id).trim();
  if (!nodeId) {
    return null;
  }
  const parentNodeId = asString(
    record.parentNodeId ?? record.parent_node_id ?? "",
  ).trim();
  const summary = asString(record.summary ?? "").trim();
  const turnId = asString(record.turnId ?? record.turn_id ?? "").trim();
  const order = Number(record.order ?? 0);
  return {
    nodeId,
    parentNodeId: parentNodeId || null,
    summary: summary || null,
    turnId: turnId || null,
    order: Number.isFinite(order) ? order : 0,
  };
}

function normalizeThreadChatTree(payload: unknown): ThreadChatTree | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const currentNodeId = asString(
    record.currentNodeId ?? record.current_node_id ?? "",
  ).trim();
  const nodes = Array.isArray(record.nodes)
    ? record.nodes
        .map((entry) => normalizeChatTreeNode(entry))
        .filter((entry): entry is ThreadChatTreeNode => Boolean(entry))
    : [];
  return {
    currentNodeId: currentNodeId || null,
    nodes,
  };
}

function extractChatTree(response: unknown): ThreadChatTree | null {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return null;
  }
  const record = response as Record<string, unknown>;
  const result =
    record.result && typeof record.result === "object" && !Array.isArray(record.result)
      ? (record.result as Record<string, unknown>)
      : record;
  return normalizeThreadChatTree(result.chatTree ?? result.chat_tree ?? null);
}

export function useThreadChatTree({
  activeWorkspaceId,
  activeThreadId,
  hasLocalSnapshot,
  isProcessing,
  isResumeLoading,
  refreshThread,
}: UseThreadChatTreeOptions) {
  const [treesByThreadId, setTreesByThreadId] = useState<Record<string, ThreadChatTree>>({});
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
  const [switchingNodeId, setSwitchingNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadSequenceRef = useRef(0);
  const visibleLoadCountByThreadRef = useRef<Record<string, number>>({});
  const switchSequenceRef = useRef(0);
  const previousThreadKeyRef = useRef<string | null>(null);
  const previousResumeLoadingRef = useRef(false);
  const previousProcessingRef = useRef(false);

  const activeTree = useMemo(
    () => (activeThreadId ? treesByThreadId[activeThreadId] ?? null : null),
    [activeThreadId, treesByThreadId],
  );
  const activeThreadIsLoading =
    Boolean(activeThreadId) &&
    (loadingThreadId === activeThreadId || isResumeLoading);

  const loadTree = useCallback(
    async (
      workspaceId: string,
      threadId: string,
      options?: LoadTreeOptions,
    ): Promise<ThreadChatTree | null> => {
      const silent = options?.silent ?? false;
      const requestId = loadSequenceRef.current + 1;
      loadSequenceRef.current = requestId;

      if (!silent) {
        visibleLoadCountByThreadRef.current[threadId] =
          (visibleLoadCountByThreadRef.current[threadId] ?? 0) + 1;
        setLoadingThreadId(threadId);
        setError(null);
      }

      try {
        const response = await threadChatTreeRead(workspaceId, threadId);
        const tree = extractChatTree(response);
        if (loadSequenceRef.current !== requestId) {
          return tree;
        }
        setTreesByThreadId((current) => {
          if (!tree) {
            const { [threadId]: _removed, ...rest } = current;
            return rest;
          }
          return {
            ...current,
            [threadId]: tree,
          };
        });
        setError(null);
        return tree;
      } catch (cause) {
        if (loadSequenceRef.current === requestId && !silent) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
        return null;
      } finally {
        if (!silent) {
          const nextVisibleLoadCount = Math.max(
            0,
            (visibleLoadCountByThreadRef.current[threadId] ?? 1) - 1,
          );
          if (nextVisibleLoadCount === 0) {
            delete visibleLoadCountByThreadRef.current[threadId];
            setLoadingThreadId((current) => (current === threadId ? null : current));
          } else {
            visibleLoadCountByThreadRef.current[threadId] = nextVisibleLoadCount;
          }
        }
      }
    },
    [],
  );

  const reloadActiveTree = useCallback(async () => {
    if (!activeWorkspaceId || !activeThreadId) {
      return null;
    }
    return loadTree(activeWorkspaceId, activeThreadId);
  }, [activeThreadId, activeWorkspaceId, loadTree]);

  useEffect(() => {
    const workspaceId = activeWorkspaceId;
    const threadId = activeThreadId;
    const nextThreadKey =
      workspaceId && threadId ? `${workspaceId}:${threadId}` : null;
    const previousThreadKey = previousThreadKeyRef.current;
    previousThreadKeyRef.current = nextThreadKey;
    if (!nextThreadKey) {
      loadSequenceRef.current += 1;
      switchSequenceRef.current += 1;
      visibleLoadCountByThreadRef.current = {};
      previousResumeLoadingRef.current = isResumeLoading;
      previousProcessingRef.current = isProcessing;
      setLoadingThreadId(null);
      setSwitchingNodeId(null);
      setError(null);
      return;
    }
    if (nextThreadKey === previousThreadKey) {
      return;
    }
    if (!workspaceId || !threadId) {
      return;
    }
    loadSequenceRef.current += 1;
    switchSequenceRef.current += 1;
    visibleLoadCountByThreadRef.current = {};
    setLoadingThreadId(null);
    setSwitchingNodeId(null);
    setError(null);
    if (hasLocalSnapshot) {
      void loadTree(workspaceId, threadId);
    }
    previousResumeLoadingRef.current = isResumeLoading;
    previousProcessingRef.current = isProcessing;
  }, [
    activeThreadId,
    activeWorkspaceId,
    hasLocalSnapshot,
    isProcessing,
    isResumeLoading,
    loadTree,
  ]);

  useEffect(() => {
    const previousResumeLoading = previousResumeLoadingRef.current;
    previousResumeLoadingRef.current = isResumeLoading;
    if (!activeWorkspaceId || !activeThreadId) {
      return;
    }
    if (previousResumeLoading && !isResumeLoading) {
      void loadTree(activeWorkspaceId, activeThreadId, { silent: true });
    }
  }, [activeThreadId, activeWorkspaceId, isResumeLoading, loadTree]);

  useEffect(() => {
    const previousProcessing = previousProcessingRef.current;
    previousProcessingRef.current = isProcessing;
    if (!activeWorkspaceId || !activeThreadId) {
      return;
    }
    if (previousProcessing && !isProcessing) {
      void loadTree(activeWorkspaceId, activeThreadId, { silent: true });
    }
  }, [activeThreadId, activeWorkspaceId, isProcessing, loadTree]);

  const setCurrentNode = useCallback(
    async (nodeId: string) => {
      const nextNodeId = nodeId.trim();
      if (
        !activeWorkspaceId ||
        !activeThreadId ||
        !nextNodeId ||
        isProcessing ||
        activeThreadIsLoading ||
        switchingNodeId
      ) {
        return false;
      }
      if (activeTree?.currentNodeId === nextNodeId) {
        return false;
      }

      const switchRequestId = switchSequenceRef.current + 1;
      switchSequenceRef.current = switchRequestId;
      setSwitchingNodeId(nextNodeId);
      setError(null);
      try {
        await threadChatTreeSetCurrent(activeWorkspaceId, activeThreadId, nextNodeId);
        const refreshedThreadId = await refreshThread(activeWorkspaceId, activeThreadId);
        if (!refreshedThreadId) {
          throw new Error("Failed to refresh the selected branch.");
        }
        await loadTree(activeWorkspaceId, activeThreadId);
        return true;
      } catch (cause) {
        if (switchSequenceRef.current === switchRequestId) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
        return false;
      } finally {
        if (switchSequenceRef.current === switchRequestId) {
          setSwitchingNodeId(null);
        }
      }
    },
    [
      activeThreadId,
      activeThreadIsLoading,
      activeTree?.currentNodeId,
      activeWorkspaceId,
      isProcessing,
      loadTree,
      refreshThread,
      switchingNodeId,
    ],
  );

  return {
    activeTree,
    isLoading:
      activeThreadIsLoading || (Boolean(activeThreadId) && (!hasLocalSnapshot && !activeTree)),
    isSwitching: switchingNodeId !== null,
    switchingNodeId,
    error,
    reloadActiveTree,
    setCurrentNode,
  };
}
