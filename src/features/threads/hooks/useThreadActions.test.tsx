// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem, WorkspaceInfo } from "@/types";
import {
  archiveThread,
  forkThread,
  listThreads,
  localThreadUsageSnapshot,
  listWorkspaces,
  resumeThread,
  startThread,
} from "@services/tauri";
import {
  buildItemsFromThread,
  getThreadCreatedTimestamp,
  getThreadTimestamp,
  isReviewingFromThread,
  mergeThreadItems,
  previewThreadName,
} from "@utils/threadItems";
import { saveThreadActivity } from "@threads/utils/threadStorage";
import { useThreadActions } from "./useThreadActions";

vi.mock("@services/tauri", () => ({
  startThread: vi.fn(),
  forkThread: vi.fn(),
  resumeThread: vi.fn(),
  listThreads: vi.fn(),
  localThreadUsageSnapshot: vi.fn(),
  listWorkspaces: vi.fn(),
  archiveThread: vi.fn(),
}));

vi.mock("@utils/threadItems", () => ({
  buildItemsFromThread: vi.fn(),
  getThreadCreatedTimestamp: vi.fn(),
  getThreadTimestamp: vi.fn(),
  isReviewingFromThread: vi.fn(),
  mergeThreadItems: vi.fn(),
  previewThreadName: vi.fn(),
}));

vi.mock("@threads/utils/threadStorage", () => ({
  saveThreadActivity: vi.fn(),
}));

