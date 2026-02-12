// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "@/types";
import type { useAppServerEvents } from "@app/hooks/useAppServerEvents";
import { useThreadRows } from "@app/hooks/useThreadRows";
import {
  interruptTurn,
  listThreads,
  resumeThread,
  sendUserMessage as sendUserMessageService,
  setThreadName,
  startReview,
  steerTurn,
} from "@services/tauri";
import { STORAGE_KEY_DETACHED_REVIEW_LINKS } from "@threads/utils/threadStorage";
import { useQueuedSend } from "./useQueuedSend";
import { useThreads } from "./useThreads";

type AppServerHandlers = Parameters<typeof useAppServerEvents>[0];

let handlers: AppServerHandlers | null = null;

vi.mock("@app/hooks/useAppServerEvents", () => ({
  useAppServerEvents: (incoming: AppServerHandlers) => {
    handlers = incoming;
  },
}));

vi.mock("@services/tauri", () => ({
  respondToServerRequest: vi.fn(),
  respondToUserInputRequest: vi.fn(),
  rememberApprovalRule: vi.fn(),
  sendUserMessage: vi.fn(),
  steerTurn: vi.fn(),
  startReview: vi.fn(),
  startThread: vi.fn(),
  listThreads: vi.fn(),
  resumeThread: vi.fn(),
  archiveThread: vi.fn(),
  setThreadName: vi.fn(),
  getAccountRateLimits: vi.fn(),
  getAccountInfo: vi.fn(),
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

  it("resumes selected threads when no local items exist", async () => {
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
      result.current.setActiveThreadId("thread-2");
    });

    await waitFor(() => {
      expect(vi.mocked(resumeThread)).toHaveBeenCalledWith("ws-1", "thread-2");
    });

    await waitFor(() => {
      expect(result.current.threadStatusById["thread-2"]?.isReviewing).toBe(true);
    });

    const activeItems = result.current.activeItems;
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

  it("stores turn diff updates from app-server events", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnDiffUpdated?.(
        "ws-1",
        "thread-1",
        "diff --git a/src/a.ts b/src/a.ts",
      );
    });

    expect(result.current.turnDiffByThread["thread-1"]).toBe(
      "diff --git a/src/a.ts b/src/a.ts",
    );
  });

  it("keeps local items when resume response does not overlap", async () => {
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-3",
          preview: "Remote preview",
          updated_at: 9999,
          turns: [
            {
              items: [
                {
                  type: "userMessage",
                  id: "server-user-1",
                  content: [{ type: "text", text: "Remote hello" }],
                },
                {
                  type: "agentMessage",
                  id: "server-assistant-1",
                  text: "Remote response",
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
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "thread-3",
        itemId: "local-assistant-1",
        text: "Local response",
      });
    });

    act(() => {
      result.current.setActiveThreadId("thread-3");
    });

    await waitFor(() => {
      expect(vi.mocked(resumeThread)).toHaveBeenCalledWith("ws-1", "thread-3");
    });

    await waitFor(() => {
      const activeItems = result.current.activeItems;
      const hasLocal = activeItems.some(
        (item) =>
          item.kind === "message" &&
          item.role === "assistant" &&
          item.id === "local-assistant-1",
      );
      const hasRemote = activeItems.some(
        (item) => item.kind === "message" && item.id === "server-user-1",
      );
      expect(hasLocal).toBe(true);
      expect(hasRemote).toBe(false);
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

  it("clears completed plans when a turn finishes", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: "All done",
        plan: [{ step: "Step 1", status: "completed" }],
      });
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-1",
      explanation: "All done",
      steps: [{ step: "Step 1", status: "completed" }],
    });

    act(() => {
      handlers?.onTurnCompleted?.("ws-1", "thread-1", "turn-1");
    });

    expect(result.current.planByThread["thread-1"]).toBeNull();
  });

  it("keeps plans visible on turn completion when steps remain", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: "Still in progress",
        plan: [{ step: "Step 1", status: "in_progress" }],
      });
    });

    act(() => {
      handlers?.onTurnCompleted?.("ws-1", "thread-1", "turn-1");
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-1",
      explanation: "Still in progress",
      steps: [{ step: "Step 1", status: "inProgress" }],
    });
  });

  it("interrupts immediately even before a turn id is available", async () => {
    const interruptMock = vi.mocked(interruptTurn);
    interruptMock.mockResolvedValue({ result: {} });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-1");
    });

    await act(async () => {
      await result.current.interruptTurn();
    });

    expect(interruptMock).toHaveBeenCalledWith("ws-1", "thread-1", "pending");

    act(() => {
      handlers?.onTurnStarted?.("ws-1", "thread-1", "turn-1");
    });

    await waitFor(() => {
      expect(interruptMock).toHaveBeenCalledWith("ws-1", "thread-1", "turn-1");
    });
    expect(interruptMock).toHaveBeenCalledTimes(2);
  });

  it("keeps queued sends blocked while request user input is pending", async () => {
    vi.mocked(sendUserMessageService)
      .mockResolvedValueOnce({
        result: { turn: { id: "turn-1" } },
      } as Awaited<ReturnType<typeof sendUserMessageService>>)
      .mockResolvedValueOnce({
        result: { turn: { id: "turn-2" } },
      } as Awaited<ReturnType<typeof sendUserMessageService>>);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const clearActiveImages = vi.fn();

    const { result } = renderHook(() => {
      const threads = useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      });
      const threadId = threads.activeThreadId;
      const status = threadId ? threads.threadStatusById[threadId] : undefined;
      const queued = useQueuedSend({
        activeThreadId: threadId,
        activeTurnId: threadId ? threads.activeTurnIdByThread[threadId] ?? null : null,
        isProcessing: status?.isProcessing ?? false,
        isReviewing: status?.isReviewing ?? false,
        steerEnabled: false,
        appsEnabled: true,
        activeWorkspace: workspace,
        connectWorkspace,
        startThreadForWorkspace: threads.startThreadForWorkspace,
        sendUserMessage: threads.sendUserMessage,
        sendUserMessageToThread: threads.sendUserMessageToThread,
        startFork: threads.startFork,
        startReview: threads.startReview,
        startResume: threads.startResume,
        startCompact: threads.startCompact,
        startApps: threads.startApps,
        startMcp: threads.startMcp,
        startStatus: threads.startStatus,
        clearActiveImages,
      });
      return { threads, queued };
    });

    expect(handlers).not.toBeNull();

    act(() => {
      result.current.threads.setActiveThreadId("thread-1");
    });

    await act(async () => {
      await result.current.threads.sendUserMessage("Start running turn");
    });

    await waitFor(() => {
      expect(result.current.threads.threadStatusById["thread-1"]?.isProcessing).toBe(true);
      expect(result.current.threads.activeTurnIdByThread["thread-1"]).toBe("turn-1");
      expect(sendUserMessageService).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.queued.handleSend("Queued during turn");
    });

    expect(result.current.queued.activeQueue).toHaveLength(1);
    expect(sendUserMessageService).toHaveBeenCalledTimes(1);

    act(() => {
      handlers?.onRequestUserInput?.({
        workspace_id: "ws-1",
        request_id: "request-1",
        params: {
          thread_id: "thread-1",
          turn_id: "turn-1",
          item_id: "item-1",
          questions: [],
        },
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.queued.activeQueue).toHaveLength(1);
    expect(sendUserMessageService).toHaveBeenCalledTimes(1);

    act(() => {
      handlers?.onTurnCompleted?.("ws-1", "thread-1", "turn-1");
    });

    await waitFor(() => {
      expect(sendUserMessageService).toHaveBeenCalledTimes(2);
    });
    const queuedCall = vi.mocked(sendUserMessageService).mock.calls[1];
    expect(queuedCall?.[0]).toBe("ws-1");
    expect(queuedCall?.[1]).toBe("thread-1");
    expect(queuedCall?.[2]).toBe("Queued during turn");
  });

  it("keeps active turn id after request user input so interrupt targets the running turn", async () => {
    const interruptMock = vi.mocked(interruptTurn);
    interruptMock.mockResolvedValue({ result: {} });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-1");
      handlers?.onTurnStarted?.("ws-1", "thread-1", "turn-1");
      handlers?.onRequestUserInput?.({
        workspace_id: "ws-1",
        request_id: "request-1",
        params: {
          thread_id: "thread-1",
          turn_id: "turn-1",
          item_id: "item-1",
          questions: [],
        },
      });
    });

    await act(async () => {
      await result.current.interruptTurn();
    });

    expect(interruptMock).toHaveBeenCalledWith("ws-1", "thread-1", "turn-1");
    expect(interruptMock).not.toHaveBeenCalledWith("ws-1", "thread-1", "pending");
  });

  it("uses turn steer after request user input when the turn is still active", async () => {
    vi.mocked(steerTurn).mockResolvedValue({
      result: { turnId: "turn-1" },
    } as Awaited<ReturnType<typeof steerTurn>>);
    vi.mocked(sendUserMessageService).mockResolvedValue({
      result: { turn: { id: "turn-2" } },
    } as Awaited<ReturnType<typeof sendUserMessageService>>);

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        steerEnabled: true,
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-1");
      handlers?.onTurnStarted?.("ws-1", "thread-1", "turn-1");
      handlers?.onRequestUserInput?.({
        workspace_id: "ws-1",
        request_id: "request-1",
        params: {
          thread_id: "thread-1",
          turn_id: "turn-1",
          item_id: "item-1",
          questions: [],
        },
      });
    });

    expect(result.current.threadStatusById["thread-1"]?.isProcessing).toBe(true);
    expect(result.current.activeTurnIdByThread["thread-1"]).toBe("turn-1");

    await act(async () => {
      await result.current.sendUserMessage("Steer after user input");
    });

    expect(steerTurn).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "turn-1",
      "Steer after user input",
      [],
    );
    expect(sendUserMessageService).not.toHaveBeenCalled();
  });

  it("links detached review thread to its parent", async () => {
    vi.mocked(startReview).mockResolvedValue({
      result: { reviewThreadId: "thread-review-1" },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        reviewDeliveryMode: "detached",
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-parent");
    });

    await act(async () => {
      await result.current.startReview("/review check this");
    });

    await waitFor(() => {
      expect(vi.mocked(startReview)).toHaveBeenCalledWith(
        "ws-1",
        "thread-parent",
        expect.any(Object),
        "detached",
      );
    });

    expect(result.current.threadParentById["thread-review-1"]).toBe("thread-parent");
  });

  it("keeps detached collab review threads under the original parent", async () => {
    vi.mocked(startReview).mockResolvedValue({
      result: { reviewThreadId: "thread-review-1" },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        reviewDeliveryMode: "detached",
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-parent");
    });

    await act(async () => {
      await result.current.startReview("/review check this");
    });

    expect(result.current.threadParentById["thread-review-1"]).toBe("thread-parent");

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-parent", {
        type: "collabToolCall",
        id: "item-collab-1",
        senderThreadId: "thread-review-1",
        newThreadId: "thread-review-2",
      });
    });

    expect(result.current.threadParentById["thread-review-2"]).toBe("thread-review-1");

    const { result: threadRowsResult } = renderHook(() =>
      useThreadRows(result.current.threadParentById),
    );
    const rows = threadRowsResult.current.getThreadRows(
      [
        { id: "thread-parent", name: "Parent", updatedAt: 3 },
        { id: "thread-review-2", name: "Review Child", updatedAt: 2 },
      ],
      true,
      "ws-1",
      () => null,
    );
    expect(rows.unpinnedRows.map((row) => [row.thread.id, row.depth])).toEqual([
      ["thread-parent", 0],
      ["thread-review-2", 1],
    ]);
  });

  it("keeps parent unlocked and pings parent when detached child exits", async () => {
    vi.mocked(startReview).mockResolvedValue({
      result: { reviewThreadId: "thread-review-1" },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        reviewDeliveryMode: "detached",
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-parent");
    });

    await act(async () => {
      await result.current.startReview("/review check this");
    });

    expect(result.current.threadStatusById["thread-parent"]?.isReviewing).toBe(false);
    expect(result.current.threadStatusById["thread-parent"]?.isProcessing).toBe(false);
    expect(
      result.current.activeItems.some(
        (item) =>
          item.kind === "message" &&
          item.role === "assistant" &&
          item.text.includes("Detached review started.") &&
          item.text.includes("[Open review thread](/thread/thread-review-1)"),
      ),
    ).toBe(true);

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-review-1", {
        type: "exitedReviewMode",
        id: "review-exit-1",
      });
    });

    expect(result.current.threadStatusById["thread-parent"]?.isReviewing).toBe(false);
    expect(result.current.threadStatusById["thread-parent"]?.isProcessing).toBe(false);
    expect(
      result.current.activeItems.some(
        (item) =>
          item.kind === "message" &&
          item.role === "assistant" &&
          item.text.includes("Detached review completed.") &&
          item.text.includes("[Open review thread](/thread/thread-review-1)"),
      ),
    ).toBe(true);
  });

  it("preserves parent turn state when detached child exits", async () => {
    vi.mocked(startReview).mockResolvedValue({
      result: { reviewThreadId: "thread-review-1" },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        reviewDeliveryMode: "detached",
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-parent");
    });

    await act(async () => {
      await result.current.startReview("/review check this");
    });

    act(() => {
      handlers?.onTurnStarted?.("ws-1", "thread-parent", "turn-parent-1");
    });

    expect(result.current.threadStatusById["thread-parent"]?.isProcessing).toBe(true);
    expect(result.current.activeTurnIdByThread["thread-parent"]).toBe("turn-parent-1");

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-review-1", {
        type: "exitedReviewMode",
        id: "review-exit-1",
      });
    });

    expect(result.current.threadStatusById["thread-parent"]?.isProcessing).toBe(true);
    expect(result.current.activeTurnIdByThread["thread-parent"]).toBe("turn-parent-1");
    expect(
      result.current.activeItems.some(
        (item) =>
          item.kind === "message" &&
          item.role === "assistant" &&
          item.text.includes("Detached review completed.") &&
          item.text.includes("[Open review thread](/thread/thread-review-1)"),
      ),
    ).toBe(true);
  });

  it("does not stack detached completion messages when exit is emitted multiple times", async () => {
    vi.mocked(startReview).mockResolvedValue({
      result: { reviewThreadId: "thread-review-1" },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        reviewDeliveryMode: "detached",
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-parent");
    });

    await act(async () => {
      await result.current.startReview("/review check this");
    });

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-review-1", {
        type: "exitedReviewMode",
        id: "review-exit-1",
      });
      handlers?.onItemCompleted?.("ws-1", "thread-review-1", {
        type: "exitedReviewMode",
        id: "review-exit-1",
      });
    });

    const notices = result.current.activeItems.filter(
      (item) =>
        item.kind === "message" &&
        item.role === "assistant" &&
        item.text.includes("Detached review completed.") &&
        item.text.includes("[Open review thread](/thread/thread-review-1)"),
    );
    expect(notices).toHaveLength(1);
  });

  it("does not post detached completion notice for generic linked child reviews", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        reviewDeliveryMode: "detached",
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-parent");
    });

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-parent", {
        type: "collabToolCall",
        id: "item-collab-link-1",
        senderThreadId: "thread-parent",
        newThreadId: "thread-linked-1",
      });
    });

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-linked-1", {
        type: "exitedReviewMode",
        id: "review-exit-linked-1",
      });
    });

    expect(
      result.current.activeItems.some(
        (item) =>
          item.kind === "message" &&
          item.role === "assistant" &&
          item.text.includes("[Open review thread](/thread/thread-linked-1)"),
      ),
    ).toBe(false);
  });

  it("restores detached review parent links after relaunch", async () => {
    vi.mocked(startReview).mockResolvedValue({
      result: { reviewThreadId: "thread-review-1" },
    });
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-parent",
            preview: "Parent",
            updated_at: 10,
            cwd: workspace.path,
          },
          {
            id: "thread-review-1",
            preview: "Detached review",
            updated_at: 9,
            cwd: workspace.path,
          },
        ],
        nextCursor: null,
      },
    });

    const first = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        reviewDeliveryMode: "detached",
      }),
    );

    act(() => {
      first.result.current.setActiveThreadId("thread-parent");
    });

    await act(async () => {
      await first.result.current.startReview("/review check this");
    });

    expect(first.result.current.threadParentById["thread-review-1"]).toBe("thread-parent");
    expect(localStorage.getItem(STORAGE_KEY_DETACHED_REVIEW_LINKS)).toContain(
      "thread-review-1",
    );

    first.unmount();

    const second = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    await act(async () => {
      await second.result.current.listThreadsForWorkspace(workspace);
    });

    await waitFor(() => {
      expect(second.result.current.threadParentById["thread-review-1"]).toBe(
        "thread-parent",
      );
    });
  });

  it("does not create a parent link for inline reviews", async () => {
    vi.mocked(startReview).mockResolvedValue({
      result: { reviewThreadId: "thread-parent" },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        reviewDeliveryMode: "inline",
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-parent");
    });

    await act(async () => {
      await result.current.startReview("/review check this");
    });

    await waitFor(() => {
      expect(vi.mocked(startReview)).toHaveBeenCalledWith(
        "ws-1",
        "thread-parent",
        expect.any(Object),
        "inline",
      );
    });

    expect(result.current.threadParentById["thread-parent"]).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY_DETACHED_REVIEW_LINKS)).toBeNull();
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
    expect(vi.mocked(setThreadName)).toHaveBeenCalledWith(
      "ws-1",
      "thread-b",
      "Custom Beta",
    );

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
