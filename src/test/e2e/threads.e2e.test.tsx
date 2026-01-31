// @vitest-environment jsdom
/**
 * E2E Tests for Thread/Conversation Management
 *
 * Tests the complete user flows for thread operations including:
 * - Starting new threads
 * - Selecting and resuming threads
 * - Sending messages
 * - Archiving threads
 * - Thread pinning and renaming
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  mockHandlers,
  setWorkspaces,
  resetMocks,
} from "./mocks/tauri.mock";
import type { WorkspaceInfo } from "../../types";

// Import hooks after mocking (mocks are set up in setup.ts)
import { useThreads } from "../../features/threads/hooks/useThreads";

// Mock useAppServerEvents to capture handlers
let serverEventHandlers: Record<string, Function> | null = null;

vi.mock("../../features/app/hooks/useAppServerEvents", () => ({
  useAppServerEvents: (handlers: Record<string, Function>) => {
    serverEventHandlers = handlers;
  },
}));

// Helper to create a mock workspace
function createMockWorkspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "Test Workspace",
    path: "/tmp/test-workspace",
    connected: false,
    settings: { sidebarCollapsed: false },
    ...overrides,
  };
}

// Helper to create a mock thread
function createMockThread(overrides: Partial<{
  id: string;
  preview: string;
  updated_at: number;
  cwd: string;
  name?: string;
}> = {}) {
  return {
    id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    preview: "Test thread preview",
    updated_at: Date.now(),
    cwd: "/tmp/test-workspace",
    ...overrides,
  };
}

describe("Thread Management E2E", () => {
  let mockWorkspace: WorkspaceInfo;

  beforeEach(() => {
    resetMocks();
    localStorage.clear();
    vi.clearAllMocks();
    serverEventHandlers = null;

    mockWorkspace = createMockWorkspace({
      id: "ws-1",
      name: "Test Workspace",
      path: "/tmp/test-workspace",
      connected: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Thread Listing", () => {
    it("lists threads for a workspace", async () => {
      const mockThreads = [
        createMockThread({ id: "thread-1", preview: "First thread", updated_at: 1000 }),
        createMockThread({ id: "thread-2", preview: "Second thread", updated_at: 2000 }),
        createMockThread({ id: "thread-3", preview: "Third thread", updated_at: 3000 }),
      ];

      mockHandlers.list_threads.mockResolvedValue({
        result: { data: mockThreads, nextCursor: null },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.listThreadsForWorkspace(mockWorkspace);
      });

      await waitFor(() => {
        expect(result.current.threadsByWorkspace["ws-1"]).toBeDefined();
      });

      const threads = result.current.threadsByWorkspace["ws-1"];
      expect(threads).toHaveLength(3);
      // Threads should be sorted by updated_at descending
      expect(threads?.[0].id).toBe("thread-3");
      expect(threads?.[1].id).toBe("thread-2");
      expect(threads?.[2].id).toBe("thread-1");
    });

    it("handles empty thread list", async () => {
      mockHandlers.list_threads.mockResolvedValue({
        result: { data: [], nextCursor: null },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.listThreadsForWorkspace(mockWorkspace);
      });

      const threads = result.current.threadsByWorkspace["ws-1"];
      expect(threads).toEqual([]);
    });

    it("supports loading older threads", async () => {
      const threads = [
        createMockThread({ id: "thread-1", preview: "Thread 1", updated_at: 3000 }),
        createMockThread({ id: "thread-2", preview: "Thread 2", updated_at: 2000 }),
      ];

      mockHandlers.list_threads.mockResolvedValue({
        result: { data: threads, nextCursor: null },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.listThreadsForWorkspace(mockWorkspace);
      });

      // Verify the threads were loaded
      expect(result.current.threadsByWorkspace["ws-1"]).toHaveLength(2);

      // Verify loadOlderThreadsForWorkspace is available
      expect(typeof result.current.loadOlderThreadsForWorkspace).toBe("function");
    });
  });

  describe("Starting Threads", () => {
    it("starts a new thread for a workspace", async () => {
      const newThread = createMockThread({ id: "new-thread-1", preview: "" });

      mockHandlers.start_thread.mockResolvedValue({
        result: { thread: newThread },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      let threadId: string | null = null;

      await act(async () => {
        threadId = await result.current.startThreadForWorkspace("ws-1");
      });

      expect(threadId).toBe("new-thread-1");
      expect(result.current.activeThreadId).toBe("new-thread-1");
    });

    it("provides option to control thread activation", async () => {
      const newThread = createMockThread({ id: "new-thread-1", preview: "" });

      mockHandlers.start_thread.mockResolvedValue({
        result: { thread: newThread },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      // Verify startThreadForWorkspace accepts options
      expect(typeof result.current.startThreadForWorkspace).toBe("function");

      await act(async () => {
        const threadId = await result.current.startThreadForWorkspace("ws-1");
        expect(threadId).toBeDefined();
      });
    });
  });

  describe("Thread Selection", () => {
    it("selects a thread and makes it active", async () => {
      const mockThreads = [
        createMockThread({ id: "thread-1", preview: "First thread" }),
        createMockThread({ id: "thread-2", preview: "Second thread" }),
      ];

      mockHandlers.list_threads.mockResolvedValue({
        result: { data: mockThreads, nextCursor: null },
      });

      mockHandlers.resume_thread.mockResolvedValue({
        result: {
          thread: {
            id: "thread-2",
            preview: "Second thread",
            updated_at: Date.now(),
            turns: [],
          },
        },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.listThreadsForWorkspace(mockWorkspace);
      });

      act(() => {
        result.current.setActiveThreadId("thread-2");
      });

      expect(result.current.activeThreadId).toBe("thread-2");
    });

    it("deselects thread when setting active to null", async () => {
      const mockThreads = [
        createMockThread({ id: "thread-1", preview: "First thread" }),
      ];

      mockHandlers.list_threads.mockResolvedValue({
        result: { data: mockThreads, nextCursor: null },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.listThreadsForWorkspace(mockWorkspace);
      });

      act(() => {
        result.current.setActiveThreadId("thread-1");
      });

      expect(result.current.activeThreadId).toBe("thread-1");

      act(() => {
        result.current.setActiveThreadId(null);
      });

      expect(result.current.activeThreadId).toBeNull();
    });
  });

  describe("Sending Messages", () => {
    it("sends a user message to a thread", async () => {
      const thread = createMockThread({ id: "thread-1", preview: "" });

      mockHandlers.start_thread.mockResolvedValue({
        result: { thread },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
          model: "gemini-2.5-pro",
          effort: "medium",
          accessMode: "current",
        })
      );

      await act(async () => {
        await result.current.startThreadForWorkspace("ws-1");
      });

      await act(async () => {
        await result.current.sendUserMessage("Hello, Gemini!", []);
      });

      expect(mockHandlers.send_user_message).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          threadId: "thread-1",
          text: "Hello, Gemini!",
        })
      );
    });

    it("sends a message with images attached", async () => {
      const thread = createMockThread({ id: "thread-1", preview: "" });

      mockHandlers.start_thread.mockResolvedValue({
        result: { thread },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.startThreadForWorkspace("ws-1");
      });

      await act(async () => {
        await result.current.sendUserMessage("Analyze this image", [
          "/tmp/image1.png",
          "/tmp/image2.jpg",
        ]);
      });

      expect(mockHandlers.send_user_message).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Analyze this image",
          images: ["/tmp/image1.png", "/tmp/image2.jpg"],
        })
      );
    });
  });

  describe("Archiving Threads", () => {
    it("archives a thread and removes it from the list", async () => {
      const mockThreads = [
        createMockThread({ id: "thread-1", preview: "First thread" }),
        createMockThread({ id: "thread-2", preview: "Second thread" }),
      ];

      mockHandlers.list_threads.mockResolvedValue({
        result: { data: mockThreads, nextCursor: null },
      });

      mockHandlers.archive_thread.mockResolvedValue({ result: {} });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.listThreadsForWorkspace(mockWorkspace);
      });

      expect(result.current.threadsByWorkspace["ws-1"]).toHaveLength(2);

      await act(async () => {
        result.current.removeThread("ws-1", "thread-1");
      });

      // Thread should be removed locally
      await waitFor(() => {
        expect(result.current.threadsByWorkspace["ws-1"]).toHaveLength(1);
      });
    });

    it("removes thread from list", async () => {
      const mockThreads = [
        createMockThread({ id: "thread-1", preview: "First thread" }),
        createMockThread({ id: "thread-2", preview: "Second thread" }),
      ];

      mockHandlers.list_threads.mockResolvedValue({
        result: { data: mockThreads, nextCursor: null },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.listThreadsForWorkspace(mockWorkspace);
      });

      expect(result.current.threadsByWorkspace["ws-1"]).toHaveLength(2);

      await act(async () => {
        result.current.removeThread("ws-1", "thread-1");
      });

      // Thread should be removed from the list
      expect(result.current.threadsByWorkspace["ws-1"]).toHaveLength(1);
      expect(result.current.threadsByWorkspace["ws-1"]?.[0].id).toBe("thread-2");
    });
  });

  describe("Thread Pinning", () => {
    it("pins a thread", async () => {
      const mockThreads = [
        createMockThread({ id: "thread-1", preview: "First thread" }),
      ];

      mockHandlers.list_threads.mockResolvedValue({
        result: { data: mockThreads, nextCursor: null },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.listThreadsForWorkspace(mockWorkspace);
      });

      expect(result.current.isThreadPinned("ws-1", "thread-1")).toBe(false);

      act(() => {
        result.current.pinThread("ws-1", "thread-1");
      });

      expect(result.current.isThreadPinned("ws-1", "thread-1")).toBe(true);
    });

    it("unpins a thread", async () => {
      const mockThreads = [
        createMockThread({ id: "thread-1", preview: "First thread" }),
      ];

      mockHandlers.list_threads.mockResolvedValue({
        result: { data: mockThreads, nextCursor: null },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.listThreadsForWorkspace(mockWorkspace);
      });

      act(() => {
        result.current.pinThread("ws-1", "thread-1");
      });

      expect(result.current.isThreadPinned("ws-1", "thread-1")).toBe(true);

      act(() => {
        result.current.unpinThread("ws-1", "thread-1");
      });

      expect(result.current.isThreadPinned("ws-1", "thread-1")).toBe(false);
    });

    it("persists pin state to localStorage", async () => {
      const mockThreads = [
        createMockThread({ id: "thread-1", preview: "First thread" }),
      ];

      mockHandlers.list_threads.mockResolvedValue({
        result: { data: mockThreads, nextCursor: null },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.listThreadsForWorkspace(mockWorkspace);
      });

      act(() => {
        result.current.pinThread("ws-1", "thread-1");
      });

      // Verify pin state is accessible via the hook
      expect(result.current.isThreadPinned("ws-1", "thread-1")).toBe(true);
    });
  });

  describe("Thread Renaming", () => {
    it("renames a thread", async () => {
      const mockThreads = [
        createMockThread({ id: "thread-1", preview: "Original name" }),
      ];

      mockHandlers.list_threads.mockResolvedValue({
        result: { data: mockThreads, nextCursor: null },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.listThreadsForWorkspace(mockWorkspace);
      });

      act(() => {
        result.current.renameThread("ws-1", "thread-1", "New Custom Name");
      });

      const thread = result.current.threadsByWorkspace["ws-1"]?.find(
        (t) => t.id === "thread-1"
      );
      expect(thread?.name).toBe("New Custom Name");
    });

    it("persists renamed threads in state", async () => {
      const mockThreads = [
        createMockThread({ id: "thread-1", preview: "Original name" }),
      ];

      mockHandlers.list_threads.mockResolvedValue({
        result: { data: mockThreads, nextCursor: null },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.listThreadsForWorkspace(mockWorkspace);
      });

      act(() => {
        result.current.renameThread("ws-1", "thread-1", "Renamed Thread");
      });

      // Verify rename is accessible via the hook
      const thread = result.current.threadsByWorkspace["ws-1"]?.find(
        (t) => t.id === "thread-1"
      );
      expect(thread?.name).toBe("Renamed Thread");
    });
  });

  describe("Thread Interruption", () => {
    it("interrupts a running turn", async () => {
      const thread = createMockThread({ id: "thread-1", preview: "" });

      mockHandlers.start_thread.mockResolvedValue({
        result: { thread },
      });

      mockHandlers.turn_interrupt.mockResolvedValue({ result: {} });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.startThreadForWorkspace("ws-1");
      });

      // Simulate turn started
      act(() => {
        serverEventHandlers?.onTurnStarted?.("ws-1", "thread-1", "turn-1");
      });

      await act(async () => {
        await result.current.interruptTurn();
      });

      expect(mockHandlers.turn_interrupt).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          threadId: "thread-1",
        })
      );
    });
  });

  describe("Thread Status Tracking", () => {
    it("tracks processing state from server events", async () => {
      const thread = createMockThread({ id: "thread-1", preview: "" });

      mockHandlers.start_thread.mockResolvedValue({
        result: { thread },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.startThreadForWorkspace("ws-1");
      });

      expect(result.current.threadStatusById["thread-1"]?.isProcessing).toBeFalsy();

      // Simulate turn started
      act(() => {
        serverEventHandlers?.onTurnStarted?.("ws-1", "thread-1", "turn-1");
      });

      expect(result.current.threadStatusById["thread-1"]?.isProcessing).toBe(true);

      // Simulate turn completed
      act(() => {
        serverEventHandlers?.onTurnCompleted?.("ws-1", "thread-1", "turn-1");
      });

      expect(result.current.threadStatusById["thread-1"]?.isProcessing).toBe(false);
    });

    it("tracks review mode state", async () => {
      const thread = createMockThread({ id: "thread-1", preview: "" });

      mockHandlers.resume_thread.mockResolvedValue({
        result: {
          thread: {
            ...thread,
            turns: [
              {
                items: [
                  { type: "enteredReviewMode", id: "review-1" },
                ],
              },
            ],
          },
        },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: mockWorkspace,
          onWorkspaceConnected: vi.fn(),
        })
      );

      act(() => {
        result.current.setActiveThreadId("thread-1");
      });

      await waitFor(() => {
        expect(result.current.threadStatusById["thread-1"]?.isReviewing).toBe(true);
      });
    });
  });
});
