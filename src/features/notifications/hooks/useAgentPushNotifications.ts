import { useCallback, useMemo, useRef } from "react";
import type {
  ApprovalRequest,
  DebugEntry,
  ThreadSummary,
  WorkspaceInfo,
} from "../../../types";
import { sendLocalNotification } from "../../../utils/pushNotifications";
import { useAppServerEvents } from "../../app/hooks/useAppServerEvents";

const COMPLETION_DEDUP_MS = 1500;

type PushNotificationOptions = {
  enabled: boolean;
  isWindowFocused: boolean;
  workspaces: WorkspaceInfo[];
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  onDebug?: (entry: DebugEntry) => void;
};

function buildThreadKey(workspaceId: string, threadId: string) {
  return `${workspaceId}:${threadId}`;
}

function buildApprovalKey(workspaceId: string, requestId: number) {
  return `${workspaceId}:${requestId}`;
}

function formatApprovalMethod(method: string) {
  const trimmed = method.replace(/^codex\/requestApproval\/?/, "");
  return trimmed || method;
}

export function useAgentPushNotifications({
  enabled,
  isWindowFocused,
  workspaces,
  threadsByWorkspace,
  onDebug,
}: PushNotificationOptions) {
  const lastNotifiedAtByThread = useRef(new Map<string, number>());
  const notifiedApprovalKeys = useRef(new Set<string>());

  const workspaceLabels = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
    [workspaces],
  );

  const threadLabelsByWorkspace = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    Object.entries(threadsByWorkspace).forEach(([workspaceId, threads]) => {
      const threadMap = new Map<string, string>();
      threads.forEach((thread) => {
        threadMap.set(thread.id, thread.name);
      });
      map.set(workspaceId, threadMap);
    });
    return map;
  }, [threadsByWorkspace]);

  const shouldNotifyCompletion = useCallback(
    (threadKey: string) => {
      if (!enabled) {
        return false;
      }
      if (isWindowFocused) {
        return false;
      }
      const lastNotifiedAt = lastNotifiedAtByThread.current.get(threadKey);
      if (lastNotifiedAt && Date.now() - lastNotifiedAt < COMPLETION_DEDUP_MS) {
        return false;
      }
      lastNotifiedAtByThread.current.set(threadKey, Date.now());
      return true;
    },
    [enabled, isWindowFocused],
  );

  const shouldNotifyApproval = useCallback(
    (approvalKey: string) => {
      if (!enabled) {
        return false;
      }
      if (isWindowFocused) {
        return false;
      }
      if (notifiedApprovalKeys.current.has(approvalKey)) {
        return false;
      }
      notifiedApprovalKeys.current.add(approvalKey);
      return true;
    },
    [enabled, isWindowFocused],
  );

  const notifyAgentCompleted = useCallback(
    async (workspaceId: string, threadId: string) => {
      const threadKey = buildThreadKey(workspaceId, threadId);
      if (!shouldNotifyCompletion(threadKey)) {
        return;
      }
      const workspaceName = workspaceLabels.get(workspaceId);
      const threadName = threadLabelsByWorkspace.get(workspaceId)?.get(threadId);
      const title = threadName ? `Agent finished: ${threadName}` : "Agent finished";
      const body = workspaceName ? `Workspace: ${workspaceName}` : undefined;
      await sendLocalNotification(
        { title, body },
        onDebug,
        {
          title,
          body,
          workspaceId,
          threadId,
          kind: "completion",
        },
      );
    },
    [
      onDebug,
      shouldNotifyCompletion,
      threadLabelsByWorkspace,
      workspaceLabels,
    ],
  );

  const notifyApprovalRequest = useCallback(
    async (request: ApprovalRequest) => {
      const approvalKey = buildApprovalKey(request.workspace_id, request.request_id);
      if (!shouldNotifyApproval(approvalKey)) {
        return;
      }
      const workspaceName = workspaceLabels.get(request.workspace_id);
      const methodLabel = formatApprovalMethod(request.method);
      const bodyParts = [];
      if (workspaceName) {
        bodyParts.push(workspaceName);
      }
      if (methodLabel) {
        bodyParts.push(methodLabel);
      }
      const body = bodyParts.length ? bodyParts.join(" - ") : undefined;
      const params = request.params ?? {};
      const inferredThreadId =
        typeof params.thread_id === "string"
          ? params.thread_id
          : typeof params.threadId === "string"
            ? params.threadId
            : null;
      await sendLocalNotification(
        { title: "Approval needed", body },
        onDebug,
        {
          title: "Approval needed",
          body,
          workspaceId: request.workspace_id,
          threadId: inferredThreadId,
          kind: "approval",
        },
      );
    },
    [onDebug, shouldNotifyApproval, workspaceLabels],
  );

  const handleTurnCompleted = useCallback(
    (workspaceId: string, threadId: string) => {
      void notifyAgentCompleted(workspaceId, threadId);
    },
    [notifyAgentCompleted],
  );

  const handleAgentMessageCompleted = useCallback(
    (event: { workspaceId: string; threadId: string }) => {
      void notifyAgentCompleted(event.workspaceId, event.threadId);
    },
    [notifyAgentCompleted],
  );

  const handlers = useMemo(
    () => ({
      onTurnCompleted: handleTurnCompleted,
      onAgentMessageCompleted: handleAgentMessageCompleted,
      onApprovalRequest: (request: ApprovalRequest) => {
        void notifyApprovalRequest(request);
      },
    }),
    [handleAgentMessageCompleted, handleTurnCompleted, notifyApprovalRequest],
  );

  useAppServerEvents(handlers);
}
