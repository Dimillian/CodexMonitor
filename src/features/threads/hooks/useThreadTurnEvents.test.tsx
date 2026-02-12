// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnPlan } from "@/types";
import { interruptTurn } from "@services/tauri";
import {
  normalizePlanUpdate,
  normalizeRateLimits,
  normalizeTokenUsage,
} from "@threads/utils/threadNormalize";
import { useThreadTurnEvents } from "./useThreadTurnEvents";

vi.mock("@services/tauri", () => ({
  interruptTurn: vi.fn(),
}));

vi.mock("@threads/utils/threadNormalize", () => ({
  asString: (value: unknown) =>
    typeof value === "string" ? value : value ? String(value) : "",
  normalizePlanUpdate: vi.fn(),
  normalizeRateLimits: vi.fn(),
  normalizeTokenUsage: vi.fn(),
}));

type SetupOverrides = {
  pendingInterrupts?: string[];
  planByThread?: Record<string, TurnPlan | null>;
};

const makeOptions = (overrides: SetupOverrides = {}) => {
  const dispatch = vi.fn();
  const getCustomName = vi.fn();
  const isThreadHidden = vi.fn(() => false);
  const markProcessing = vi.fn();
  const markReviewing = vi.fn();
  const setActiveTurnId = vi.fn();
  const pushThreadErrorMessage = vi.fn();
  const safeMessageActivity = vi.fn();
  const recordThreadActivity = vi.fn();
  const pendingInterruptsRef = {
    current: new Set(overrides.pendingInterrupts ?? []),
  };
  const planByThreadRef = {
    current: overrides.planByThread ?? {},
  };

  const { result } = renderHook(() =>
    useThreadTurnEvents({
      dispatch,
      planByThreadRef,
      getCustomName,
      isThreadHidden,
      markProcessing,
      markReviewing,
      setActiveTurnId,
      pendingInterruptsRef,
      pushThreadErrorMessage,
      safeMessageActivity,
      recordThreadActivity,
    }),
  );

  return {
    result,
    dispatch,
    getCustomName,
    isThreadHidden,
    markProcessing,
    markReviewing,
    setActiveTurnId,
    pushThreadErrorMessage,
    safeMessageActivity,
    recordThreadActivity,
    pendingInterruptsRef,
    planByThreadRef,
  };
};

