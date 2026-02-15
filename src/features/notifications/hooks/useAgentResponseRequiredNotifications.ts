import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function asNonEmptyString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function getApprovalThreadId(approval: ApprovalRequest): string | null {
  const params = approval.params as Record<string, unknown>;
  const direct = asNonEmptyString(params.threadId ?? params.thread_id);
  if (direct) {
    return direct;
  }
  const turn =
    params.turn && typeof params.turn === "object"
      ? (params.turn as Record<string, unknown>)
      : null;
  return asNonEmptyString(turn?.threadId ?? turn?.thread_id);
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
<<<<<<< HEAD
  isSubAgentThread?: (workspaceId: string, threadId: string) => boolean;
=======
  subagentNotificationsEnabled?: boolean;
  isSubagentThread?: (workspaceId: string, threadId: string) => boolean;
>>>>>>> origin/main
  getWorkspaceName?: (workspaceId: string) => string | undefined;
  onDebug?: (entry: DebugEntry) => void;
};

type PendingPlanNotification = {
  title: string;
  body: string;
  extra: Record<string, unknown>;
};

export function useAgentResponseRequiredNotifications({
  enabled,
  isWindowFocused,
  approvals,
  userInputRequests,
<<<<<<< HEAD
  isSubAgentThread,
=======
  subagentNotificationsEnabled = true,
  isSubagentThread,
>>>>>>> origin/main
  getWorkspaceName,
  onDebug,
}: ResponseRequiredNotificationOptions) {
  const lastNotifiedAtRef = useRef(0);
  const notifiedApprovalsRef = useRef(new Set<string>());
  const notifiedUserInputsRef = useRef(new Set<string>());
  const notifiedPlanItemsRef = useRef(new Set<string>());
  const pendingPlanNotificationsRef = useRef(new Map<string, PendingPlanNotification>());
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retrySignal, setRetrySignal] = useState(0);
  const [pendingPlansSignal, setPendingPlansSignal] = useState(0);

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

  const scheduleRetry = useCallback(() => {
    if (!enabled || isWindowFocused || retryTimeoutRef.current) {
      return;
    }
    const elapsed = lastNotifiedAtRef.current
      ? Date.now() - lastNotifiedAtRef.current
      : MIN_NOTIFICATION_SPACING_MS;
    const delay = Math.max(0, MIN_NOTIFICATION_SPACING_MS - elapsed);
    retryTimeoutRef.current = setTimeout(() => {
      retryTimeoutRef.current = null;
      setRetrySignal((value) => value + 1);
    }, delay);
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

  useEffect(
    () => () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const activeKeys = new Set(
      approvals.map((approval) =>
        buildApprovalKey(approval.workspace_id, approval.request_id),
      ),
    );
    for (const key of notifiedApprovalsRef.current) {
      if (!activeKeys.has(key)) {
        notifiedApprovalsRef.current.delete(key);
      }
    }
  }, [approvals]);

  useEffect(() => {
    const activeKeys = new Set(
      userInputRequests.map((request) =>
        buildUserInputKey(request.workspace_id, request.request_id),
      ),
    );
    for (const key of notifiedUserInputsRef.current) {
      if (!activeKeys.has(key)) {
        notifiedUserInputsRef.current.delete(key);
      }
    }
  }, [userInputRequests]);

  const latestUnnotifiedApproval = (() => {
    for (let index = approvals.length - 1; index >= 0; index -= 1) {
      const approval = approvals[index];
      if (!approval) {
        continue;
      }
      const threadId = getApprovalThreadId(approval);
      if (threadId && isSubAgentThread?.(approval.workspace_id, threadId)) {
        continue;
      }
      const key = buildApprovalKey(approval.workspace_id, approval.request_id);
      if (!notifiedApprovalsRef.current.has(key)) {
        return approval;
      }
    }
    return null;
  })();

  useEffect(() => {
    if (!latestUnnotifiedApproval) {
      return;
    }
    if (!canNotifyNow()) {
      scheduleRetry();
      return;
    }

    const approvalKey = buildApprovalKey(
      latestUnnotifiedApproval.workspace_id,
      latestUnnotifiedApproval.request_id,
    );
    notifiedApprovalsRef.current.add(approvalKey);

    const workspaceName = getWorkspaceName?.(latestUnnotifiedApproval.workspace_id);
    const title = workspaceName
      ? `Approval needed — ${workspaceName}`
      : "Approval needed";
    const commandInfo = getApprovalCommandInfo(latestUnnotifiedApproval.params ?? {});
    const threadId = getApprovalThreadId(latestUnnotifiedApproval);
    const body = commandInfo?.preview
      ? truncateText(commandInfo.preview, MAX_BODY_LENGTH)
      : truncateText(latestUnnotifiedApproval.method, MAX_BODY_LENGTH);

    void notify(title, body, {
      kind: "response_required",
      type: "approval",
      workspaceId: latestUnnotifiedApproval.workspace_id,
      requestId: latestUnnotifiedApproval.request_id,
      threadId,
    });
    scheduleRetry();
  }, [
    canNotifyNow,
    getWorkspaceName,
    isSubAgentThread,
    latestUnnotifiedApproval,
    notify,
    retrySignal,
    scheduleRetry,
  ]);

  const latestUnnotifiedQuestion = (() => {
    for (let index = userInputRequests.length - 1; index >= 0; index -= 1) {
      const request = userInputRequests[index];
      if (!request) {
        continue;
      }
      const threadId = request.params.thread_id.trim();
      if (threadId && isSubAgentThread?.(request.workspace_id, threadId)) {
        continue;
      }
      const key = buildUserInputKey(request.workspace_id, request.request_id);
      if (!notifiedUserInputsRef.current.has(key)) {
        return request;
      }
    }
    return null;
  })();

  useEffect(() => {
    if (!latestUnnotifiedQuestion) {
      return;
    }
    if (!canNotifyNow()) {
      scheduleRetry();
      return;
    }

    const questionKey = buildUserInputKey(
      latestUnnotifiedQuestion.workspace_id,
      latestUnnotifiedQuestion.request_id,
    );
    notifiedUserInputsRef.current.add(questionKey);

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
    scheduleRetry();
  }, [
    canNotifyNow,
    getWorkspaceName,
    isSubAgentThread,
    latestUnnotifiedQuestion,
    notify,
    retrySignal,
    scheduleRetry,
  ]);

  useEffect(() => {
    if (!pendingPlanNotificationsRef.current.size) {
      return;
    }
    if (!canNotifyNow()) {
      scheduleRetry();
      return;
    }
    const next = pendingPlanNotificationsRef.current.entries().next().value as
      | [string, PendingPlanNotification]
      | undefined;
    if (!next) {
      return;
    }
    const [key, pending] = next;
    pendingPlanNotificationsRef.current.delete(key);
    notifiedPlanItemsRef.current.add(key);
    setPendingPlansSignal((value) => value + 1);
    void notify(pending.title, pending.body, pending.extra);
    if (pendingPlanNotificationsRef.current.size) {
      scheduleRetry();
    }
  }, [canNotifyNow, notify, pendingPlansSignal, retrySignal, scheduleRetry]);

  const onItemCompleted = useCallback(
    (workspaceId: string, threadId: string, item: Record<string, unknown>) => {
<<<<<<< HEAD
      if (isSubAgentThread?.(workspaceId, threadId)) {
=======
      if (shouldMuteSubagentThread(workspaceId, threadId)) {
>>>>>>> origin/main
        return;
      }
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
      if (
        notifiedPlanItemsRef.current.has(key) ||
        pendingPlanNotificationsRef.current.has(key)
      ) {
        return;
      }
      const workspaceName = getWorkspaceName?.(workspaceId);
      const title = workspaceName ? `Plan ready — ${workspaceName}` : "Plan ready";
      const text = String(item.text ?? "").trim();
      const body = text
        ? truncateText(text.split("\n")[0] ?? text, MAX_BODY_LENGTH)
        : "Plan is ready. Open CodexMonitor to respond.";
      const extra = {
        kind: "response_required",
        type: "plan",
        workspaceId,
        threadId,
        itemId,
      };
      if (!canNotifyNow()) {
        pendingPlanNotificationsRef.current.set(key, { title, body, extra });
        setPendingPlansSignal((value) => value + 1);
        scheduleRetry();
        return;
      }
      notifiedPlanItemsRef.current.add(key);

      void notify(title, body, extra);
    },
<<<<<<< HEAD
    [canNotifyNow, getWorkspaceName, isSubAgentThread, notify, scheduleRetry],
=======
    [canNotifyNow, getWorkspaceName, notify, scheduleRetry, shouldMuteSubagentThread],
>>>>>>> origin/main
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
