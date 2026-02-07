import { useCallback } from "react";
import type { Dispatch, MutableRefObject } from "react";
import * as Sentry from "@sentry/react";
import type {
  AccessMode,
  RateLimitSnapshot,
  CustomPromptOption,
  DebugEntry,
  ReviewTarget,
  WorkspaceInfo,
} from "../../../types";
import {
  compactThread as compactThreadService,
  sendUserMessage as sendUserMessageService,
  startReview as startReviewService,
  interruptTurn as interruptTurnService,
  getAppsList as getAppsListService,
  listMcpServerStatus as listMcpServerStatusService,
} from "../../../services/tauri";
import { expandCustomPromptText } from "../../../utils/customPrompts";
import {
  asString,
  extractReviewThreadId,
  extractRpcErrorMessage,
  parseReviewTarget,
} from "../utils/threadNormalize";
import type { ThreadAction, ThreadState } from "./useThreadsReducer";
import { useReviewPrompt } from "./useReviewPrompt";
import { formatRelativeTime } from "../../../utils/time";

type SendMessageOptions = {
  skipPromptExpansion?: boolean;
  model?: string | null;
  effort?: string | null;
  collaborationMode?: Record<string, unknown> | null;
  accessMode?: AccessMode;
};

type UseThreadMessagingOptions = {
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  accessMode?: "read-only" | "current" | "full-access";
  model?: string | null;
  effort?: string | null;
  collaborationMode?: Record<string, unknown> | null;
  reviewDeliveryMode?: "inline" | "detached";
  steerEnabled: boolean;
  customPrompts: CustomPromptOption[];
  threadStatusById: ThreadState["threadStatusById"];
  activeTurnIdByThread: ThreadState["activeTurnIdByThread"];
  rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null>;
  pendingInterruptsRef: MutableRefObject<Set<string>>;
  dispatch: Dispatch<ThreadAction>;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  markProcessing: (threadId: string, isProcessing: boolean) => void;
  markReviewing: (threadId: string, isReviewing: boolean) => void;
  setActiveTurnId: (threadId: string, turnId: string | null) => void;
  recordThreadActivity: (
    workspaceId: string,
    threadId: string,
    timestamp?: number,
  ) => void;
  safeMessageActivity: () => void;
  onDebug?: (entry: DebugEntry) => void;
  pushThreadErrorMessage: (threadId: string, message: string) => void;
  ensureThreadForActiveWorkspace: () => Promise<string | null>;
  ensureThreadForWorkspace: (workspaceId: string) => Promise<string | null>;
  refreshThread: (workspaceId: string, threadId: string) => Promise<string | null>;
  forkThreadForWorkspace: (workspaceId: string, threadId: string) => Promise<string | null>;
  updateThreadParent: (parentId: string, childIds: string[]) => void;
};

