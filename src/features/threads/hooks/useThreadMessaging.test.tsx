/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/react";
import {
  sendUserMessage as sendUserMessageService,
  steerTurn as steerTurnService,
  startReview as startReviewService,
  interruptTurn as interruptTurnService,
  getAppsList as getAppsListService,
  listMcpServerStatus as listMcpServerStatusService,
  compactThread as compactThreadService,
} from "@services/tauri";
import type { WorkspaceInfo } from "@/types";
import { useThreadMessaging } from "./useThreadMessaging";

vi.mock("@sentry/react", () => ({
  metrics: {
    count: vi.fn(),
  },
}));

vi.mock("@services/tauri", () => ({
  sendUserMessage: vi.fn(),
  steerTurn: vi.fn(),
  startReview: vi.fn(),
  interruptTurn: vi.fn(),
  getAppsList: vi.fn(),
  listMcpServerStatus: vi.fn(),
  compactThread: vi.fn(),
}));

vi.mock("./useReviewPrompt", () => ({
  useReviewPrompt: () => ({
    reviewPrompt: null,
    openReviewPrompt: vi.fn(),
    closeReviewPrompt: vi.fn(),
    showPresetStep: vi.fn(),
    choosePreset: vi.fn(),
    highlightedPresetIndex: 0,
    setHighlightedPresetIndex: vi.fn(),
    highlightedBranchIndex: 0,
    setHighlightedBranchIndex: vi.fn(),
    highlightedCommitIndex: 0,
    setHighlightedCommitIndex: vi.fn(),
    handleReviewPromptKeyDown: vi.fn(() => false),
    confirmBranch: vi.fn(),
    selectBranch: vi.fn(),
    selectBranchAtIndex: vi.fn(),
    selectCommit: vi.fn(),
    selectCommitAtIndex: vi.fn(),
    confirmCommit: vi.fn(),
    updateCustomInstructions: vi.fn(),
    confirmCustom: vi.fn(),
  }),
}));

describe("useThreadMessaging telemetry", () => {
  const workspace: WorkspaceInfo = {
    id: "ws-1",
    name: "Workspace",
    path: "/tmp/workspace",
    connected: true,
    settings: {
      sidebarCollapsed: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendUserMessageService).mockResolvedValue({
      result: {
        turn: { id: "turn-1" },
      },
    } as unknown as Awaited<ReturnType<typeof sendUserMessageService>>);
    vi.mocked(steerTurnService).mockResolvedValue(
      {
        result: {
          turnId: "turn-1",
        },
      } as unknown as Awaited<ReturnType<typeof steerTurnService>>,
    );
    vi.mocked(startReviewService).mockResolvedValue(
      {} as Awaited<ReturnType<typeof startReviewService>>,
    );
    vi.mocked(interruptTurnService).mockResolvedValue(
      {} as Awaited<ReturnType<typeof interruptTurnService>>,
    );
    vi.mocked(getAppsListService).mockResolvedValue(
      {} as Awaited<ReturnType<typeof getAppsListService>>,
    );
    vi.mocked(listMcpServerStatusService).mockResolvedValue(
      {} as Awaited<ReturnType<typeof listMcpServerStatusService>>,
    );
    vi.mocked(compactThreadService).mockResolvedValue(
      {} as Awaited<ReturnType<typeof compactThreadService>>,
    );
  });

  it("records prompt_sent once for one message send", async () => {
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: false,
        customPrompts: [],
        threadStatusById: {},
        activeTurnIdByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "hello",
        [],
      );
    });

    expect(Sentry.metrics.count).toHaveBeenCalledTimes(1);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      "prompt_sent",
      1,
      expect.objectContaining({
        attributes: expect.objectContaining({
          workspace_id: "ws-1",
          thread_id: "thread-1",
          has_images: "false",
          text_length: "5",
        }),
      }),
    );
  });

  it("forwards explicit app mentions to turn/start", async () => {
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: false,
        customPrompts: [],
        threadStatusById: {},
        activeTurnIdByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessage("hello $calendar", [], [
        { name: "Calendar App", path: "app://connector_calendar" },
      ]);
    });

    expect(sendUserMessageService).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "hello $calendar",
      expect.objectContaining({
        appMentions: [{ name: "Calendar App", path: "app://connector_calendar" }],
      }),
    );
  });

  it("uses turn/steer when steer mode is enabled and an active turn is present", async () => {
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: true,
        customPrompts: [],
        threadStatusById: {
          "thread-1": {
            isProcessing: true,
            isReviewing: false,
            hasUnread: false,
            processingStartedAt: 0,
            lastDurationMs: null,
          },
        },
        activeTurnIdByThread: {
          "thread-1": "turn-1",
        },
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "steer this",
        [],
      );
    });

    expect(steerTurnService).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "turn-1",
      "steer this",
      [],
    );
    expect(sendUserMessageService).not.toHaveBeenCalled();
  });

  it("falls back to turn/start when turn/steer is unsupported and remembers fallback", async () => {
    vi.mocked(steerTurnService).mockResolvedValueOnce({
      error: {
        message:
          "Invalid request: unknown variant `turn/steer`, expected one of `turn/start`, `turn/interrupt`",
      },
    } as unknown as Awaited<ReturnType<typeof steerTurnService>>);

    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: true,
        customPrompts: [],
        threadStatusById: {
          "thread-1": {
            isProcessing: true,
            isReviewing: false,
            hasUnread: false,
            processingStartedAt: 0,
            lastDurationMs: null,
          },
        },
        activeTurnIdByThread: {
          "thread-1": "turn-1",
        },
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "fallback once",
        [],
      );
    });
    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "fallback twice",
        [],
      );
    });

    expect(steerTurnService).toHaveBeenCalledTimes(1);
    expect(sendUserMessageService).toHaveBeenCalledTimes(2);
    expect(sendUserMessageService).toHaveBeenNthCalledWith(
      1,
      "ws-1",
      "thread-1",
      "fallback once",
      expect.any(Object),
    );
    expect(sendUserMessageService).toHaveBeenNthCalledWith(
      2,
      "ws-1",
      "thread-1",
      "fallback twice",
      expect.any(Object),
    );
  });

  it("falls back to turn/start when remote reports unknown method turn_steer", async () => {
    vi.mocked(steerTurnService).mockRejectedValueOnce(
      new Error("unknown method: turn_steer"),
    );

    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: true,
        customPrompts: [],
        threadStatusById: {
          "thread-1": {
            isProcessing: true,
            isReviewing: false,
            hasUnread: false,
            processingStartedAt: 0,
            lastDurationMs: null,
          },
        },
        activeTurnIdByThread: {
          "thread-1": "turn-1",
        },
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "fallback remote method",
        [],
      );
    });

    expect(steerTurnService).toHaveBeenCalledTimes(1);
    expect(sendUserMessageService).toHaveBeenCalledTimes(1);
    expect(sendUserMessageService).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "fallback remote method",
      expect.any(Object),
    );
  });
});
