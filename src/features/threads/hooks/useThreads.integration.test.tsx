// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import type { useAppServerEvents } from "../../app/hooks/useAppServerEvents";
import { useThreadRows } from "../../app/hooks/useThreadRows";
import { listThreads, resumeThread, sendUserMessage } from "../../../services/tauri";
import { useThreads } from "./useThreads";

type AppServerHandlers = Parameters<typeof useAppServerEvents>[0];

let handlers: AppServerHandlers | null = null;

vi.mock("../../app/hooks/useAppServerEvents", () => ({
  useAppServerEvents: (incoming: AppServerHandlers) => {
    handlers = incoming;
  },
}));

vi.mock("../../../services/tauri", () => ({
  respondToServerRequest: vi.fn(),
  rememberApprovalRule: vi.fn(),
  sendUserMessage: vi.fn(),
  startReview: vi.fn(),
  startThread: vi.fn(),
  listThreads: vi.fn(),
  resumeThread: vi.fn(),
  archiveThread: vi.fn(),
  getAccountRateLimits: vi.fn(),
  interruptTurn: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

describe("useThreads UX integration", () => {
  let now: number;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    handlers = null;
    localStorage.clear();
    vi.clearAllMocks();
    now = 1000;
    nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now++);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it("resumes selected threads, merges local deltas, and syncs unread/review/plan state", async () => {
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-1" } },
    });
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-2",
          preview: "Remote preview",
          updated_at: 9999,
          turns: [
            {
              items: [
                {
                  type: "userMessage",
                  id: "server-user-1",
                  content: [{ type: "text", text: "Hello" }],
                },
                {
                  type: "agentMessage",
                  id: "assistant-1",
                  text: "Hello world",
                },
                {
                  type: "enteredReviewMode",
                  id: "review-1",
                },
              ],
            },
          ],
        },
      },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    expect(handlers).not.toBeNull();

    act(() => {
      handlers?.onTurnStarted?.("ws-1", "thread-1", "turn-1");
      handlers?.onTurnStarted?.("ws-1", "thread-2", "turn-2");
    });

    await act(async () => {
      await result.current.sendUserMessageToThread(workspace, "thread-2", "Hello");
      await result.current.sendUserMessageToThread(workspace, "thread-2", "Hello");
    });

    act(() => {
      handlers?.onAgentMessageDelta?.({
        workspaceId: "ws-1",
        threadId: "thread-2",
        itemId: "assistant-1",
        delta: "Hello",
      });
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "thread-2",
        itemId: "assistant-final",
        text: "Other",
      });
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-2", "turn-2", {
        explanation: " Plan note ",
        plan: [{ step: "Do it", status: "in_progress" }],
      });
    });

    expect(result.current.threadStatusById["thread-2"]?.hasUnread).toBe(true);

    act(() => {
      result.current.setActiveThreadId("thread-2");
    });

    await waitFor(() => {
      expect(vi.mocked(resumeThread)).toHaveBeenCalledWith("ws-1", "thread-2");
    });

    await waitFor(() => {
      expect(result.current.threadStatusById["thread-2"]?.hasUnread).toBe(false);
      expect(result.current.threadStatusById["thread-2"]?.isReviewing).toBe(true);
    });
    expect(result.current.planByThread["thread-2"]).toEqual({
      turnId: "turn-2",
      explanation: "Plan note",
      steps: [{ step: "Do it", status: "inProgress" }],
    });

    const activeItems = result.current.activeItems;
    const userHelloMessages = activeItems.filter(
      (item) =>
        item.kind === "message" &&
        item.role === "user" &&
        item.text === "Hello",
    );
    expect(userHelloMessages).toHaveLength(2);

    const assistantMerged = activeItems.find(
      (item) =>
        item.kind === "message" &&
        item.role === "assistant" &&
        item.id === "assistant-1",
    );
    expect(assistantMerged?.kind).toBe("message");
    if (assistantMerged?.kind === "message") {
      expect(assistantMerged.text).toBe("Hello world");
    }
  });

  it("keeps the latest plan visible when a new turn starts", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: " Plan note ",
        plan: [{ step: "Do it", status: "in_progress" }],
      });
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-1",
      explanation: "Plan note",
      steps: [{ step: "Do it", status: "inProgress" }],
    });

    act(() => {
      handlers?.onTurnStarted?.("ws-1", "thread-1", "turn-2");
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-1",
      explanation: "Plan note",
      steps: [{ step: "Do it", status: "inProgress" }],
    });
  });

  it("clears empty plan updates to null", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: "   ",
        plan: [],
      });
    });

    expect(result.current.planByThread["thread-1"]).toBeNull();
  });

  it("normalizes plan step status values", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: "",
        plan: [
          { step: "Step 1", status: "in_progress" },
          { step: "Step 2", status: "in-progress" },
          { step: "Step 3", status: "in progress" },
          { step: "Step 4", status: "completed" },
          { step: "Step 5", status: "unknown" },
        ],
      });
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-1",
      explanation: null,
      steps: [
        { step: "Step 1", status: "inProgress" },
        { step: "Step 2", status: "inProgress" },
        { step: "Step 3", status: "inProgress" },
        { step: "Step 4", status: "completed" },
        { step: "Step 5", status: "pending" },
      ],
    });
  });

  it("replaces the plan when a new turn updates it", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: "First plan",
        plan: [{ step: "Step 1", status: "pending" }],
      });
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-2", {
        explanation: "Next plan",
        plan: [{ step: "Step 2", status: "completed" }],
      });
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-2",
      explanation: "Next plan",
      steps: [{ step: "Step 2", status: "completed" }],
    });
  });

  it("keeps plans isolated per thread", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: "Thread 1 plan",
        plan: [{ step: "Step 1", status: "pending" }],
      });
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-2", "turn-2", {
        explanation: "Thread 2 plan",
        plan: [{ step: "Step 2", status: "completed" }],
      });
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-1",
      explanation: "Thread 1 plan",
      steps: [{ step: "Step 1", status: "pending" }],
    });
    expect(result.current.planByThread["thread-2"]).toEqual({
      turnId: "turn-2",
      explanation: "Thread 2 plan",
      steps: [{ step: "Step 2", status: "completed" }],
    });
  });

  it("orders thread lists, applies custom names, and keeps pin ordering stable", async () => {
    const listThreadsMock = vi.mocked(listThreads);
    listThreadsMock.mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-a",
            preview: "Alpha",
            updated_at: 1000,
            cwd: workspace.path,
          },
          {
            id: "thread-b",
            preview: "Beta",
            updated_at: 3000,
            cwd: workspace.path,
          },
          {
            id: "thread-c",
            preview: "Gamma",
            updated_at: 2000,
            cwd: workspace.path,
          },
        ],
        nextCursor: null,
      },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    const { result: threadRowsResult } = renderHook(() =>
      useThreadRows(result.current.threadParentById),
    );

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    const initialOrder =
      result.current.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
    expect(initialOrder).toEqual(["thread-b", "thread-c", "thread-a"]);

    act(() => {
      result.current.renameThread("ws-1", "thread-b", "Custom Beta");
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    const renamed = result.current.threadsByWorkspace["ws-1"]?.find(
      (thread) => thread.id === "thread-b",
    );
    expect(renamed?.name).toBe("Custom Beta");

    now = 5000;
    act(() => {
      result.current.pinThread("ws-1", "thread-c");
    });
    now = 6000;
    act(() => {
      result.current.pinThread("ws-1", "thread-a");
    });

    const { pinnedRows, unpinnedRows } = threadRowsResult.current.getThreadRows(
      result.current.threadsByWorkspace["ws-1"] ?? [],
      true,
      "ws-1",
      result.current.getPinTimestamp,
    );

    expect(pinnedRows.map((row) => row.thread.id)).toEqual([
      "thread-c",
      "thread-a",
    ]);
    expect(unpinnedRows.map((row) => row.thread.id)).toEqual(["thread-b"]);
  });
});
