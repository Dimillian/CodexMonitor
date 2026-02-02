import { useCallback, useMemo, useRef } from "react";
import type { DebugEntry } from "../../../types";
import { sendNotification } from "../../../services/tauri";
import { useAppServerEvents } from "../../app/hooks/useAppServerEvents";

const DEFAULT_MIN_DURATION_MS = 60_000; // 1 minute
const MAX_BODY_LENGTH = 200;

type SystemNotificationOptions = {
  enabled: boolean;
  isWindowFocused: boolean;
  minDurationMs?: number;
  getWorkspaceName?: (workspaceId: string) => string | undefined;
  onDebug?: (entry: DebugEntry) => void;
};

function buildThreadKey(workspaceId: string, threadId: string) {
  return `${workspaceId}:${threadId}`;
}

function buildTurnKey(workspaceId: string, turnId: string) {
  return `${workspaceId}:${turnId}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 1) + "…";
}

export function useAgentSystemNotifications({
  enabled,
  isWindowFocused,
  minDurationMs = DEFAULT_MIN_DURATION_MS,
  getWorkspaceName,
  onDebug,
}: SystemNotificationOptions) {
  const turnStartById = useRef(new Map<string, number>());
  const turnStartByThread = useRef(new Map<string, number>());
  const lastNotifiedAtByThread = useRef(new Map<string, number>());
  const lastMessageByThread = useRef(new Map<string, string>());

  const notify = useCallback(
    async (title: string, body: string, label: "success" | "error") => {
      try {
        await sendNotification(title, body);
        onDebug?.({
          id: `${Date.now()}-client-notification-${label}`,
          timestamp: Date.now(),
          source: "client",
          label: `notification/${label}`,
          payload: { title, body },
        });
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-notification-error`,
          timestamp: Date.now(),
          source: "error",
          label: "notification/error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [onDebug],
  );

  const consumeDuration = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      const threadKey = buildThreadKey(workspaceId, threadId);
      let startedAt: number | undefined;

      if (turnId) {
        const turnKey = buildTurnKey(workspaceId, turnId);
        startedAt = turnStartById.current.get(turnKey);
        turnStartById.current.delete(turnKey);
      }

      if (startedAt === undefined) {
        startedAt = turnStartByThread.current.get(threadKey);
      }

      if (startedAt !== undefined) {
        turnStartByThread.current.delete(threadKey);
        return Date.now() - startedAt;
      }

      return null;
    },
    [],
  );

  const recordStartIfMissing = useCallback(
    (workspaceId: string, threadId: string) => {
      const threadKey = buildThreadKey(workspaceId, threadId);
      if (!turnStartByThread.current.has(threadKey)) {
        turnStartByThread.current.set(threadKey, Date.now());
      }
    },
    [],
  );

  const shouldNotify = useCallback(
    (durationMs: number | null, threadKey: string) => {
      if (durationMs === null) {
        return false;
      }
      if (!enabled) {
        return false;
      }
      if (durationMs < minDurationMs) {
        return false;
      }
      if (isWindowFocused) {
        return false;
      }
      const lastNotifiedAt = lastNotifiedAtByThread.current.get(threadKey);
      if (lastNotifiedAt && Date.now() - lastNotifiedAt < 1500) {
        return false;
      }
      lastNotifiedAtByThread.current.set(threadKey, Date.now());
      return true;
    },
    [enabled, isWindowFocused, minDurationMs],
  );

  const getNotificationContent = useCallback(
    (workspaceId: string, threadId: string, fallbackBody: string) => {
      const title = getWorkspaceName?.(workspaceId) ?? "Agent Complete";
      const threadKey = buildThreadKey(workspaceId, threadId);
      const lastMessage = lastMessageByThread.current.get(threadKey);
      const body = lastMessage
        ? truncateText(lastMessage, MAX_BODY_LENGTH)
        : fallbackBody;
      return { title, body };
    },
    [getWorkspaceName],
  );

  const handleTurnStarted = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      const startedAt = Date.now();
      const threadKey = buildThreadKey(workspaceId, threadId);
      turnStartByThread.current.set(threadKey, startedAt);
      lastMessageByThread.current.delete(threadKey);
      if (turnId) {
        turnStartById.current.set(buildTurnKey(workspaceId, turnId), startedAt);
      }
    },
    [],
  );

  const handleTurnCompleted = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      const durationMs = consumeDuration(workspaceId, threadId, turnId);
      const threadKey = buildThreadKey(workspaceId, threadId);
      if (!shouldNotify(durationMs, threadKey)) {
        return;
      }
      const { title, body } = getNotificationContent(
        workspaceId,
        threadId,
        "Your agent has finished its task.",
      );
      void notify(title, body, "success");
      lastMessageByThread.current.delete(threadKey);
    },
    [consumeDuration, getNotificationContent, notify, shouldNotify],
  );

  const handleTurnError = useCallback(
    (
      workspaceId: string,
      threadId: string,
      turnId: string,
      payload: { message: string; willRetry: boolean },
    ) => {
      if (payload.willRetry) {
        return;
      }
      const durationMs = consumeDuration(workspaceId, threadId, turnId);
      const threadKey = buildThreadKey(workspaceId, threadId);
      if (!shouldNotify(durationMs, threadKey)) {
        return;
      }
      const title = getWorkspaceName?.(workspaceId) ?? "Agent Error";
      const body = payload.message || "An error occurred.";
      void notify(title, truncateText(body, MAX_BODY_LENGTH), "error");
      lastMessageByThread.current.delete(threadKey);
    },
    [consumeDuration, getWorkspaceName, notify, shouldNotify],
  );

  const handleItemStarted = useCallback(
    (workspaceId: string, threadId: string) => {
      recordStartIfMissing(workspaceId, threadId);
    },
    [recordStartIfMissing],
  );

  const handleAgentMessageDelta = useCallback(
    (event: { workspaceId: string; threadId: string }) => {
      recordStartIfMissing(event.workspaceId, event.threadId);
    },
    [recordStartIfMissing],
  );

  const handleAgentMessageCompleted = useCallback(
    (event: { workspaceId: string; threadId: string; text: string }) => {
      const threadKey = buildThreadKey(event.workspaceId, event.threadId);
      // Store the message text for use in turn completion notification
      if (event.text) {
        lastMessageByThread.current.set(threadKey, event.text);
      }
      const durationMs = consumeDuration(event.workspaceId, event.threadId, "");
      if (!shouldNotify(durationMs, threadKey)) {
        return;
      }
      const { title, body } = getNotificationContent(
        event.workspaceId,
        event.threadId,
        "Your agent has finished its task.",
      );
      void notify(title, body, "success");
      lastMessageByThread.current.delete(threadKey);
    },
    [consumeDuration, getNotificationContent, notify, shouldNotify],
  );

  const handlers = useMemo(
    () => ({
      onTurnStarted: handleTurnStarted,
      onTurnCompleted: handleTurnCompleted,
      onTurnError: handleTurnError,
      onItemStarted: handleItemStarted,
      onAgentMessageDelta: handleAgentMessageDelta,
      onAgentMessageCompleted: handleAgentMessageCompleted,
    }),
    [
      handleAgentMessageCompleted,
      handleAgentMessageDelta,
      handleItemStarted,
      handleTurnCompleted,
      handleTurnError,
      handleTurnStarted,
    ],
  );

  useAppServerEvents(handlers);
}