describe("useThreadTurnEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts thread summaries when a thread starts", () => {
    const { result, dispatch, recordThreadActivity, safeMessageActivity } =
      makeOptions();

    act(() => {
      result.current.onThreadStarted("ws-1", {
        id: "thread-1",
        preview: "A brand new thread",
        updatedAt: 1_700_000_000_000,
      });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadTimestamp",
      workspaceId: "ws-1",
      threadId: "thread-1",
      timestamp: 1_700_000_000_000,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadName",
      workspaceId: "ws-1",
      threadId: "thread-1",
      name: "A brand new thread",
    });
    expect(recordThreadActivity).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      1_700_000_000_000,
    );
    expect(safeMessageActivity).toHaveBeenCalled();
  });

  it("does not override custom thread names on thread started", () => {
    const { result, dispatch, getCustomName } = makeOptions();
    getCustomName.mockReturnValue("Custom name");

    act(() => {
      result.current.onThreadStarted("ws-1", {
        id: "thread-2",
        preview: "Preview text",
        updatedAt: 1_700_000_000_100,
      });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-2",
    });
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "setThreadName",
        workspaceId: "ws-1",
        threadId: "thread-2",
      }),
    );
  });

  it("ignores thread started events for hidden threads", () => {
    const { result, dispatch, isThreadHidden, recordThreadActivity, safeMessageActivity } =
      makeOptions();
    isThreadHidden.mockReturnValue(true);

    act(() => {
      result.current.onThreadStarted("ws-1", {
        id: "thread-hidden",
        preview: "Hidden thread",
        updatedAt: 1_700_000_000_200,
      });
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(recordThreadActivity).not.toHaveBeenCalled();
    expect(safeMessageActivity).not.toHaveBeenCalled();
  });

  it("applies thread name updates when no custom name exists", () => {
    const { result, dispatch, getCustomName } = makeOptions();
    getCustomName.mockReturnValue(undefined);

    act(() => {
      result.current.onThreadNameUpdated("ws-1", {
        threadId: "thread-3",
        threadName: "Server Rename",
      });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadName",
      workspaceId: "ws-1",
      threadId: "thread-3",
      name: "Server Rename",
    });
  });

  it("does not override custom thread names on thread name updated", () => {
    const { result, dispatch, getCustomName } = makeOptions();
    getCustomName.mockReturnValue("Custom Name");

    act(() => {
      result.current.onThreadNameUpdated("ws-1", {
        threadId: "thread-3",
        threadName: "Server Rename",
      });
    });

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "setThreadName",
        workspaceId: "ws-1",
        threadId: "thread-3",
      }),
    );
  });

  it("marks processing and active turn on turn started", () => {
    const { result, dispatch, markProcessing, setActiveTurnId } = makeOptions();

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(markProcessing).toHaveBeenCalledWith("thread-1", true);
    expect(setActiveTurnId).toHaveBeenCalledWith("thread-1", "turn-1");
    expect(interruptTurn).not.toHaveBeenCalled();
  });

  it("interrupts immediately when a pending interrupt is queued", () => {
    const { result, markProcessing, setActiveTurnId, pendingInterruptsRef } =
      makeOptions({ pendingInterrupts: ["thread-1"] });
    vi.mocked(interruptTurn).mockResolvedValue({});

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-2");
    });

    expect(pendingInterruptsRef.current.has("thread-1")).toBe(false);
    expect(interruptTurn).toHaveBeenCalledWith("ws-1", "thread-1", "turn-2");
    expect(markProcessing).not.toHaveBeenCalled();
    expect(setActiveTurnId).not.toHaveBeenCalled();
  });

  it("clears pending interrupt and active turn on turn completed", () => {
    const { result, markProcessing, setActiveTurnId, pendingInterruptsRef } =
      makeOptions({ pendingInterrupts: ["thread-1"] });

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    expect(markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(setActiveTurnId).toHaveBeenCalledWith("thread-1", null);
    expect(pendingInterruptsRef.current.has("thread-1")).toBe(false);
  });

  it("clears the active plan when all plan steps are completed", () => {
    const { result, dispatch } = makeOptions({
      planByThread: {
        "thread-1": {
          turnId: "turn-1",
          explanation: "Done",
          steps: [{ step: "Finish task", status: "completed" }],
        },
      },
    });

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "clearThreadPlan",
      threadId: "thread-1",
    });
  });

  it("does not clear a completed plan for a different turn", () => {
    const { result, dispatch } = makeOptions({
      planByThread: {
        "thread-1": {
          turnId: "turn-2",
          explanation: "Done",
          steps: [{ step: "Finish task", status: "completed" }],
        },
      },
    });

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    expect(dispatch).not.toHaveBeenCalledWith({
      type: "clearThreadPlan",
      threadId: "thread-1",
    });
  });

  it("keeps the active plan when at least one step is not completed", () => {
    const { result, dispatch } = makeOptions({
      planByThread: {
        "thread-1": {
          turnId: "turn-1",
          explanation: "Still working",
          steps: [
            { step: "Finish task", status: "completed" },
            { step: "Verify output", status: "inProgress" },
          ],
        },
      },
    });

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    expect(dispatch).not.toHaveBeenCalledWith({
      type: "clearThreadPlan",
      threadId: "thread-1",
    });
  });

  it("keeps onTurnCompleted stable while plan content changes", () => {
    const dispatch = vi.fn();
    const getCustomName = vi.fn();
    const isThreadHidden = vi.fn(() => false);
    const markProcessing = vi.fn();
    const markReviewing = vi.fn();
    const setActiveTurnId = vi.fn();
    const pushThreadErrorMessage = vi.fn();
    const safeMessageActivity = vi.fn();
    const recordThreadActivity = vi.fn();
    const pendingInterruptsRef = { current: new Set<string>() };
    const planByThreadRef = {
      current: {} as Record<string, TurnPlan | null>,
    };

    const { result, rerender } = renderHook(() =>
      useThreadTurnEvents({
        dispatch,
        planByThreadRef,
        getCustomName,
        isThreadHidden,
        markProcessing,
        markReviewing,
        setActiveTurnId,
        pendingInterruptsRef,
        pushThreadErrorMessage,
        safeMessageActivity,
        recordThreadActivity,
      }),
    );

    const originalHandler = result.current.onTurnCompleted;
    planByThreadRef.current = {
      "thread-1": {
        turnId: "turn-1",
        explanation: "Updated",
        steps: [{ step: "Done", status: "completed" }],
      },
    };
    rerender();

    expect(result.current.onTurnCompleted).toBe(originalHandler);
  });

  it("dispatches normalized plan updates", () => {
    const { result, dispatch } = makeOptions();
    const normalized = { id: "turn-3", steps: [] };

    vi.mocked(normalizePlanUpdate).mockReturnValue(normalized as never);

    act(() => {
      result.current.onTurnPlanUpdated("ws-1", "thread-1", "turn-3", {
        explanation: "Plan",
        plan: [{ id: "step-1" }],
      });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadPlan",
      threadId: "thread-1",
      plan: normalized,
    });
  });

  it("dispatches turn diff updates", () => {
    const { result, dispatch } = makeOptions();

    act(() => {
      result.current.onTurnDiffUpdated("ws-1", "thread-1", "diff --git a/file b/file");
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadTurnDiff",
      threadId: "thread-1",
      diff: "diff --git a/file b/file",
    });
  });

  it("dispatches normalized token usage updates", () => {
    const { result, dispatch } = makeOptions();
    const normalized = { total: 123 };

    vi.mocked(normalizeTokenUsage).mockReturnValue(normalized as never);

    act(() => {
      result.current.onThreadTokenUsageUpdated("ws-1", "thread-1", {
        total: 123,
      });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadTokenUsage",
      threadId: "thread-1",
      tokenUsage: normalized,
    });
  });

  it("dispatches normalized rate limits updates", () => {
    const { result, dispatch } = makeOptions();
    const normalized = { primary: { usedPercent: 10 } };

    vi.mocked(normalizeRateLimits).mockReturnValue(normalized as never);

    act(() => {
      result.current.onAccountRateLimitsUpdated("ws-1", { primary: {} });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setRateLimits",
      workspaceId: "ws-1",
      rateLimits: normalized,
    });
  });

  it("handles turn errors when retries are disabled", () => {
    const {
      result,
      dispatch,
      markProcessing,
      markReviewing,
      setActiveTurnId,
      pushThreadErrorMessage,
      safeMessageActivity,
    } = makeOptions();

    act(() => {
      result.current.onTurnError("ws-1", "thread-1", "turn-1", {
        message: "boom",
        willRetry: false,
      });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(markReviewing).toHaveBeenCalledWith("thread-1", false);
    expect(setActiveTurnId).toHaveBeenCalledWith("thread-1", null);
    expect(pushThreadErrorMessage).toHaveBeenCalledWith(
      "thread-1",
      "Turn failed: boom",
    );
    expect(safeMessageActivity).toHaveBeenCalled();
  });

  it("ignores turn errors that will retry", () => {
    const { result, dispatch, markProcessing } = makeOptions();

    act(() => {
      result.current.onTurnError("ws-1", "thread-1", "turn-1", {
        message: "boom",
        willRetry: true,
      });
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(markProcessing).not.toHaveBeenCalled();
  });

});
