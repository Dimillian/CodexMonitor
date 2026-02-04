import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  ApprovalRequest,
  DebugEntry,
  RequestUserInputRequest,
} from "../../../types";
import { sendNotification } from "../../../services/tauri";
import { getApprovalCommandInfo } from "../../../utils/approvalRules";
import { useAppServerEvents } from "../../app/hooks/useAppServerEvents";

const MAX_BODY_LENGTH = 200;
const MIN_NOTIFICATION_SPACING_MS = 1500;

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 1) + "…";
}

function buildApprovalKey(workspaceId: string, requestId: string | number) {
  return `${workspaceId}:${requestId}`;
}

function buildUserInputKey(workspaceId: string, requestId: string | number) {
  return `${workspaceId}:${requestId}`;
}

function buildPlanKey(workspaceId: string, threadId: string, itemId: string) {
  return `${workspaceId}:${threadId}:${itemId}`;
}

function isCompletedStatus(status: unknown) {
  const normalized = String(status ?? "").toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "done" ||
    normalized.includes("complete")
  );
}

type ResponseRequiredNotificationOptions = {
  enabled: boolean;
  isWindowFocused: boolean;
  approvals: ApprovalRequest[];
  userInputRequests: RequestUserInputRequest[];
  getWorkspaceName?: (workspaceId: string) => string | undefined;
  onDebug?: (entry: DebugEntry) => void;
};

export function useAgentResponseRequiredNotifications({
  enabled,
  isWindowFocused,
  approvals,
  userInputRequests,
  getWorkspaceName,
  onDebug,
}: ResponseRequiredNotificationOptions) {
  const lastNotifiedAtRef = useRef(0);
  const notifiedApprovalsRef = useRef(new Set<string>());
  const notifiedUserInputsRef = useRef(new Set<string>());
  const notifiedPlanItemsRef = useRef(new Set<string>());

  const canNotifyNow = useCallback(() => {
    if (!enabled) {
      return false;
    }
    if (isWindowFocused) {
      return false;
    }
    const lastNotifiedAt = lastNotifiedAtRef.current;
    if (lastNotifiedAt && Date.now() - lastNotifiedAt < MIN_NOTIFICATION_SPACING_MS) {
      return false;
    }
    lastNotifiedAtRef.current = Date.now();
    return true;
  }, [enabled, isWindowFocused]);

  const notify = useCallback(
    async (
      title: string,
      body: string,
      extra?: Record<string, unknown>,
    ) => {
      try {
        await sendNotification(title, body, {
          autoCancel: true,
          extra,
        });
        onDebug?.({
          id: `${Date.now()}-client-notification-attention`,
          timestamp: Date.now(),
          source: "client",
          label: "notification/attention",
          payload: { title, body },
        });
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-notification-attention-error`,
          timestamp: Date.now(),
          source: "error",
          label: "notification/error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [onDebug],
  );

  const latestUnnotifiedApproval = useMemo(() => {
    for (let index = approvals.length - 1; index >= 0; index -= 1) {
      const approval = approvals[index];
      if (!approval) {
        continue;
      }
      const key = buildApprovalKey(approval.workspace_id, approval.request_id);
      if (!notifiedApprovalsRef.current.has(key)) {
        return approval;
      }
    }
    return null;
  }, [approvals]);

  useEffect(() => {
    if (!latestUnnotifiedApproval) {
      return;
    }
    if (!canNotifyNow()) {
      return;
    }

    approvals.forEach((approval) => {
      const key = buildApprovalKey(approval.workspace_id, approval.request_id);
      notifiedApprovalsRef.current.add(key);
    });

    const workspaceName = getWorkspaceName?.(latestUnnotifiedApproval.workspace_id);
    const title = workspaceName
      ? `Approval needed — ${workspaceName}`
      : "Approval needed";
    const commandInfo = getApprovalCommandInfo(latestUnnotifiedApproval.params ?? {});
    const body = commandInfo?.preview
      ? truncateText(commandInfo.preview, MAX_BODY_LENGTH)
      : truncateText(latestUnnotifiedApproval.method, MAX_BODY_LENGTH);

    void notify(title, body, {
      kind: "response_required",
      type: "approval",
      workspaceId: latestUnnotifiedApproval.workspace_id,
      requestId: latestUnnotifiedApproval.request_id,
    });
  }, [
    approvals,
    canNotifyNow,
    getWorkspaceName,
    latestUnnotifiedApproval,
    notify,
  ]);

  const latestUnnotifiedQuestion = useMemo(() => {
    for (let index = userInputRequests.length - 1; index >= 0; index -= 1) {
      const request = userInputRequests[index];
      if (!request) {
        continue;
      }
      const key = buildUserInputKey(request.workspace_id, request.request_id);
      if (!notifiedUserInputsRef.current.has(key)) {
        return request;
      }
    }
    return null;
  }, [userInputRequests]);

  useEffect(() => {
    if (!latestUnnotifiedQuestion) {
      return;
    }
    if (!canNotifyNow()) {
      return;
    }

    userInputRequests.forEach((request) => {
      const key = buildUserInputKey(request.workspace_id, request.request_id);
      notifiedUserInputsRef.current.add(key);
    });

    const workspaceName = getWorkspaceName?.(latestUnnotifiedQuestion.workspace_id);
    const title = workspaceName ? `Question — ${workspaceName}` : "Question";
    const first = latestUnnotifiedQuestion.params.questions[0];
    const bodyRaw = first?.header?.trim() || first?.question?.trim() || "Your input is needed.";
    const body = truncateText(bodyRaw, MAX_BODY_LENGTH);

    void notify(title, body, {
      kind: "response_required",
      type: "question",
      workspaceId: latestUnnotifiedQuestion.workspace_id,
      requestId: latestUnnotifiedQuestion.request_id,
      threadId: latestUnnotifiedQuestion.params.thread_id,
      turnId: latestUnnotifiedQuestion.params.turn_id,
      itemId: latestUnnotifiedQuestion.params.item_id,
    });
  }, [
    canNotifyNow,
    getWorkspaceName,
    latestUnnotifiedQuestion,
    notify,
    userInputRequests,
  ]);

  const onItemCompleted = useCallback(
    (workspaceId: string, threadId: string, item: Record<string, unknown>) => {
      const type = String(item.type ?? "");
      if (type !== "plan") {
        return;
      }
      if (!isCompletedStatus(item.status)) {
        return;
      }
      const itemId = String(item.id ?? "");
      if (!itemId) {
        return;
      }
      const key = buildPlanKey(workspaceId, threadId, itemId);
      if (notifiedPlanItemsRef.current.has(key)) {
        return;
      }
      if (!canNotifyNow()) {
        return;
      }
      notifiedPlanItemsRef.current.add(key);

      const workspaceName = getWorkspaceName?.(workspaceId);
      const title = workspaceName ? `Plan ready — ${workspaceName}` : "Plan ready";
      const text = String(item.text ?? "").trim();
      const body = text
        ? truncateText(text.split("\n")[0] ?? text, MAX_BODY_LENGTH)
        : "Plan is ready. Open CodexMonitor to respond.";

      void notify(title, body, {
        kind: "response_required",
        type: "plan",
        workspaceId,
        threadId,
        itemId,
      });
    },
    [canNotifyNow, getWorkspaceName, notify],
  );

  useAppServerEvents(
    useMemo(
      () => ({
        onItemCompleted,
      }),
      [onItemCompleted],
    ),
  );
}