export function useThreadMessaging({
  activeWorkspace,
  activeThreadId,
  accessMode,
  model,
  effort,
  collaborationMode,
  reviewDeliveryMode = "inline",
  steerEnabled,
  customPrompts,
  threadStatusById,
  activeTurnIdByThread,
  rateLimitsByWorkspace,
  pendingInterruptsRef,
  dispatch,
  getCustomName,
  markProcessing,
  markReviewing,
  setActiveTurnId,
  recordThreadActivity,
  safeMessageActivity,
  onDebug,
  pushThreadErrorMessage,
  ensureThreadForActiveWorkspace,
  ensureThreadForWorkspace,
  refreshThread,
  forkThreadForWorkspace,
  updateThreadParent,
}: UseThreadMessagingOptions) {
  const sendMessageToThread = useCallback(
    async (
      workspace: WorkspaceInfo,
      threadId: string,
      text: string,
      images: string[] = [],
      options?: SendMessageOptions,
    ) => {
      const messageText = text.trim();
      if (!messageText && images.length === 0) {
        return;
      }
      let finalText = messageText;
      if (!options?.skipPromptExpansion) {
        const promptExpansion = expandCustomPromptText(messageText, customPrompts);
        if (promptExpansion && "error" in promptExpansion) {
          pushThreadErrorMessage(threadId, promptExpansion.error);
          safeMessageActivity();
          return;
        }
        finalText = promptExpansion?.expanded ?? messageText;
      }
      const resolvedModel =
        options?.model !== undefined ? options.model : model;
      const resolvedEffort =
        options?.effort !== undefined ? options.effort : effort;
      const resolvedCollaborationMode =
        options?.collaborationMode !== undefined
          ? options.collaborationMode
          : collaborationMode;
      const sanitizedCollaborationMode =
        resolvedCollaborationMode &&
        typeof resolvedCollaborationMode === "object" &&
        "settings" in resolvedCollaborationMode
          ? resolvedCollaborationMode
          : null;
      const resolvedAccessMode =
        options?.accessMode !== undefined ? options.accessMode : accessMode;

      const wasProcessing =
        (threadStatusById[threadId]?.isProcessing ?? false) && steerEnabled;
      if (wasProcessing) {
        const optimisticText = finalText;
        if (optimisticText || images.length > 0) {
          dispatch({
            type: "upsertItem",
            workspaceId: workspace.id,
            threadId,
            item: {
              id: `optimistic-user-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`,
              kind: "message",
              role: "user",
              text: optimisticText,
              images: images.length > 0 ? images : undefined,
            },
            hasCustomName: Boolean(getCustomName(workspace.id, threadId)),
          });
        }
      }
      Sentry.metrics.count("prompt_sent", 1, {
        attributes: {
          workspace_id: workspace.id,
          thread_id: threadId,
          has_images: images.length > 0 ? "true" : "false",
          text_length: String(finalText.length),
          model: resolvedModel ?? "unknown",
          effort: resolvedEffort ?? "unknown",
          collaboration_mode: sanitizedCollaborationMode ?? "unknown",
        },
      });
      const timestamp = Date.now();
      recordThreadActivity(workspace.id, threadId, timestamp);
      dispatch({
        type: "setThreadTimestamp",
        workspaceId: workspace.id,
        threadId,
        timestamp,
      });
      markProcessing(threadId, true);
      safeMessageActivity();
      onDebug?.({
        id: `${Date.now()}-client-turn-start`,
        timestamp: Date.now(),
        source: "client",
        label: "turn/start",
        payload: {
          workspaceId: workspace.id,
          threadId,
          text: finalText,
          images,
          model: resolvedModel,
          effort: resolvedEffort,
          collaborationMode: sanitizedCollaborationMode,
        },
      });
      try {
        const response =
          (await sendUserMessageService(
            workspace.id,
            threadId,
            finalText,
            {
              model: resolvedModel,
              effort: resolvedEffort,
              collaborationMode: sanitizedCollaborationMode,
              accessMode: resolvedAccessMode,
              images,
            },
          )) as Record<string, unknown>;
        onDebug?.({
          id: `${Date.now()}-server-turn-start`,
          timestamp: Date.now(),
          source: "server",
          label: "turn/start response",
          payload: response,
        });
        const rpcError = extractRpcErrorMessage(response);
        if (rpcError) {
          markProcessing(threadId, false);
          setActiveTurnId(threadId, null);
          pushThreadErrorMessage(threadId, `回合启动失败：${rpcError}`);
          safeMessageActivity();
          return;
        }
        const result = (response?.result ?? response) as Record<string, unknown>;
        const turn = (result?.turn ?? response?.turn ?? null) as
          | Record<string, unknown>
          | null;
        const turnId = asString(turn?.id ?? "");
        if (!turnId) {
          markProcessing(threadId, false);
          setActiveTurnId(threadId, null);
          pushThreadErrorMessage(threadId, "回合启动失败。");
          safeMessageActivity();
          return;
        }
        setActiveTurnId(threadId, turnId);
      } catch (error) {
        markProcessing(threadId, false);
        setActiveTurnId(threadId, null);
        onDebug?.({
          id: `${Date.now()}-client-turn-start-error`,
          timestamp: Date.now(),
          source: "error",
          label: "turn/start error",
          payload: error instanceof Error ? error.message : String(error),
        });
        pushThreadErrorMessage(
          threadId,
          error instanceof Error ? error.message : String(error),
        );
        safeMessageActivity();
      }
    },
    [
      accessMode,
      collaborationMode,
      customPrompts,
      dispatch,
      effort,
      getCustomName,
      markProcessing,
      model,
      onDebug,
      pushThreadErrorMessage,
      recordThreadActivity,
      safeMessageActivity,
      setActiveTurnId,
      steerEnabled,
      threadStatusById,
    ],
  );

  const sendUserMessage = useCallback(
    async (text: string, images: string[] = []) => {
      if (!activeWorkspace) {
        return;
      }
      const messageText = text.trim();
      if (!messageText && images.length === 0) {
        return;
      }
      const promptExpansion = expandCustomPromptText(messageText, customPrompts);
      if (promptExpansion && "error" in promptExpansion) {
        if (activeThreadId) {
          pushThreadErrorMessage(activeThreadId, promptExpansion.error);
          safeMessageActivity();
        } else {
          onDebug?.({
            id: `${Date.now()}-client-prompt-expand-error`,
            timestamp: Date.now(),
            source: "error",
            label: "prompt/expand error",
            payload: promptExpansion.error,
          });
        }
        return;
      }
      const finalText = promptExpansion?.expanded ?? messageText;
      const threadId = await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return;
      }
      await sendMessageToThread(activeWorkspace, threadId, finalText, images, {
        skipPromptExpansion: true,
      });
    },
    [
      activeThreadId,
      activeWorkspace,
      customPrompts,
      ensureThreadForActiveWorkspace,
      onDebug,
      pushThreadErrorMessage,
      safeMessageActivity,
      sendMessageToThread,
    ],
  );

  const sendUserMessageToThread = useCallback(
    async (
      workspace: WorkspaceInfo,
      threadId: string,
      text: string,
      images: string[] = [],
      options?: SendMessageOptions,
    ) => {
      await sendMessageToThread(workspace, threadId, text, images, options);
    },
    [sendMessageToThread],
  );

  const interruptTurn = useCallback(async () => {
    if (!activeWorkspace || !activeThreadId) {
      return;
    }
    const activeTurnId = activeTurnIdByThread[activeThreadId] ?? null;
    const turnId = activeTurnId ?? "pending";
    markProcessing(activeThreadId, false);
    setActiveTurnId(activeThreadId, null);
    dispatch({
      type: "addAssistantMessage",
      threadId: activeThreadId,
      text: "会话已停止。",
    });
    if (!activeTurnId) {
      pendingInterruptsRef.current.add(activeThreadId);
    }
    onDebug?.({
      id: `${Date.now()}-client-turn-interrupt`,
      timestamp: Date.now(),
      source: "client",
      label: "turn/interrupt",
      payload: {
        workspaceId: activeWorkspace.id,
        threadId: activeThreadId,
        turnId,
        queued: !activeTurnId,
      },
    });
    try {
      const response = await interruptTurnService(
        activeWorkspace.id,
        activeThreadId,
        turnId,
      );
      onDebug?.({
        id: `${Date.now()}-server-turn-interrupt`,
        timestamp: Date.now(),
        source: "server",
        label: "turn/interrupt response",
        payload: response,
      });
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-turn-interrupt-error`,
        timestamp: Date.now(),
        source: "error",
        label: "turn/interrupt error",
        payload: error instanceof Error ? error.message : String(error),
      });
    }
  }, [
    activeThreadId,
    activeTurnIdByThread,
    activeWorkspace,
    dispatch,
    markProcessing,
    onDebug,
    pendingInterruptsRef,
    setActiveTurnId,
  ]);

  const startReviewTarget = useCallback(
    async (target: ReviewTarget, workspaceIdOverride?: string): Promise<boolean> => {
      const workspaceId = workspaceIdOverride ?? activeWorkspace?.id ?? null;
      if (!workspaceId) {
        return false;
      }
      const threadId = workspaceIdOverride
        ? await ensureThreadForWorkspace(workspaceId)
        : await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return false;
      }

      markProcessing(threadId, true);
      markReviewing(threadId, true);
      safeMessageActivity();
      onDebug?.({
        id: `${Date.now()}-client-review-start`,
        timestamp: Date.now(),
        source: "client",
        label: "review/start",
        payload: {
          workspaceId,
          threadId,
          target,
        },
      });
      try {
        const response = await startReviewService(
          workspaceId,
          threadId,
          target,
          reviewDeliveryMode,
        );
        onDebug?.({
          id: `${Date.now()}-server-review-start`,
          timestamp: Date.now(),
          source: "server",
          label: "review/start response",
          payload: response,
        });
        const rpcError = extractRpcErrorMessage(response);
        if (rpcError) {
          markProcessing(threadId, false);
          markReviewing(threadId, false);
          setActiveTurnId(threadId, null);
          pushThreadErrorMessage(threadId, `评审启动失败：${rpcError}`);
          safeMessageActivity();
          return false;
        }
        const reviewThreadId = extractReviewThreadId(response);
        if (reviewThreadId && reviewThreadId !== threadId) {
          updateThreadParent(threadId, [reviewThreadId]);
        }
        return true;
      } catch (error) {
        markProcessing(threadId, false);
        markReviewing(threadId, false);
        onDebug?.({
          id: `${Date.now()}-client-review-start-error`,
          timestamp: Date.now(),
          source: "error",
          label: "review/start error",
          payload: error instanceof Error ? error.message : String(error),
        });
        pushThreadErrorMessage(
          threadId,
          error instanceof Error ? error.message : String(error),
        );
        safeMessageActivity();
        return false;
      }
    },
    [
      activeWorkspace,
      ensureThreadForActiveWorkspace,
      ensureThreadForWorkspace,
      markProcessing,
      markReviewing,
      onDebug,
      pushThreadErrorMessage,
      safeMessageActivity,
      setActiveTurnId,
      reviewDeliveryMode,
      updateThreadParent,
    ],
  );

  const {
    reviewPrompt,
    openReviewPrompt,
    closeReviewPrompt,
    showPresetStep,
    choosePreset,
    highlightedPresetIndex,
    setHighlightedPresetIndex,
    highlightedBranchIndex,
    setHighlightedBranchIndex,
    highlightedCommitIndex,
    setHighlightedCommitIndex,
    handleReviewPromptKeyDown,
    confirmBranch,
    selectBranch,
    selectBranchAtIndex,
    selectCommit,
    selectCommitAtIndex,
    confirmCommit,
    updateCustomInstructions,
    confirmCustom,
  } = useReviewPrompt({
    activeWorkspace,
    activeThreadId,
    onDebug,
    startReviewTarget,
  });

  const startReview = useCallback(
    async (text: string) => {
      if (!activeWorkspace || !text.trim()) {
        return;
      }
      const trimmed = text.trim();
      const rest = trimmed.replace(/^\/review\b/i, "").trim();
      if (!rest) {
        openReviewPrompt();
        return;
      }

      const target = parseReviewTarget(trimmed);
      await startReviewTarget(target);
    },
    [
      activeWorkspace,
      openReviewPrompt,
      startReviewTarget,
    ],
  );

  const startStatus = useCallback(
    async (_text: string) => {
      if (!activeWorkspace) {
        return;
      }
      const threadId = await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return;
      }

      const rateLimits = rateLimitsByWorkspace[activeWorkspace.id] ?? null;
      const primaryUsed = rateLimits?.primary?.usedPercent;
      const secondaryUsed = rateLimits?.secondary?.usedPercent;
      const primaryReset = rateLimits?.primary?.resetsAt;
      const secondaryReset = rateLimits?.secondary?.resetsAt;
      const credits = rateLimits?.credits ?? null;

      const normalizeReset = (value?: number | null) => {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          return null;
        }
        return value > 1_000_000_000_000 ? value : value * 1000;
      };

      const resetLabel = (value?: number | null) => {
        const resetAt = normalizeReset(value);
        return resetAt ? formatRelativeTime(resetAt) : null;
      };

      const collabId =
        collaborationMode &&
        typeof collaborationMode === "object" &&
        "settings" in collaborationMode &&
        collaborationMode.settings &&
        typeof collaborationMode.settings === "object" &&
        "id" in collaborationMode.settings
          ? String(collaborationMode.settings.id ?? "")
          : "";

      const lines = [
        "会话状态：",
        `- 模型：${model ?? "default"}`,
        `- 推理强度：${effort ?? "default"}`,
        `- 访问权限：${accessMode ?? "current"}`,
        `- 协作模式：${collabId || "off"}`,
      ];

      if (typeof primaryUsed === "number") {
        const reset = resetLabel(primaryReset);
        lines.push(
          `- 会话用量：${Math.round(primaryUsed)}%${
            reset ? `（${reset}重置）` : ""
          }`,
        );
      }
      if (typeof secondaryUsed === "number") {
        const reset = resetLabel(secondaryReset);
        lines.push(
          `- 每周用量：${Math.round(secondaryUsed)}%${
            reset ? `（${reset}重置）` : ""
          }`,
        );
      }
      if (credits?.hasCredits) {
        if (credits.unlimited) {
          lines.push("- 额度：无限");
        } else if (credits.balance) {
          lines.push(`- 额度：${credits.balance}`);
        }
      }

      const timestamp = Date.now();
      recordThreadActivity(activeWorkspace.id, threadId, timestamp);
      dispatch({
        type: "addAssistantMessage",
        threadId,
        text: lines.join("\n"),
      });
      safeMessageActivity();
    },
    [
      accessMode,
      activeWorkspace,
      collaborationMode,
      dispatch,
      effort,
      ensureThreadForActiveWorkspace,
      model,
      rateLimitsByWorkspace,
      recordThreadActivity,
      safeMessageActivity,
    ],
  );

  const startMcp = useCallback(
    async (_text: string) => {
      if (!activeWorkspace) {
        return;
      }
      const threadId = await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return;
      }

      try {
        const response = (await listMcpServerStatusService(
          activeWorkspace.id,
          null,
          null,
        )) as Record<string, unknown> | null;
        const result = (response?.result ?? response) as
          | Record<string, unknown>
          | null;
        const data = Array.isArray(result?.data)
          ? (result?.data as Array<Record<string, unknown>>)
          : [];

        const lines: string[] = ["MCP 工具："];
        if (data.length === 0) {
          lines.push("- 未配置 MCP 服务器。");
        } else {
          const servers = [...data].sort((a, b) =>
            String(a.name ?? "").localeCompare(String(b.name ?? "")),
          );
          for (const server of servers) {
            const name = String(server.name ?? "未知");
            const authStatus = server.authStatus ?? server.auth_status ?? null;
            const authLabel =
              typeof authStatus === "string"
                ? authStatus
                : authStatus &&
                    typeof authStatus === "object" &&
                    "status" in authStatus
                  ? String((authStatus as { status?: unknown }).status ?? "")
                  : "";
            lines.push(`- ${name}${authLabel ? `（认证：${authLabel}）` : ""}`);

            const toolsRecord =
              server.tools && typeof server.tools === "object"
                ? (server.tools as Record<string, unknown>)
                : {};
            const prefix = `mcp__${name}__`;
            const toolNames = Object.keys(toolsRecord)
              .map((toolName) =>
                toolName.startsWith(prefix)
                  ? toolName.slice(prefix.length)
                  : toolName,
              )
              .sort((a, b) => a.localeCompare(b));
            lines.push(
              toolNames.length > 0
                ? `  工具：${toolNames.join(", ")}`
                : "  工具：无",
            );

            const resources = Array.isArray(server.resources)
              ? server.resources.length
              : 0;
            const templates = Array.isArray(server.resourceTemplates)
              ? server.resourceTemplates.length
              : Array.isArray(server.resource_templates)
                ? server.resource_templates.length
                : 0;
            if (resources > 0 || templates > 0) {
              lines.push(`  资源：${resources}，模板：${templates}`);
            }
          }
        }

        const timestamp = Date.now();
        recordThreadActivity(activeWorkspace.id, threadId, timestamp);
        dispatch({
          type: "addAssistantMessage",
          threadId,
          text: lines.join("\n"),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "无法加载 MCP 状态。";
        dispatch({
          type: "addAssistantMessage",
          threadId,
          text: `MCP 工具：\n- ${message}`,
        });
      } finally {
        safeMessageActivity();
      }
    },
    [
      activeWorkspace,
      dispatch,
      ensureThreadForActiveWorkspace,
      recordThreadActivity,
      safeMessageActivity,
    ],
  );

  const startApps = useCallback(
    async (_text: string) => {
      if (!activeWorkspace) {
        return;
      }
      const threadId = await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return;
      }

      try {
        const response = (await getAppsListService(
          activeWorkspace.id,
          null,
          100,
        )) as Record<string, unknown> | null;
        const result = (response?.result ?? response) as
          | Record<string, unknown>
          | null;
        const data = Array.isArray(result?.data)
          ? (result?.data as Array<Record<string, unknown>>)
          : [];

        const lines: string[] = ["应用："];
        if (data.length === 0) {
          lines.push("- 没有可用应用。");
        } else {
          const apps = [...data].sort((a, b) =>
            String(a.name ?? "").localeCompare(String(b.name ?? "")),
          );
          for (const app of apps) {
            const name = String(app.name ?? app.id ?? "未知");
            const appId = String(app.id ?? "");
            const isAccessible = Boolean(
              app.isAccessible ?? app.is_accessible ?? false,
            );
            const status = isAccessible ? "已连接" : "可安装";
            const description =
              typeof app.description === "string" && app.description.trim().length > 0
                ? app.description.trim()
                : "";
            lines.push(
              `- ${name}${appId ? ` (${appId})` : ""} — ${status}${description ? `：${description}` : ""}`,
            );

            const installUrl =
              typeof app.installUrl === "string"
                ? app.installUrl
                : typeof app.install_url === "string"
                  ? app.install_url
                  : "";
            if (!isAccessible && installUrl) {
              lines.push(`  安装：${installUrl}`);
            }
          }
        }

        const timestamp = Date.now();
        recordThreadActivity(activeWorkspace.id, threadId, timestamp);
        dispatch({
          type: "addAssistantMessage",
          threadId,
          text: lines.join("\n"),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "无法加载应用列表。";
        dispatch({
          type: "addAssistantMessage",
          threadId,
          text: `应用：\n- ${message}`,
        });
      } finally {
        safeMessageActivity();
      }
    },
    [
      activeWorkspace,
      dispatch,
      ensureThreadForActiveWorkspace,
      recordThreadActivity,
      safeMessageActivity,
    ],
  );

  const startFork = useCallback(
    async (text: string) => {
      if (!activeWorkspace || !activeThreadId) {
        return;
      }
      const trimmed = text.trim();
      const rest = trimmed.replace(/^\/fork\b/i, "").trim();
      const threadId = await forkThreadForWorkspace(activeWorkspace.id, activeThreadId);
      if (!threadId) {
        return;
      }
      updateThreadParent(activeThreadId, [threadId]);
      if (rest) {
        await sendMessageToThread(activeWorkspace, threadId, rest, []);
      }
    },
    [
      activeThreadId,
      activeWorkspace,
      forkThreadForWorkspace,
      sendMessageToThread,
      updateThreadParent,
    ],
  );

  const startResume = useCallback(
    async (_text: string) => {
      if (!activeWorkspace) {
        return;
      }
      if (activeThreadId && threadStatusById[activeThreadId]?.isProcessing) {
        return;
      }
      const threadId = activeThreadId ?? (await ensureThreadForActiveWorkspace());
      if (!threadId) {
        return;
      }
      await refreshThread(activeWorkspace.id, threadId);
      safeMessageActivity();
    },
    [
      activeThreadId,
      activeWorkspace,
      ensureThreadForActiveWorkspace,
      refreshThread,
      safeMessageActivity,
      threadStatusById,
    ],
  );

  const startCompact = useCallback(
    async (_text: string) => {
      if (!activeWorkspace) {
        return;
      }
      const threadId = activeThreadId ?? (await ensureThreadForActiveWorkspace());
      if (!threadId) {
        return;
      }
      try {
        await compactThreadService(activeWorkspace.id, threadId);
      } catch (error) {
        pushThreadErrorMessage(
          threadId,
          error instanceof Error
            ? error.message
            : "无法开始上下文压缩。",
        );
      } finally {
        safeMessageActivity();
      }
    },
    [
      activeThreadId,
      activeWorkspace,
      ensureThreadForActiveWorkspace,
      pushThreadErrorMessage,
      safeMessageActivity,
    ],
  );

  return {
    interruptTurn,
    sendUserMessage,
    sendUserMessageToThread,
    startFork,
    startReview,
    startResume,
    startCompact,
    startApps,
    startMcp,
    startStatus,
    reviewPrompt,
    openReviewPrompt,
    closeReviewPrompt,
    showPresetStep,
    choosePreset,
    highlightedPresetIndex,
    setHighlightedPresetIndex,
    highlightedBranchIndex,
    setHighlightedBranchIndex,
    highlightedCommitIndex,
    setHighlightedCommitIndex,
    handleReviewPromptKeyDown,
    confirmBranch,
    selectBranch,
    selectBranchAtIndex,
    selectCommit,
    selectCommitAtIndex,
    confirmCommit,
    updateCustomInstructions,
    confirmCustom,
  };
}
