/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useComposerImages } from "./useComposerImages";

vi.mock("../../../services/tauri", () => ({
  pickImageFiles: vi.fn().mockResolvedValue([]),
}));

type HookResult = ReturnType<typeof useComposerImages>;

type RenderedHook = {
  result: HookResult;
  rerender: (next: { activeThreadId: string | null; activeWorkspaceId: string | null }) => void;
  unmount: () => void;
};

function renderComposerImages(
  initial: { activeThreadId: string | null; activeWorkspaceId: string | null },
): RenderedHook {
  let props = initial;
  let result: HookResult | undefined;

  function Test() {
    result = useComposerImages(props);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(Test));
  });

  return {
    get result() {
      if (!result) {
        throw new Error("Hook not rendered");
      }
      return result;
    },
    rerender: (next) => {
      props = next;
      act(() => {
        root.render(React.createElement(Test));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("useComposerImages", () => {
  it("attaches images and deduplicates paths", () => {
    const hook = renderComposerImages({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });

    act(() => {
      hook.result.attachImages(["/tmp/a.png", "/tmp/b.png"]);
    });

    expect(hook.result.activeImages).toEqual(["/tmp/a.png", "/tmp/b.png"]);

    act(() => {
      hook.result.attachImages(["/tmp/b.png", "/tmp/c.png"]);
    });

    expect(hook.result.activeImages).toEqual([
      "/tmp/a.png",
      "/tmp/b.png",
      "/tmp/c.png",
    ]);

    hook.unmount();
  });

  it("removes images and clears empty drafts", () => {
    const hook = renderComposerImages({
      activeThreadId: "thread-2",
      activeWorkspaceId: "ws-1",
    });

    act(() => {
      hook.result.attachImages(["/tmp/a.png", "/tmp/b.png"]);
    });

    act(() => {
      hook.result.removeImage("/tmp/a.png");
    });

    expect(hook.result.activeImages).toEqual(["/tmp/b.png"]);

    act(() => {
      hook.result.removeImage("/tmp/b.png");
    });

    expect(hook.result.activeImages).toEqual([]);

    hook.unmount();
  });

  it("switches drafts between thread and workspace", () => {
    const hook = renderComposerImages({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });

    act(() => {
      hook.result.attachImages(["/tmp/a.png"]);
    });
    expect(hook.result.activeImages).toEqual(["/tmp/a.png"]);

    hook.rerender({ activeThreadId: null, activeWorkspaceId: "ws-1" });
    expect(hook.result.activeImages).toEqual([]);

    act(() => {
      hook.result.attachImages(["/tmp/b.png"]);
    });
    expect(hook.result.activeImages).toEqual(["/tmp/b.png"]);

    hook.rerender({ activeThreadId: "thread-1", activeWorkspaceId: "ws-1" });
    expect(hook.result.activeImages).toEqual(["/tmp/a.png"]);

    hook.unmount();
  });
});
