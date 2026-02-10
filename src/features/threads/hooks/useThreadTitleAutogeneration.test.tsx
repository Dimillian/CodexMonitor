// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ConversationItem, ThreadSummary } from "../../../types";
import { generateRunMetadata } from "../../../services/tauri";
import { useThreadTitleAutogeneration } from "./useThreadTitleAutogeneration";

vi.mock("../../../services/tauri", () => ({
  generateRunMetadata: vi.fn(),
}));

describe("useThreadTitleAutogeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setup({
    enabled = true,
    initialCustomName,
    threadName = "New Agent",
    existingItems = [],
  }: {
    enabled?: boolean;
    initialCustomName?: string;
    threadName?: string;
    existingItems?: ConversationItem[];
  } = {}) {
    let customName = initialCustomName;
    const getCustomName = vi.fn(() => customName);
    const renameThread = vi.fn((_workspaceId: string, _threadId: string, title: string) => {
      customName = title;
    });

    const itemsByThreadRef = {
      current: { "thread-1": existingItems },
    };
    const threadsByWorkspaceRef = {
      current: {
        "ws-1": [
          { id: "thread-1", name: threadName, updatedAt: 0 } as ThreadSummary,
        ],
      },
    };

    const { result } = renderHook(() =>
      useThreadTitleAutogeneration({
        enabled,
        itemsByThreadRef,
        threadsByWorkspaceRef,
        getCustomName,
        renameThread,
      }),
    );

    return {
      result,
      getCustomName,
      renameThread,
      setCustomName: (value: string) => {
        customName = value;
      },
    };
  }

  it("generates and persists a title for the first user message in a new thread", async () => {
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Generated Title",
      worktreeName: "feat/generated-title",
    });
    const { result, renameThread } = setup();

    await act(async () => {
      await result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    });

    expect(generateRunMetadata).toHaveBeenCalledWith("ws-1", "Hello there");
    expect(renameThread).toHaveBeenCalledWith("ws-1", "thread-1", "Generated Title");
  });

  it("does nothing when disabled", async () => {
    const { result } = setup({ enabled: false });

    await act(async () => {
      await result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    });

    expect(generateRunMetadata).not.toHaveBeenCalled();
  });

  it("does not override custom names", async () => {
    const { result } = setup({ initialCustomName: "Custom" });

    await act(async () => {
      await result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    });

    expect(generateRunMetadata).not.toHaveBeenCalled();
  });

  it("does not run when a user message already exists", async () => {
    const { result } = setup({
      existingItems: [{ id: "user-1", kind: "message", role: "user", text: "Old" }],
    });

    await act(async () => {
      await result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    });

    expect(generateRunMetadata).not.toHaveBeenCalled();
  });

  it("avoids duplicate generation while in flight", async () => {
    let resolvePromise!: (value: { title: string; worktreeName: string }) => void;
    const pending = new Promise<{ title: string; worktreeName: string }>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(generateRunMetadata).mockReturnValue(pending);

    const { result } = setup();

    const p1 = result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    const p2 = result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there again");

    expect(generateRunMetadata).toHaveBeenCalledTimes(1);

    resolvePromise({ title: "Generated Title", worktreeName: "feat/x" });
    await act(async () => {
      await Promise.all([p1, p2]);
    });
  });

  it("does not override if a custom name appears while generating", async () => {
    let resolvePromise!: (value: { title: string; worktreeName: string }) => void;
    const pending = new Promise<{ title: string; worktreeName: string }>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(generateRunMetadata).mockReturnValue(pending);

    const { result, renameThread, setCustomName } = setup();

    const promise = result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    setCustomName("Manual rename");
    resolvePromise({ title: "Generated Title", worktreeName: "feat/x" });

    await act(async () => {
      await promise;
    });

    expect(renameThread).not.toHaveBeenCalled();
  });
});
