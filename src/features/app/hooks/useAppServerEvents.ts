import { useEffect } from "react";
import type { AppServerEvent, ApprovalRequest } from "../../../types";
import { subscribeAppServerEvents } from "../../../services/events";

type AgentDelta = {
  workspaceId: string;
  threadId: string;
  itemId: string;
  delta: string;
};

type AgentCompleted = {
  workspaceId: string;
  threadId: string;
  itemId: string;
  text: string;
};

type AppServerEventHandlers = {
  onWorkspaceConnected?: (workspaceId: string) => void;
  onApprovalRequest?: (request: ApprovalRequest) => void;
  onAgentMessageDelta?: (event: AgentDelta) => void;
  onAgentMessageCompleted?: (event: AgentCompleted) => void;
  onAppServerEvent?: (event: AppServerEvent) => void;
  onTurnStarted?: (workspaceId: string, threadId: string, turnId: string) => void;
  onTurnCompleted?: (workspaceId: string, threadId: string, turnId: string) => void;
  onTurnError?: (
    workspaceId: string,
    threadId: string,
    turnId: string,
    payload: { message: string; willRetry: boolean },
  ) => void;
  onTurnPlanUpdated?: (
    workspaceId: string,
    threadId: string,
    turnId: string,
    payload: { explanation: unknown; plan: unknown },
  ) => void;
  onItemStarted?: (workspaceId: string, threadId: string, item: Record<string, unknown>) => void;
  onItemCompleted?: (workspaceId: string, threadId: string, item: Record<string, unknown>) => void;
  onReasoningSummaryDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onReasoningTextDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onCommandOutputDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onFileChangeOutputDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onTurnDiffUpdated?: (workspaceId: string, threadId: string, diff: string) => void;
  onThreadTokenUsageUpdated?: (
    workspaceId: string,
    threadId: string,
    tokenUsage: Record<string, unknown>,
  ) => void;
  onAccountRateLimitsUpdated?: (
    workspaceId: string,
    rateLimits: Record<string, unknown>,
  ) => void;
};

export function useAppServerEvents(handlers: AppServerEventHandlers) {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let canceled = false;
    subscribeAppServerEvents((payload) => {
      handlers.onAppServerEvent?.(payload);

      const { workspace_id, message } = payload;
      const method = String(message.method ?? "");

      if (method === "codex/connected") {
        handlers.onWorkspaceConnected?.(workspace_id);
        return;
      }

      if (method.includes("requestApproval") && typeof message.id === "number") {
        handlers.onApprovalRequest?.({
          workspace_id,
          request_id: message.id,
          method,
          params: (message.params as Record<string, unknown>) ?? {},
        });
        return;
      }

      if (method === "item/agentMessage/delta") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          handlers.onAgentMessageDelta?.({
            workspaceId: workspace_id,
            threadId,
            itemId,
            delta,
          });
        }
        return;
      }

      if (method === "turn/started") {
        const params = message.params as Record<string, unknown>;
        const turn = params.turn as Record<string, unknown> | undefined;
        const threadId = String(turn?.threadId ?? turn?.thread_id ?? "");
        const turnId = String(turn?.id ?? "");
        if (threadId) {
          handlers.onTurnStarted?.(workspace_id, threadId, turnId);
        }
        return;
      }

      if (method === "error") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const turnId = String(params.turnId ?? params.turn_id ?? "");
        const error = (params.error as Record<string, unknown> | undefined) ?? {};
        const messageText = String(error.message ?? "");
        const willRetry = Boolean(params.willRetry ?? params.will_retry);
        if (threadId) {
          handlers.onTurnError?.(workspace_id, threadId, turnId, {
            message: messageText,
            willRetry,
          });
        }
        return;
      }

      if (method === "turn/completed") {
        const params = message.params as Record<string, unknown>;
        const turn = params.turn as Record<string, unknown> | undefined;
        const threadId = String(turn?.threadId ?? turn?.thread_id ?? "");
        const turnId = String(turn?.id ?? "");
        if (threadId) {
          handlers.onTurnCompleted?.(workspace_id, threadId, turnId);
        }
        return;
      }

      if (method === "turn/plan/updated") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const turnId = String(params.turnId ?? params.turn_id ?? "");
        if (threadId) {
          handlers.onTurnPlanUpdated?.(workspace_id, threadId, turnId, {
            explanation: params.explanation,
            plan: params.plan,
          });
        }
        return;
      }

      if (method === "turn/diff/updated") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const diff = String(params.diff ?? "");
        if (threadId && diff) {
          handlers.onTurnDiffUpdated?.(workspace_id, threadId, diff);
        }
        return;
      }

      if (method === "thread/tokenUsage/updated") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const tokenUsage =
          (params.tokenUsage as Record<string, unknown> | undefined) ??
          (params.token_usage as Record<string, unknown> | undefined);
        if (threadId && tokenUsage) {
          handlers.onThreadTokenUsageUpdated?.(workspace_id, threadId, tokenUsage);
        }
        return;
      }

      if (method === "account/rateLimits/updated") {
        const params = message.params as Record<string, unknown>;
        const rateLimits =
          (params.rateLimits as Record<string, unknown> | undefined) ??
          (params.rate_limits as Record<string, unknown> | undefined);
        if (rateLimits) {
          handlers.onAccountRateLimitsUpdated?.(workspace_id, rateLimits);
        }
        return;
      }

      if (method === "item/completed") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const item = params.item as Record<string, unknown> | undefined;
        if (threadId && item) {
          handlers.onItemCompleted?.(workspace_id, threadId, item);
        }
        if (threadId && item?.type === "agentMessage") {
          const itemId = String(item.id ?? "");
          const text = String(item.text ?? "");
          if (itemId) {
            handlers.onAgentMessageCompleted?.({
              workspaceId: workspace_id,
              threadId,
              itemId,
              text,
            });
          }
        }
        return;
      }

      if (method === "item/started") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const item = params.item as Record<string, unknown> | undefined;
        if (threadId && item) {
          handlers.onItemStarted?.(workspace_id, threadId, item);
        }
        return;
      }

      if (method === "item/reasoning/summaryTextDelta") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          handlers.onReasoningSummaryDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }

      if (method === "item/reasoning/textDelta") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          handlers.onReasoningTextDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }

      if (method === "item/commandExecution/outputDelta") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          handlers.onCommandOutputDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }

      if (method === "item/fileChange/outputDelta") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          handlers.onFileChangeOutputDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }
    }).then((handler) => {
      if (canceled) {
        try {
          handler();
        } catch {
          // Ignore unlisten errors when already removed.
        }
      } else {
        unlisten = handler;
      }
    });

    return () => {
      canceled = true;
      if (unlisten) {
        try {
          unlisten();
        } catch {
          // Ignore unlisten errors when already removed.
        }
      }
    };
  }, [handlers]);
}
