import { useCallback } from "react";
import type { Dispatch } from "react";
import type { ConversationItem } from "@/types";
import type { ThreadAction } from "./useThreadsReducer";

type HookRun = Record<string, unknown>;

type UseThreadHookEventsOptions = {
  dispatch: Dispatch<ThreadAction>;
  getItemsForThread: (threadId: string) => ConversationItem[];
  safeMessageActivity: () => void;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function basename(path: string) {
  if (!path) {
    return "";
  }
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function formatHookDetail(run: HookRun) {
  const parts = [
    asString(run.handlerType ?? run.handler_type).trim().toLowerCase(),
    asString(run.executionMode ?? run.execution_mode).trim().toLowerCase(),
    asString(run.scope).trim().toLowerCase(),
    basename(asString(run.sourcePath ?? run.source_path).trim()),
  ].filter(Boolean);
  const statusMessage = asString(run.statusMessage ?? run.status_message).trim();
  if (statusMessage) {
    parts.push(statusMessage);
  }
  return parts.join(" • ");
}

function formatHookOutput(run: HookRun) {
  const entries = Array.isArray(run.entries) ? run.entries : [];
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return "";
      }
      const record = entry as Record<string, unknown>;
      const text = asString(record.text).trim();
      if (!text) {
        return "";
      }
      const kind = asString(record.kind).trim().toLowerCase();
      return kind ? `[${kind}] ${text}` : text;
    })
    .filter(Boolean)
    .join("\n");
}

function buildHookConversationItem(run: HookRun, status: string): ConversationItem {
  const eventName = asString(run.eventName ?? run.event_name).trim();
  const durationValue = run.durationMs ?? run.duration_ms;
  const parsedDuration =
    typeof durationValue === "number"
      ? durationValue
      : typeof durationValue === "string" && durationValue.trim()
        ? Number(durationValue)
        : null;
  return {
    id: `hook-${asString(run.id).trim()}`,
    kind: "tool",
    toolType: "hook",
    title: `Hook: ${eventName || "unknown"}`,
    detail: formatHookDetail(run),
    status,
    output: formatHookOutput(run),
    durationMs:
      typeof parsedDuration === "number" && Number.isFinite(parsedDuration)
        ? parsedDuration
        : null,
  };
}

function hasStatusMessage(run: HookRun) {
  return asString(run.statusMessage ?? run.status_message).trim().length > 0;
}

function shouldCreateVisibleCompletion(run: HookRun) {
  const status = asString(run.status).trim().toLowerCase();
  if (status && status !== "completed") {
    return true;
  }
  return formatHookOutput(run).trim().length > 0;
}

export function useThreadHookEvents({
  dispatch,
  getItemsForThread,
  safeMessageActivity,
}: UseThreadHookEventsOptions) {
  const upsertHookItem = useCallback(
    (workspaceId: string, threadId: string, run: HookRun, status: string) => {
      dispatch({ type: "ensureThread", workspaceId, threadId });
      dispatch({
        type: "upsertItem",
        workspaceId,
        threadId,
        item: buildHookConversationItem(run, status),
        hasCustomName: false,
      });
      safeMessageActivity();
    },
    [dispatch, safeMessageActivity],
  );

  const onHookStarted = useCallback(
    (
      workspaceId: string,
      threadId: string,
      _turnId: string | null,
      run: HookRun,
    ) => {
      if (!hasStatusMessage(run)) {
        return;
      }
      upsertHookItem(workspaceId, threadId, run, "running");
    },
    [upsertHookItem],
  );

  const onHookCompleted = useCallback(
    (
      workspaceId: string,
      threadId: string,
      _turnId: string | null,
      run: HookRun,
    ) => {
      const itemId = `hook-${asString(run.id).trim()}`;
      const hasExistingRow = getItemsForThread(threadId).some((item) => item.id === itemId);
      if (!hasExistingRow && !shouldCreateVisibleCompletion(run)) {
        return;
      }
      const status = asString(run.status).trim().toLowerCase() || "completed";
      upsertHookItem(workspaceId, threadId, run, status);
    },
    [getItemsForThread, upsertHookItem],
  );

  return {
    onHookStarted,
    onHookCompleted,
  };
}
