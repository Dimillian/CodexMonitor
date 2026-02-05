// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApprovalRequest,
  RequestUserInputRequest,
} from "../../../types";
import { sendNotification } from "../../../services/tauri";
import { useAgentResponseRequiredNotifications } from "./useAgentResponseRequiredNotifications";

const useAppServerEventsMock = vi.fn();

vi.mock("../../../services/tauri", () => ({
  sendNotification: vi.fn(),
}));

vi.mock("../../app/hooks/useAppServerEvents", () => ({
  useAppServerEvents: (handlers: unknown) => useAppServerEventsMock(handlers),
}));

describe("useAgentResponseRequiredNotifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(sendNotification).mockReset();
    vi.mocked(sendNotification).mockResolvedValue();
    useAppServerEventsMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("retries throttled response-required question notifications", async () => {
    const approvals: ApprovalRequest[] = [
      {
        workspace_id: "ws-1",
        request_id: 1,
        method: "workspace/requestApproval",
        params: { command: "npm run lint" },
      },
    ];
    const userInputRequests: RequestUserInputRequest[] = [
      {
        workspace_id: "ws-1",
        request_id: 2,
        params: {
          thread_id: "thread-1",
          turn_id: "turn-1",
          item_id: "item-1",
          questions: [
            {
              id: "question-1",
              header: "Need input",
              question: "Pick one",
              options: [{ label: "A", description: "Option A" }],
            },
          ],
        },
      },
    ];

    renderHook(() =>
      useAgentResponseRequiredNotifications({
        enabled: true,
        isWindowFocused: false,
        approvals,
        userInputRequests,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendNotification).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendNotification).mock.calls[1]?.[2]).toMatchObject({
      extra: { type: "question" },
    });
  });

  it("notifies each pending approval request without suppressing older ones", async () => {
    const approvals: ApprovalRequest[] = [
      {
        workspace_id: "ws-1",
        request_id: 1,
        method: "workspace/requestApproval",
        params: { command: "npm run lint" },
      },
      {
        workspace_id: "ws-1",
        request_id: 2,
        method: "workspace/requestApproval",
        params: { command: "npm run test" },
      },
    ];

    renderHook(() =>
      useAgentResponseRequiredNotifications({
        enabled: true,
        isWindowFocused: false,
        approvals,
        userInputRequests: [],
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendNotification).mock.calls[0]?.[2]).toMatchObject({
      extra: { type: "approval", requestId: 2 },
    });

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendNotification).mock.calls[1]?.[2]).toMatchObject({
      extra: { type: "approval", requestId: 1 },
    });
  });

  it("notifies each pending question request without suppressing older ones", async () => {
    const userInputRequests: RequestUserInputRequest[] = [
      {
        workspace_id: "ws-1",
        request_id: 10,
        params: {
          thread_id: "thread-1",
          turn_id: "turn-1",
          item_id: "item-1",
          questions: [{ id: "q-1", header: "Question one", question: "Choose one" }],
        },
      },
      {
        workspace_id: "ws-1",
        request_id: 11,
        params: {
          thread_id: "thread-1",
          turn_id: "turn-2",
          item_id: "item-2",
          questions: [{ id: "q-2", header: "Question two", question: "Choose two" }],
        },
      },
    ];

    renderHook(() =>
      useAgentResponseRequiredNotifications({
        enabled: true,
        isWindowFocused: false,
        approvals: [],
        userInputRequests,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendNotification).mock.calls[0]?.[2]).toMatchObject({
      extra: { type: "question", requestId: 11 },
    });

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendNotification).mock.calls[1]?.[2]).toMatchObject({
      extra: { type: "question", requestId: 10 },
    });
  });

  it("queues plan notifications that arrive inside the throttle window", async () => {
    renderHook(() =>
      useAgentResponseRequiredNotifications({
        enabled: true,
        isWindowFocused: false,
        approvals: [],
        userInputRequests: [],
      }),
    );

    const lastCall = useAppServerEventsMock.mock.calls[
      useAppServerEventsMock.mock.calls.length - 1
    ];
    const handlers = lastCall?.[0] as {
      onItemCompleted?: (
        workspaceId: string,
        threadId: string,
        item: Record<string, unknown>,
      ) => void;
    };
    expect(typeof handlers?.onItemCompleted).toBe("function");

    act(() => {
      handlers.onItemCompleted?.("ws-1", "thread-1", {
        id: "plan-1",
        type: "plan",
        status: "completed",
        text: "First plan",
      });
      handlers.onItemCompleted?.("ws-1", "thread-1", {
        id: "plan-2",
        type: "plan",
        status: "completed",
        text: "Second plan",
      });
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendNotification).mock.calls[0]?.[2]).toMatchObject({
      extra: { type: "plan", itemId: "plan-1" },
    });

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendNotification).mock.calls[1]?.[2]).toMatchObject({
      extra: { type: "plan", itemId: "plan-2" },
    });
  });

  it("notifies again when an approval request ID is reused after resolution", async () => {
    const firstApproval: ApprovalRequest = {
      workspace_id: "ws-1",
      request_id: 1,
      method: "workspace/requestApproval",
      params: { command: "npm run lint" },
    };

    const { rerender } = renderHook(
      ({ approvals }) =>
        useAgentResponseRequiredNotifications({
          enabled: true,
          isWindowFocused: false,
          approvals,
          userInputRequests: [],
        }),
      { initialProps: { approvals: [firstApproval] as ApprovalRequest[] } },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendNotification).toHaveBeenCalledTimes(1);

    rerender({ approvals: [] as ApprovalRequest[] });
    await act(async () => {
      await Promise.resolve();
    });

    const reusedApproval: ApprovalRequest = {
      ...firstApproval,
      params: { command: "npm run test" },
    };
    rerender({ approvals: [reusedApproval] as ApprovalRequest[] });

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendNotification).mock.calls[1]?.[2]).toMatchObject({
      extra: { type: "approval", requestId: 1 },
    });
  });

  it("notifies again when a question request ID is reused after resolution", async () => {
    const firstQuestion: RequestUserInputRequest = {
      workspace_id: "ws-1",
      request_id: 1,
      params: {
        thread_id: "thread-1",
        turn_id: "turn-1",
        item_id: "item-1",
        questions: [{ id: "q-1", header: "Question one", question: "Choose one" }],
      },
    };

    const { rerender } = renderHook(
      ({ userInputRequests }) =>
        useAgentResponseRequiredNotifications({
          enabled: true,
          isWindowFocused: false,
          approvals: [],
          userInputRequests,
        }),
      {
        initialProps: {
          userInputRequests: [firstQuestion] as RequestUserInputRequest[],
        },
      },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendNotification).toHaveBeenCalledTimes(1);

    rerender({ userInputRequests: [] as RequestUserInputRequest[] });
    await act(async () => {
      await Promise.resolve();
    });

    const reusedQuestion: RequestUserInputRequest = {
      ...firstQuestion,
      params: {
        ...firstQuestion.params,
        item_id: "item-2",
        questions: [{ id: "q-2", header: "Question two", question: "Choose two" }],
      },
    };
    rerender({ userInputRequests: [reusedQuestion] as RequestUserInputRequest[] });

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendNotification).mock.calls[1]?.[2]).toMatchObject({
      extra: { type: "question", requestId: 1 },
    });
  });
});