describe("useThreadActions", () => {
  const workspace: WorkspaceInfo = {
    id: "ws-1",
    name: "CodexMonitor",
    path: "/tmp/codex",
    connected: true,
    settings: { sidebarCollapsed: false },
  };
  const workspaceTwo: WorkspaceInfo = {
    id: "ws-2",
    name: "Other",
    path: "/tmp/other",
    connected: true,
    settings: { sidebarCollapsed: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listWorkspaces).mockResolvedValue([]);
    vi.mocked(getThreadCreatedTimestamp).mockReturnValue(0);
    vi.mocked(localThreadUsageSnapshot).mockResolvedValue({
      updatedAt: 1,
      usageByThread: {},
    });
  });

  function renderActions(
    overrides?: Partial<Parameters<typeof useThreadActions>[0]>,
  ) {
    const dispatch = vi.fn();
    const loadedThreadsRef = { current: {} as Record<string, boolean> };
    const replaceOnResumeRef = { current: {} as Record<string, boolean> };
    const threadActivityRef = {
      current: {} as Record<string, Record<string, number>>,
    };
    const applyCollabThreadLinksFromThread = vi.fn();
    const updateThreadParent = vi.fn();
    const onSubagentThreadDetected = vi.fn();

    const args: Parameters<typeof useThreadActions>[0] = {
      dispatch,
      itemsByThread: {},
      threadsByWorkspace: {},
      tokenUsageThreadIdsByWorkspace: {},
      activeThreadIdByWorkspace: {},
      activeTurnIdByThread: {},
      threadParentById: {},
      threadListCursorByWorkspace: {},
      threadStatusById: {},
      threadSortKey: "updated_at",
      getCustomName: () => undefined,
      threadActivityRef,
      loadedThreadsRef,
      replaceOnResumeRef,
      applyCollabThreadLinksFromThread,
      updateThreadParent,
      onSubagentThreadDetected,
      ...overrides,
    };

    const utils = renderHook(() => useThreadActions(args));

    return {
      args,
      dispatch,
      loadedThreadsRef: args.loadedThreadsRef,
      replaceOnResumeRef: args.replaceOnResumeRef,
      threadActivityRef: args.threadActivityRef,
      applyCollabThreadLinksFromThread: args.applyCollabThreadLinksFromThread,
      updateThreadParent: args.updateThreadParent,
      onSubagentThreadDetected: args.onSubagentThreadDetected,
      ...utils,
    };
  }

  it("starts a thread and activates it by default", async () => {
    vi.mocked(startThread).mockResolvedValue({
      result: { thread: { id: "thread-1" } },
    });

    const { result, dispatch, loadedThreadsRef } = renderActions();

    let threadId: string | null = null;
    await act(async () => {
      threadId = await result.current.startThreadForWorkspace("ws-1");
    });

    expect(threadId).toBe("thread-1");
    expect(startThread).toHaveBeenCalledWith("ws-1");
    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setActiveThreadId",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(loadedThreadsRef.current["thread-1"]).toBe(true);
  });

  it("forks a thread and activates the fork", async () => {
    vi.mocked(forkThread).mockResolvedValue({
      result: { thread: { id: "thread-fork-1" } },
    });

    const { result, dispatch, loadedThreadsRef } = renderActions();

    let threadId: string | null = null;
    await act(async () => {
      threadId = await result.current.forkThreadForWorkspace("ws-1", "thread-1");
    });

    expect(threadId).toBe("thread-fork-1");
    expect(forkThread).toHaveBeenCalledWith("ws-1", "thread-1");
    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-fork-1",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setActiveThreadId",
      workspaceId: "ws-1",
      threadId: "thread-fork-1",
    });
    expect(loadedThreadsRef.current["thread-fork-1"]).toBe(true);
  });

  it("forks a thread without activating when requested", async () => {
    vi.mocked(forkThread).mockResolvedValue({
      result: { thread: { id: "thread-fork-2" } },
    });

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.forkThreadForWorkspace("ws-1", "thread-1", {
        activate: false,
      });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-fork-2",
    });
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "setActiveThreadId",
        threadId: "thread-fork-2",
      }),
    );
  });

  it("starts a thread without activating when requested", async () => {
    vi.mocked(startThread).mockResolvedValue({
      result: { thread: { id: "thread-2" } },
    });

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.startThreadForWorkspace("ws-1", { activate: false });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-2",
    });
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "setActiveThreadId" }),
    );
  });

  it("skips resume when already loaded", async () => {
    const loadedThreadsRef = { current: { "thread-1": true } };
    const { result } = renderActions({ loadedThreadsRef });

    let threadId: string | null = null;
    await act(async () => {
      threadId = await result.current.resumeThreadForWorkspace("ws-1", "thread-1");
    });

    expect(threadId).toBe("thread-1");
    expect(resumeThread).not.toHaveBeenCalled();
  });

  it("skips resume while processing unless forced", async () => {
    const options = {
      loadedThreadsRef: { current: { "thread-1": true } },
      threadStatusById: {
        "thread-1": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: 123,
          lastDurationMs: null,
        },
      },
    };
    const { result: skipResult } = renderActions(options);

    await act(async () => {
      await skipResult.current.resumeThreadForWorkspace("ws-1", "thread-1");
    });

    expect(resumeThread).not.toHaveBeenCalled();

    vi.mocked(resumeThread).mockResolvedValue({
      result: { thread: { id: "thread-1", updated_at: 1 } },
    });

    const { result: forceResult } = renderActions(options);

    await act(async () => {
      await forceResult.current.resumeThreadForWorkspace("ws-1", "thread-1", true);
    });

    expect(resumeThread).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("resumes thread, sets items, status, name, and last message", async () => {
    const assistantItem: ConversationItem = {
      id: "assistant-1",
      kind: "message",
      role: "assistant",
      text: "Hello!",
    };

    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: { id: "thread-2", preview: "preview", updated_at: 555 },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([assistantItem]);
    vi.mocked(isReviewingFromThread).mockReturnValue(true);
    vi.mocked(previewThreadName).mockReturnValue("Preview Name");
    vi.mocked(getThreadTimestamp).mockReturnValue(999);
    vi.mocked(mergeThreadItems).mockReturnValue([assistantItem]);

    const { result, dispatch, applyCollabThreadLinksFromThread } = renderActions();

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-2");
    });

    expect(resumeThread).toHaveBeenCalledWith("ws-1", "thread-2");
    expect(applyCollabThreadLinksFromThread).toHaveBeenCalledWith(
      "ws-1",
      "thread-2",
      expect.objectContaining({ id: "thread-2" }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-2",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadItems",
      threadId: "thread-2",
      items: [assistantItem],
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "markReviewing",
      threadId: "thread-2",
      isReviewing: true,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadName",
      workspaceId: "ws-1",
      threadId: "thread-2",
      name: "Preview Name",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setLastAgentMessage",
      threadId: "thread-2",
      text: "Hello!",
      timestamp: 999,
    });
  });

  it("hydrates thread token usage from resume payload when available", async () => {
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-2",
          token_usage: {
            total: {
              total_tokens: 900,
              input_tokens: 600,
              cached_input_tokens: 120,
              output_tokens: 300,
              reasoning_output_tokens: 50,
            },
            last: {
              total_tokens: 120,
              input_tokens: 80,
              cached_input_tokens: 10,
              output_tokens: 40,
              reasoning_output_tokens: 6,
            },
            model_context_window: 200000,
          },
        },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-2");
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadTokenUsage",
      threadId: "thread-2",
      tokenUsage: {
        total: {
          totalTokens: 900,
          inputTokens: 600,
          cachedInputTokens: 120,
          outputTokens: 300,
          reasoningOutputTokens: 50,
        },
        last: {
          totalTokens: 120,
          inputTokens: 80,
          cachedInputTokens: 10,
          outputTokens: 40,
          reasoningOutputTokens: 6,
        },
        modelContextWindow: 200000,
      },
    });
  });

  it("links resumed spawn subagent to its parent from thread source", async () => {
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "child-thread",
          source: {
            subAgent: {
              thread_spawn: {
                parent_thread_id: "parent-thread",
                depth: 1,
              },
            },
          },
        },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);

    const { result, updateThreadParent, onSubagentThreadDetected } = renderActions();

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "child-thread", true);
    });

    expect(updateThreadParent).toHaveBeenCalledWith("parent-thread", ["child-thread"]);
    expect(onSubagentThreadDetected).toHaveBeenCalledWith("ws-1", "child-thread");
  });

  it("does not hydrate status from resume when local items are preserved", async () => {
    const localItem: ConversationItem = {
      id: "local-assistant-1",
      kind: "message",
      role: "assistant",
      text: "Local snapshot",
    };
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-1",
          preview: "Stale remote preview",
          updated_at: 1000,
          turns: [{ id: "turn-stale", status: "inProgress", items: [] }],
        },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(true);

    const { result, dispatch } = renderActions({
      itemsByThread: { "thread-1": [localItem] },
    });

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-1", true);
    });

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "markProcessing",
        threadId: "thread-1",
      }),
    );
    expect(dispatch).not.toHaveBeenCalledWith({
      type: "setActiveTurnId",
      threadId: "thread-1",
      turnId: "turn-stale",
    });
    expect(dispatch).not.toHaveBeenCalledWith({
      type: "markReviewing",
      threadId: "thread-1",
      isReviewing: true,
    });
  });

  it("clears processing state from resume when latest turns are completed", async () => {
    const localItem: ConversationItem = {
      id: "local-assistant-1",
      kind: "message",
      role: "assistant",
      text: "Local snapshot",
    };
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-1",
          preview: "Done thread",
          updated_at: 1000,
          turns: [
            { id: "turn-1", status: "completed", items: [] },
            { id: "turn-2", status: "completed", items: [] },
          ],
        },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);

    const { result, dispatch } = renderActions({
      itemsByThread: { "thread-1": [localItem] },
      threadStatusById: {
        "thread-1": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: 10,
          lastDurationMs: null,
        },
      },
    });

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-1", true, true);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: false,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setActiveTurnId",
      threadId: "thread-1",
      turnId: null,
    });
  });

  it("keeps local processing state when resume turn status is ambiguous", async () => {
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-1",
          preview: "Still running",
          updated_at: 1000,
          turns: [{ id: "turn-remote", status: "unknown_state", items: [] }],
        },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);

    const { result, dispatch } = renderActions({
      threadStatusById: {
        "thread-1": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: 10,
          lastDurationMs: null,
        },
      },
      activeTurnIdByThread: {
        "thread-1": "turn-local",
      },
    });

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-1", true, true);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: true,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setActiveTurnId",
      threadId: "thread-1",
      turnId: "turn-local",
    });
  });

  it("uses latest local processing state while resume is in flight", async () => {
    let resolveResume: ((value: Record<string, unknown>) => void) | null = null;
    vi.mocked(resumeThread).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResume = resolve;
        }),
    );
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);

    const { args, result, rerender, dispatch } = renderActions({
      threadStatusById: {},
      activeTurnIdByThread: {},
    });

    let resumePromise: Promise<string | null> | null = null;
    await act(async () => {
      resumePromise = result.current.resumeThreadForWorkspace(
        "ws-1",
        "thread-1",
        true,
        true,
      );
    });

    args.threadStatusById = {
      "thread-1": {
        isProcessing: true,
        hasUnread: false,
        isReviewing: false,
        processingStartedAt: 10,
        lastDurationMs: null,
      },
    };
    args.activeTurnIdByThread = {
      "thread-1": "turn-local",
    };
    rerender();

    await act(async () => {
      resolveResume?.({
        result: {
          thread: {
            id: "thread-1",
            turns: [{ id: "turn-remote", status: "unknown_state", items: [] }],
          },
        },
      });
      await resumePromise;
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: true,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setActiveTurnId",
      threadId: "thread-1",
      turnId: "turn-local",
    });
  });

  it("hydrates processing state from in-progress turns on resume", async () => {
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-3",
          preview: "Working thread",
          updated_at: 1000,
          turns: [
            { id: "turn-1", status: "completed", items: [] },
            { id: "turn-2", status: "inProgress", items: [] },
          ],
        },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-3", true);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "markProcessing",
      threadId: "thread-3",
      isProcessing: true,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setActiveTurnId",
      threadId: "thread-3",
      turnId: "turn-2",
    });
  });

  it("hydrates processing timestamp from resumed active turn start time", async () => {
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-3",
          preview: "Working thread",
          updated_at: 1000,
          turns: [
            {
              id: "turn-2",
              status: "inProgress",
              started_at: 1_700_000_000_000,
              items: [],
            },
          ],
        },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-3", true);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "markProcessing",
      threadId: "thread-3",
      isProcessing: true,
      timestamp: 1_700_000_000_000,
    });
  });

  it("keeps resume loading true until overlapping resumes finish", async () => {
    let resolveFirst: ((value: unknown) => void) | null = null;
    let resolveSecond: ((value: unknown) => void) | null = null;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    vi.mocked(resumeThread)
      .mockReturnValueOnce(firstPromise as Promise<any>)
      .mockReturnValueOnce(secondPromise as Promise<any>);
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);
    vi.mocked(getThreadTimestamp).mockReturnValue(0);

    const { result, dispatch } = renderActions();

    let callOne: Promise<string | null> | null = null;
    let callTwo: Promise<string | null> | null = null;
    await act(async () => {
      callOne = result.current.resumeThreadForWorkspace("ws-1", "thread-3", true);
      callTwo = result.current.resumeThreadForWorkspace("ws-1", "thread-3", true);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadResumeLoading",
      threadId: "thread-3",
      isLoading: true,
    });

    await act(async () => {
      resolveFirst?.({ result: { thread: { id: "thread-3" } } });
      await firstPromise;
    });

    expect(dispatch).not.toHaveBeenCalledWith({
      type: "setThreadResumeLoading",
      threadId: "thread-3",
      isLoading: false,
    });

    await act(async () => {
      resolveSecond?.({ result: { thread: { id: "thread-3" } } });
      await Promise.all([callOne, callTwo]);
    });

    const loadingFalseCalls = dispatch.mock.calls.filter(
      ([action]) =>
        action?.type === "setThreadResumeLoading" &&
        action?.threadId === "thread-3" &&
        action?.isLoading === false,
    );
    expect(loadingFalseCalls).toHaveLength(1);
  });

  it("lists threads for a workspace and persists activity", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-1",
            cwd: "/tmp/codex",
            preview: "Remote preview",
            updated_at: 5000,
          },
          {
            id: "thread-2",
            cwd: "/other",
            preview: "Ignore",
            updated_at: 7000,
          },
        ],
        nextCursor: "cursor-1",
      },
    });
    vi.mocked(localThreadUsageSnapshot).mockResolvedValueOnce({
      updatedAt: 100,
      usageByThread: {
        "thread-1": {
          total: {
            totalTokens: 1200,
            inputTokens: 700,
            cachedInputTokens: 100,
            outputTokens: 500,
            reasoningOutputTokens: 80,
          },
          last: {
            totalTokens: 200,
            inputTokens: 120,
            cachedInputTokens: 20,
            outputTokens: 80,
            reasoningOutputTokens: 15,
          },
          modelContextWindow: 200000,
        },
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch, threadActivityRef } = renderActions({
      getCustomName: (workspaceId, threadId) =>
        workspaceId === "ws-1" && threadId === "thread-1" ? "Custom" : undefined,
      threadActivityRef: { current: {} },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(listThreads).toHaveBeenCalledWith(
      "ws-1",
      null,
      100,
      "updated_at",
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListLoading",
      workspaceId: "ws-1",
      isLoading: true,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      preserveAnchors: true,
      threads: [
        {
          id: "thread-1",
          name: "Custom",
          updatedAt: 5000,
          createdAt: 0,
        },
      ],
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListCursor",
      workspaceId: "ws-1",
      cursor: "cursor-1",
    });
    expect(localThreadUsageSnapshot).toHaveBeenCalledWith(
      ["thread-1"],
      "/tmp/codex",
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadTokenUsage",
      threadId: "thread-1",
      tokenUsage: {
        total: {
          totalTokens: 1200,
          inputTokens: 700,
          cachedInputTokens: 100,
          outputTokens: 500,
          reasoningOutputTokens: 80,
        },
        last: {
          totalTokens: 200,
          inputTokens: 120,
          cachedInputTokens: 20,
          outputTokens: 80,
          reasoningOutputTokens: 15,
        },
        modelContextWindow: 200000,
      },
    });
    expect(saveThreadActivity).toHaveBeenCalledWith({
      "ws-1": { "thread-1": 5000 },
    });
    expect(threadActivityRef.current).toEqual({
      "ws-1": { "thread-1": 5000 },
    });
  });

  it("merges out-of-order thread usage hydration responses across thread sets", async () => {
    let resolveFirstHydration:
      | ((value: Record<string, unknown>) => void)
      | null = null;
    let resolveSecondHydration:
      | ((value: Record<string, unknown>) => void)
      | null = null;
    const firstHydrationPromise = new Promise<Record<string, unknown>>((resolve) => {
      resolveFirstHydration = resolve;
    });
    const secondHydrationPromise = new Promise<Record<string, unknown>>((resolve) => {
      resolveSecondHydration = resolve;
    });

    vi.mocked(listThreads)
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-a",
              cwd: "/tmp/codex",
              preview: "Thread A",
              updated_at: 3000,
            },
          ],
          nextCursor: null,
        },
      })
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-b",
              cwd: "/tmp/codex",
              preview: "Thread B",
              updated_at: 4000,
            },
          ],
          nextCursor: null,
        },
      });
    vi.mocked(localThreadUsageSnapshot)
      .mockReturnValueOnce(firstHydrationPromise as Promise<any>)
      .mockReturnValueOnce(secondHydrationPromise as Promise<any>);
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
      await result.current.listThreadsForWorkspace(workspace);
    });

    await act(async () => {
      resolveSecondHydration?.({
        updatedAt: 200,
        usageByThread: {
          "thread-b": {
            total: {
              totalTokens: 2000,
              inputTokens: 1200,
              cachedInputTokens: 100,
              outputTokens: 800,
              reasoningOutputTokens: 80,
            },
            last: {
              totalTokens: 300,
              inputTokens: 180,
              cachedInputTokens: 20,
              outputTokens: 120,
              reasoningOutputTokens: 12,
            },
            modelContextWindow: 200000,
          },
        },
      });
      await secondHydrationPromise;
    });

    await act(async () => {
      resolveFirstHydration?.({
        updatedAt: 100,
        usageByThread: {
          "thread-a": {
            total: {
              totalTokens: 1500,
              inputTokens: 900,
              cachedInputTokens: 120,
              outputTokens: 600,
              reasoningOutputTokens: 60,
            },
            last: {
              totalTokens: 250,
              inputTokens: 150,
              cachedInputTokens: 30,
              outputTokens: 100,
              reasoningOutputTokens: 10,
            },
            modelContextWindow: 200000,
          },
        },
      });
      await firstHydrationPromise;
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "setThreadTokenUsage",
        threadId: "thread-a",
      }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "setThreadTokenUsage",
        threadId: "thread-b",
      }),
    );
  });

  it("uses fresh fetched data for active anchors outside top thread target", async () => {
    const data = Array.from({ length: 21 }, (_, index) => ({
      id: `thread-${index + 1}`,
      cwd: workspace.path,
      preview: `Thread ${index + 1} fresh`,
      updated_at: 5000 - index,
    }));
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data,
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-21", name: "Thread 21 stale", updatedAt: 10 }],
      },
      activeThreadIdByWorkspace: { "ws-1": "thread-21" },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    const setThreadsAction = dispatch.mock.calls
      .map(([action]) => action)
      .find(
        (action) => action.type === "setThreads" && action.workspaceId === "ws-1",
      );
    expect(setThreadsAction).toBeTruthy();
    if (!setThreadsAction || setThreadsAction.type !== "setThreads") {
      return;
    }
    expect(setThreadsAction.threads).toHaveLength(21);
    expect(setThreadsAction.threads[20]?.id).toBe("thread-21");
    expect(setThreadsAction.threads[20]?.name).toBe("Thread 21 fresh");
    expect(setThreadsAction.threads[20]?.updatedAt).toBe(4980);
  });

  it("lists threads once and distributes results across workspaces", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-1",
            cwd: "/tmp/codex",
            preview: "WS1 thread",
            updated_at: 5000,
          },
          {
            id: "thread-2",
            cwd: "/tmp/other",
            preview: "WS2 thread",
            updated_at: 4500,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspaces([workspace, workspaceTwo]);
    });

    expect(listThreads).toHaveBeenCalledTimes(1);
    expect(listThreads).toHaveBeenCalledWith("ws-1", null, 100, "updated_at");
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      preserveAnchors: true,
      threads: [
        {
          id: "thread-1",
          name: "WS1 thread",
          updatedAt: 5000,
          createdAt: 0,
        },
      ],
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-2",
      sortKey: "updated_at",
      preserveAnchors: true,
      threads: [
        {
          id: "thread-2",
          name: "WS2 thread",
          updatedAt: 4500,
          createdAt: 0,
        },
      ],
    });
  });

  it("tracks workspace token usage ids from the full fetched thread set", async () => {
    const threads = Array.from({ length: 25 }, (_, index) => ({
      id: `thread-${index + 1}`,
      cwd: "/tmp/codex",
      preview: `Thread ${index + 1}`,
      updated_at: 5000 - index,
    }));
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: threads,
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setWorkspaceTokenUsageThreadIds",
      workspaceId: "ws-1",
      threadIds: threads.map((thread) => thread.id),
    });
    const setThreadsCall = dispatch.mock.calls.find(
      ([action]) => action?.type === "setThreads" && action?.workspaceId === "ws-1",
    );
    expect(setThreadsCall?.[0]?.threads).toHaveLength(20);
    expect(localThreadUsageSnapshot).toHaveBeenCalledWith(
      threads.map((thread) => thread.id),
      "/tmp/codex",
    );
  });

  it("fetches multiple pages by default", async () => {
    vi.mocked(listThreads)
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-1",
              cwd: "/tmp/codex",
              preview: "First page",
              updated_at: 5000,
            },
          ],
          nextCursor: "cursor-1",
        },
      })
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-2",
              cwd: "/tmp/codex",
              preview: "Second page",
              updated_at: 4900,
            },
          ],
          nextCursor: null,
        },
      });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspaces([workspace]);
    });

    expect(listThreads).toHaveBeenCalledTimes(2);
    expect(listThreads).toHaveBeenNthCalledWith(1, "ws-1", null, 100, "updated_at");
    expect(listThreads).toHaveBeenNthCalledWith(
      2,
      "ws-1",
      "cursor-1",
      100,
      "updated_at",
    );
  });

  it("supports snake_case next_cursor in shared thread list responses", async () => {
    vi.mocked(listThreads)
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-1",
              cwd: "/tmp/codex",
              preview: "First page",
              updated_at: 5000,
            },
          ],
          next_cursor: "cursor-legacy-1",
        },
      })
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-2",
              cwd: "/tmp/codex",
              preview: "Second page",
              updated_at: 4900,
            },
          ],
          next_cursor: null,
        },
      });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspaces([workspace]);
    });

    expect(listThreads).toHaveBeenCalledTimes(2);
    expect(listThreads).toHaveBeenNthCalledWith(
      2,
      "ws-1",
      "cursor-legacy-1",
      100,
      "updated_at",
    );
  });

  it("stores a per-workspace cursor boundary for older pagination", async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) => ({
      id: `thread-${index + 1}`,
      cwd: "/tmp/codex",
      preview: `Thread ${index + 1}`,
      updated_at: 5000 - index,
    }));
    const secondPage = Array.from({ length: 15 }, (_, index) => ({
      id: `thread-${index + 11}`,
      cwd: "/tmp/codex",
      preview: `Thread ${index + 11}`,
      updated_at: 4990 - index,
    }));
    vi.mocked(listThreads)
      .mockResolvedValueOnce({
        result: {
          data: firstPage,
          nextCursor: "cursor-1",
        },
      })
      .mockResolvedValueOnce({
        result: {
          data: secondPage,
          nextCursor: null,
        },
      });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListCursor",
      workspaceId: "ws-1",
      cursor: "cursor-1",
    });
  });

  it("restores parent-child links from thread/list source metadata", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "parent-thread",
            cwd: "/tmp/codex",
            preview: "Parent",
            updated_at: 5000,
            source: "vscode",
          },
          {
            id: "child-thread",
            cwd: "/tmp/codex",
            preview: "Child",
            updated_at: 4500,
            source: {
              subAgent: {
                thread_spawn: {
                  parent_thread_id: "parent-thread",
                  depth: 1,
                },
              },
            },
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, updateThreadParent, onSubagentThreadDetected } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(updateThreadParent).toHaveBeenCalledWith("parent-thread", ["child-thread"]);
    expect(onSubagentThreadDetected).toHaveBeenCalledWith("ws-1", "child-thread");
  });

  it("matches windows workspace threads client-side", async () => {
    const windowsWorkspace: WorkspaceInfo = {
      ...workspace,
      path: "C:\\Dev\\CodexMon",
    };
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-win-1",
            cwd: "c:/dev/codexmon",
            preview: "Windows thread",
            updated_at: 5000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockReturnValue(5000);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(windowsWorkspace);
    });

    expect(listThreads).toHaveBeenCalledWith(
      "ws-1",
      null,
      100,
      "updated_at",
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      preserveAnchors: true,
      threads: [
        {
          id: "thread-win-1",
          name: "Windows thread",
          updatedAt: 5000,
          createdAt: 0,
        },
      ],
    });
  });

  it("matches windows namespace-prefixed workspace threads client-side", async () => {
    const windowsWorkspace: WorkspaceInfo = {
      ...workspace,
      path: "C:\\Dev\\CodexMon",
    };
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-win-ns-1",
            cwd: "\\\\?\\C:\\Dev\\CodexMon",
            preview: "Windows namespace thread",
            updated_at: 5000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockReturnValue(5000);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(windowsWorkspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      preserveAnchors: true,
      threads: [
        {
          id: "thread-win-ns-1",
          name: "Windows namespace thread",
          updatedAt: 5000,
          createdAt: 0,
        },
      ],
    });
  });

  it("matches nested workspace threads client-side", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-nested-1",
            cwd: "/tmp/codex/subdir/project",
            preview: "Nested thread",
            updated_at: 5000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockReturnValue(5000);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      preserveAnchors: true,
      threads: [
        {
          id: "thread-nested-1",
          name: "Nested thread",
          updatedAt: 5000,
          createdAt: 0,
        },
      ],
    });
  });

  it("does not absorb nested child workspace threads when reloading one workspace", async () => {
    const parentWorkspace: WorkspaceInfo = {
      ...workspace,
      id: "ws-parent",
      path: "/tmp/codex",
    };
    const childWorkspace: WorkspaceInfo = {
      ...workspaceTwo,
      id: "ws-child",
      path: "/tmp/codex/subdir",
    };
    vi.mocked(listWorkspaces).mockResolvedValue([parentWorkspace, childWorkspace]);
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-child-only",
            cwd: "/tmp/codex/subdir/project",
            preview: "Child workspace thread",
            updated_at: 5000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockReturnValue(5000);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(parentWorkspace);
    });

    expect(listWorkspaces).toHaveBeenCalled();
    const parentSetThreadsAction = dispatch.mock.calls
      .map(([action]) => action)
      .find(
        (action) =>
          action?.type === "setThreads" &&
          action?.workspaceId === "ws-parent",
      ) as
      | { type: "setThreads"; threads: Array<{ id: string }>; workspaceId: string }
      | undefined;

    expect(parentSetThreadsAction?.threads.map((thread) => thread.id) ?? []).toEqual([]);
  });

  it("preserves list state when requested", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    });

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, {
        preserveState: true,
      });
    });

    expect(dispatch).not.toHaveBeenCalledWith({
      type: "setThreadListLoading",
      workspaceId: "ws-1",
      isLoading: true,
    });
  });

  it("requests created_at sorting when provided", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    });

    const { result } = renderActions({ threadSortKey: "created_at" });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(listThreads).toHaveBeenCalledWith(
      "ws-1",
      null,
      100,
      "created_at",
    );
  });

  it("loads older threads when a cursor is available", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-2",
            cwd: "/tmp/codex",
            preview: "Older preview",
            updated_at: 4000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(localThreadUsageSnapshot).mockResolvedValueOnce({
      updatedAt: 120,
      usageByThread: {
        "thread-2": {
          total: {
            totalTokens: 400,
            inputTokens: 250,
            cachedInputTokens: 30,
            outputTokens: 150,
            reasoningOutputTokens: 10,
          },
          last: {
            totalTokens: 60,
            inputTokens: 40,
            cachedInputTokens: 5,
            outputTokens: 20,
            reasoningOutputTokens: 2,
          },
          modelContextWindow: null,
        },
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-1": "cursor-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListPaging",
      workspaceId: "ws-1",
      isLoading: true,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      threads: [
        { id: "thread-1", name: "Agent 1", updatedAt: 6000 },
        { id: "thread-2", name: "Older preview", updatedAt: 4000, createdAt: 0 },
      ],
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListCursor",
      workspaceId: "ws-1",
      cursor: null,
    });
    expect(localThreadUsageSnapshot).toHaveBeenCalledWith(
      ["thread-2"],
      "/tmp/codex",
    );
  });

  it("supports snake_case next_cursor when loading older threads", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-2",
            cwd: "/tmp/codex",
            preview: "Older preview",
            updated_at: 4000,
          },
        ],
        next_cursor: "cursor-legacy-next",
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-1": "cursor-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListCursor",
      workspaceId: "ws-1",
      cursor: "cursor-legacy-next",
    });
  });

  it("treats page-start cursor marker as null when loading older threads", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    });

    const { result } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: {
        "ws-1": "__codex_monitor_page_start__",
      },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    expect(listThreads).toHaveBeenCalledWith(
      "ws-1",
      null,
      100,
      "updated_at",
    );
  });

  it("matches windows workspace threads when loading older threads", async () => {
    const windowsWorkspace: WorkspaceInfo = {
      ...workspace,
      path: "C:\\Dev\\CodexMon",
    };
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-win-older",
            cwd: "c:/dev/codexmon",
            preview: "Older windows preview",
            updated_at: 4000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-1": "cursor-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(windowsWorkspace);
    });

    expect(listThreads).toHaveBeenCalledWith(
      "ws-1",
      "cursor-1",
      100,
      "updated_at",
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      threads: [
        { id: "thread-1", name: "Agent 1", updatedAt: 6000 },
        {
          id: "thread-win-older",
          name: "Older windows preview",
          updatedAt: 4000,
          createdAt: 0,
        },
      ],
    });
  });

  it("matches nested workspace threads when loading older threads", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-nested-older",
            cwd: "/tmp/codex/subdir/project",
            preview: "Nested older preview",
            updated_at: 4000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-1": "cursor-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      threads: [
        { id: "thread-1", name: "Agent 1", updatedAt: 6000 },
        {
          id: "thread-nested-older",
          name: "Nested older preview",
          updatedAt: 4000,
          createdAt: 0,
        },
      ],
    });
  });

  it("does not absorb child-workspace threads when loading older threads", async () => {
    const parentWorkspace: WorkspaceInfo = {
      ...workspace,
      id: "ws-parent",
      path: "/tmp/codex",
    };
    const childWorkspace: WorkspaceInfo = {
      ...workspaceTwo,
      id: "ws-child",
      path: "/tmp/codex/subdir",
    };
    vi.mocked(listWorkspaces).mockResolvedValue([parentWorkspace, childWorkspace]);
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-child-only",
            cwd: "/tmp/codex/subdir/project",
            preview: "Child workspace thread",
            updated_at: 4000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-parent": [{ id: "thread-parent", name: "Parent", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-parent": "cursor-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(parentWorkspace);
    });

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "setThreads",
        workspaceId: "ws-parent",
      }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListCursor",
      workspaceId: "ws-parent",
      cursor: null,
    });
  });

  it("detects model metadata from list responses", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-model-1",
            cwd: "/tmp/codex",
            preview: "Uses gpt-5",
            updated_at: 5000,
            model: "gpt-5-codex",
            reasoning_effort: "high",
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const onThreadCodexMetadataDetected = vi.fn();
    const { result } = renderActions({ onThreadCodexMetadataDetected });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(onThreadCodexMetadataDetected).toHaveBeenCalledWith(
      "ws-1",
      "thread-model-1",
      { modelId: "gpt-5-codex", effort: "high" },
    );
  });

  it("detects model metadata when resuming a thread", async () => {
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-resume-model",
          preview: "resume preview",
          updated_at: 1200,
          turns: [
            {
              items: [
                {
                  type: "turnContext",
                  payload: {
                    info: {
                      model: "gpt-5.3-codex",
                      reasoning_effort: "medium",
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);
    vi.mocked(getThreadTimestamp).mockReturnValue(1200);

    const onThreadCodexMetadataDetected = vi.fn();
    const { result } = renderActions({ onThreadCodexMetadataDetected });

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-resume-model");
    });

    expect(onThreadCodexMetadataDetected).toHaveBeenCalledWith(
      "ws-1",
      "thread-resume-model",
      { modelId: "gpt-5.3-codex", effort: "medium" },
    );
  });

  it("prefetches model metadata in background after listing threads", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-bg-1",
            cwd: "/tmp/codex",
            preview: "Background model",
            updated_at: 5000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-bg-1",
          model: "gpt-5.2-codex",
          reasoning_effort: "high",
        },
      },
    });

    const onThreadCodexMetadataDetected = vi.fn();
    const { result } = renderActions({
      enableBackgroundMetadataHydration: true,
      onThreadCodexMetadataDetected,
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    await waitFor(() => {
      expect(resumeThread).toHaveBeenCalledWith("ws-1", "thread-bg-1");
    });
    await waitFor(() => {
      expect(onThreadCodexMetadataDetected).toHaveBeenCalledWith(
        "ws-1",
        "thread-bg-1",
        { modelId: "gpt-5.2-codex", effort: "high" },
      );
    });
  });

  it("does not re-prefetch model-less metadata after first background hydration", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-bg-repeat-1",
            cwd: "/tmp/codex",
            preview: "Background model-less thread",
            updated_at: 5000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-bg-repeat-1",
          preview: "Background model-less thread",
        },
      },
    });

    const onThreadCodexMetadataDetected = vi.fn();
    const { result } = renderActions({
      enableBackgroundMetadataHydration: true,
      onThreadCodexMetadataDetected,
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    await waitFor(() => {
      expect(resumeThread).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(resumeThread).toHaveBeenCalledTimes(1);
    expect(onThreadCodexMetadataDetected).not.toHaveBeenCalled();
  });

  it("does not overwrite snapshot token usage during background metadata hydration", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-bg-usage-1",
            cwd: "/tmp/codex",
            preview: "Background usage thread",
            updated_at: 5100,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(localThreadUsageSnapshot).mockResolvedValue({
      updatedAt: 500,
      usageByThread: {
        "thread-bg-usage-1": {
          total: {
            totalTokens: 1000,
            inputTokens: 650,
            cachedInputTokens: 100,
            outputTokens: 350,
            reasoningOutputTokens: 25,
          },
          last: {
            totalTokens: 100,
            inputTokens: 65,
            cachedInputTokens: 10,
            outputTokens: 35,
            reasoningOutputTokens: 2,
          },
          modelContextWindow: 200000,
        },
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-bg-usage-1",
          model: "gpt-5.2-codex",
          token_usage: {
            total: {
              total_tokens: 9999,
              input_tokens: 6000,
              cached_input_tokens: 1200,
              output_tokens: 3999,
              reasoning_output_tokens: 100,
            },
            last: {
              total_tokens: 999,
              input_tokens: 600,
              cached_input_tokens: 120,
              output_tokens: 399,
              reasoning_output_tokens: 10,
            },
            model_context_window: 200000,
          },
        },
      },
    });

    const { result, dispatch } = renderActions({
      enableBackgroundMetadataHydration: true,
      onThreadCodexMetadataDetected: vi.fn(),
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    await waitFor(() => {
      expect(resumeThread).toHaveBeenCalledWith("ws-1", "thread-bg-usage-1");
    });

    const tokenUsageActions = dispatch.mock.calls
      .map(([action]) => action)
      .filter(
        (action) =>
          action.type === "setThreadTokenUsage" &&
          action.threadId === "thread-bg-usage-1",
      );

    expect(tokenUsageActions).toHaveLength(1);
    expect(tokenUsageActions[0]).toEqual(
      expect.objectContaining({
        type: "setThreadTokenUsage",
        threadId: "thread-bg-usage-1",
        tokenUsage: expect.objectContaining({
          total: expect.objectContaining({
            totalTokens: 1000,
          }),
        }),
      }),
    );
  });

  it("prefetches metadata for all listed threads across multiple hydration batches", async () => {
    const listedThreads = Array.from({ length: 10 }, (_, index) => ({
      id: `thread-bg-batch-${index + 1}`,
      cwd: "/tmp/codex",
      preview: `Background ${index + 1}`,
      updated_at: 6_000 - index,
    }));
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: listedThreads,
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });
    vi.mocked(resumeThread).mockImplementation(async (_workspaceId, threadId) => ({
      result: {
        thread: {
          id: threadId,
          model: "gpt-5.2-codex",
        },
      },
    }));

    const onThreadCodexMetadataDetected = vi.fn();
    const { result } = renderActions({
      enableBackgroundMetadataHydration: true,
      onThreadCodexMetadataDetected,
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    await waitFor(() => {
      expect(resumeThread).toHaveBeenCalledTimes(10);
    });
    listedThreads.forEach((thread) => {
      expect(resumeThread).toHaveBeenCalledWith("ws-1", thread.id);
      expect(onThreadCodexMetadataDetected).toHaveBeenCalledWith(
        "ws-1",
        thread.id,
        { modelId: "gpt-5.2-codex", effort: null },
      );
    });
  });

  it("prefetches model metadata in background for older-page additions", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-older-bg-1",
            cwd: "/tmp/codex",
            preview: "Older background model",
            updated_at: 4000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-older-bg-1",
          model: "gpt-5.1-codex",
          reasoning_effort: "medium",
        },
      },
    });

    const onThreadCodexMetadataDetected = vi.fn();
    const { result } = renderActions({
      enableBackgroundMetadataHydration: true,
      onThreadCodexMetadataDetected,
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-1": "cursor-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    await waitFor(() => {
      expect(resumeThread).toHaveBeenCalledWith("ws-1", "thread-older-bg-1");
    });
    await waitFor(() => {
      expect(onThreadCodexMetadataDetected).toHaveBeenCalledWith(
        "ws-1",
        "thread-older-bg-1",
        { modelId: "gpt-5.1-codex", effort: "medium" },
      );
    });
  });

  it("prefetches metadata for all older-page additions across batches", async () => {
    const olderThreads = Array.from({ length: 11 }, (_, index) => ({
      id: `thread-older-bg-batch-${index + 1}`,
      cwd: "/tmp/codex",
      preview: `Older background ${index + 1}`,
      updated_at: 4_500 - index,
    }));
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: olderThreads,
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });
    vi.mocked(resumeThread).mockImplementation(async (_workspaceId, threadId) => ({
      result: {
        thread: {
          id: threadId,
          model: "gpt-5.1-codex",
        },
      },
    }));

    const onThreadCodexMetadataDetected = vi.fn();
    const { result } = renderActions({
      enableBackgroundMetadataHydration: true,
      onThreadCodexMetadataDetected,
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6_000 }],
      },
      threadListCursorByWorkspace: { "ws-1": "cursor-batch-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    await waitFor(() => {
      expect(resumeThread).toHaveBeenCalledTimes(11);
    });
    olderThreads.forEach((thread) => {
      expect(resumeThread).toHaveBeenCalledWith("ws-1", thread.id);
      expect(onThreadCodexMetadataDetected).toHaveBeenCalledWith(
        "ws-1",
        thread.id,
        { modelId: "gpt-5.1-codex", effort: null },
      );
    });
  });

  it("archives threads and reports errors", async () => {
    vi.mocked(archiveThread).mockRejectedValue(new Error("nope"));
    const onDebug = vi.fn();
    const { result } = renderActions({ onDebug });

    await act(async () => {
      await result.current.archiveThread("ws-1", "thread-9");
    });

    expect(archiveThread).toHaveBeenCalledWith("ws-1", "thread-9");
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "error",
        label: "thread/archive error",
        payload: "nope",
      }),
    );
  });
});
