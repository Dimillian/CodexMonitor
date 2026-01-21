/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceDropZone } from "./useWorkspaceDropZone";

let mockOnDragDropEvent:
  | ((event: {
      payload: {
        type: "enter" | "over" | "leave" | "drop";
        position: { x: number; y: number };
        paths?: string[];
      };
    }) => void)
  | null = null;

vi.mock("../../../services/dragDrop", () => ({
  subscribeWindowDragDrop: (handler: typeof mockOnDragDropEvent) => {
    mockOnDragDropEvent = handler;
    return () => {};
  },
}));

type HookResult = ReturnType<typeof useWorkspaceDropZone>;

type RenderedHook = {
  result: HookResult;
  unmount: () => void;
};

function renderDropHook(options: {
  disabled?: boolean;
  onDropPaths: (paths: string[]) => void | Promise<void>;
}): RenderedHook {
  let result: HookResult | undefined;

  function Test() {
    result = useWorkspaceDropZone(options);
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
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("useWorkspaceDropZone", () => {
  beforeEach(() => {
    mockOnDragDropEvent = null;
  });

  it("tracks drag over state for file transfers", () => {
    const hook = renderDropHook({ onDropPaths: () => {} });
    const preventDefault = vi.fn();

    act(() => {
      hook.result.handleDragOver({
        dataTransfer: { types: ["Files"], items: [] },
        preventDefault,
      } as unknown as React.DragEvent<HTMLElement>);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(hook.result.isDragOver).toBe(true);

    act(() => {
      hook.result.handleDragLeave({} as React.DragEvent<HTMLElement>);
    });

    expect(hook.result.isDragOver).toBe(false);

    hook.unmount();
  });

  it("emits file paths on drop when available", () => {
    const onDropPaths = vi.fn();
    const hook = renderDropHook({ onDropPaths });
    const file = new File(["data"], "project", { type: "application/octet-stream" });
    (file as File & { path?: string }).path = "/tmp/project";

    act(() => {
      hook.result.handleDrop({
        dataTransfer: { files: [file], items: [] },
        preventDefault: () => {},
      } as unknown as React.DragEvent<HTMLElement>);
    });

    expect(onDropPaths).toHaveBeenCalledWith(["/tmp/project"]);

    hook.unmount();
  });
});
