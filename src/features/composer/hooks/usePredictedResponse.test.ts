/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ConversationItem, ModelOption } from "../../../types";
import { usePredictedResponse } from "./usePredictedResponse";

const mockPredictResponse = vi.fn<(workspaceId: string, context: string, model?: string) => Promise<string>>();

vi.mock("../../../services/tauri", () => ({
  predictResponse: (...args: [string, string, string | undefined]) =>
    mockPredictResponse(...args),
}));

type HookResult = ReturnType<typeof usePredictedResponse>;

type Props = Parameters<typeof usePredictedResponse>[0];

type RenderedHook = {
  result: HookResult;
  rerender: (next: Partial<Props>) => void;
  unmount: () => void;
};

function createDeferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: (value: T) => resolve?.(value),
    reject: (reason?: unknown) => reject?.(reason),
  };
}

function makeModel(overrides: Partial<ModelOption> = {}): ModelOption {
  return {
    id: "model-1",
    model: "default-model",
    displayName: "Default Model",
    description: "",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: true,
    ...overrides,
  };
}

function makeMessage(
  role: "user" | "assistant",
  text: string,
): ConversationItem {
  return { id: crypto.randomUUID(), kind: "message", role, text };
}

const defaultProps: Props = {
  workspaceId: "ws-1",
  threadId: "thread-1",
  composerText: "",
  disabled: false,
  isProcessing: false,
  items: [makeMessage("assistant", "What should I do next?")],
  models: [makeModel()],
};

function renderHook(initial?: Partial<Props>): RenderedHook {
  let props: Props = { ...defaultProps, ...initial };
  let result: HookResult | undefined;

  function Test() {
    result = usePredictedResponse(props);
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
      if (!result) throw new Error("Hook not rendered");
      return result;
    },
    rerender: (next: Partial<Props>) => {
      props = { ...props, ...next };
      act(() => {
        root.render(React.createElement(Test));
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  mockPredictResponse.mockReset();
});

describe("usePredictedResponse", () => {
  it("triggers prediction on isProcessing true → false", async () => {
    mockPredictResponse.mockResolvedValue("do it");

    const hook = renderHook({ isProcessing: true });
    expect(hook.result.ghostText).toBeNull();

    await act(async () => {
      hook.rerender({ isProcessing: false });
    });

    expect(mockPredictResponse).toHaveBeenCalledOnce();
    expect(hook.result.ghostText).toBe("do it");
    hook.unmount();
  });

  it("does not trigger when isProcessing stays false", () => {
    const hook = renderHook({ isProcessing: false });
    hook.rerender({ isProcessing: false });
    expect(mockPredictResponse).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("filters out NONE responses", async () => {
    mockPredictResponse.mockResolvedValue("NONE");

    const hook = renderHook({ isProcessing: true });
    await act(async () => {
      hook.rerender({ isProcessing: false });
    });

    expect(hook.result.ghostText).toBeNull();
    hook.unmount();
  });

  it("filters out case-variant none responses", async () => {
    mockPredictResponse.mockResolvedValue("  None  ");

    const hook = renderHook({ isProcessing: true });
    await act(async () => {
      hook.rerender({ isProcessing: false });
    });

    expect(hook.result.ghostText).toBeNull();
    hook.unmount();
  });

  it("dismisses ghost text when user types", async () => {
    mockPredictResponse.mockResolvedValue("yes");

    const hook = renderHook({ isProcessing: true });
    await act(async () => {
      hook.rerender({ isProcessing: false });
    });
    expect(hook.result.ghostText).toBe("yes");

    hook.rerender({ composerText: "h" });
    expect(hook.result.ghostText).toBeNull();
    hook.unmount();
  });

  it("resets state on thread change", async () => {
    mockPredictResponse.mockResolvedValue("yes");

    const hook = renderHook({ isProcessing: true });
    await act(async () => {
      hook.rerender({ isProcessing: false });
    });
    expect(hook.result.ghostText).toBe("yes");

    hook.rerender({ threadId: "thread-2" });
    expect(hook.result.ghostText).toBeNull();
    hook.unmount();
  });

  it("resets state on workspace change", async () => {
    mockPredictResponse.mockResolvedValue("yes");

    const hook = renderHook({ isProcessing: true });
    await act(async () => {
      hook.rerender({ isProcessing: false });
    });
    expect(hook.result.ghostText).toBe("yes");

    hook.rerender({ workspaceId: "ws-2" });
    expect(hook.result.ghostText).toBeNull();
    hook.unmount();
  });

  it("does not fire prediction after thread switch during processing", async () => {
    const hook = renderHook({ isProcessing: true });

    // Switch thread and stop processing in the same render — wasProcessingRef
    // was reset by the thread-change effect so the true→false transition
    // should not be detected.
    hook.rerender({ threadId: "thread-2", isProcessing: false });

    expect(mockPredictResponse).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("acceptPrediction returns text and clears ghost", async () => {
    mockPredictResponse.mockResolvedValue("run tests");

    const hook = renderHook({ isProcessing: true });
    await act(async () => {
      hook.rerender({ isProcessing: false });
    });
    expect(hook.result.ghostText).toBe("run tests");

    let accepted: string | null = null;
    act(() => {
      accepted = hook.result.acceptPrediction();
    });
    expect(accepted).toBe("run tests");
    expect(hook.result.ghostText).toBeNull();
    hook.unmount();
  });

  it("picks spark model over mini", () => {
    mockPredictResponse.mockResolvedValue("yes");
    const models = [
      makeModel({ id: "m-1", model: "gpt-mini-2", displayName: "Mini" }),
      makeModel({ id: "m-2", model: "spark-v1", displayName: "Spark" }),
    ];

    const hook = renderHook({ isProcessing: true, models });
    act(() => {
      hook.rerender({ isProcessing: false, models });
    });

    expect(mockPredictResponse).toHaveBeenCalledWith("ws-1", expect.any(String), "m-2");
    hook.unmount();
  });

  it("falls back to mini when no spark available", () => {
    mockPredictResponse.mockResolvedValue("yes");
    const models = [
      makeModel({ id: "m-1", model: "gpt-mini-2", displayName: "Mini" }),
      makeModel({ id: "m-3", model: "large-v4", displayName: "Large" }),
    ];

    const hook = renderHook({ isProcessing: true, models });
    act(() => {
      hook.rerender({ isProcessing: false, models });
    });

    expect(mockPredictResponse).toHaveBeenCalledWith("ws-1", expect.any(String), "m-1");
    hook.unmount();
  });

  it("passes undefined model when no spark or mini available", () => {
    mockPredictResponse.mockResolvedValue("yes");
    const models = [
      makeModel({ id: "m-1", model: "large-v4", displayName: "Large" }),
    ];

    const hook = renderHook({ isProcessing: true, models });
    act(() => {
      hook.rerender({ isProcessing: false, models });
    });

    expect(mockPredictResponse).toHaveBeenCalledWith("ws-1", expect.any(String), undefined);
    hook.unmount();
  });

  it("does not trigger when disabled", () => {
    const hook = renderHook({ isProcessing: true, disabled: true });
    hook.rerender({ isProcessing: false, disabled: true });
    expect(mockPredictResponse).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("does not trigger with empty items", () => {
    const hook = renderHook({ isProcessing: true, items: [] });
    hook.rerender({ isProcessing: false, items: [] });
    expect(mockPredictResponse).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("does not trigger prediction when composer already has draft text", () => {
    const hook = renderHook({ isProcessing: true, composerText: "draft" });
    hook.rerender({ isProcessing: false, composerText: "draft" });
    expect(mockPredictResponse).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("invalidates in-flight prediction when typing dismisses suggestion", async () => {
    const deferred = createDeferred<string>();
    mockPredictResponse.mockReturnValueOnce(deferred.promise);

    const hook = renderHook({ isProcessing: true, composerText: "" });
    await act(async () => {
      hook.rerender({ isProcessing: false, composerText: "" });
    });

    expect(mockPredictResponse).toHaveBeenCalledOnce();
    hook.rerender({ composerText: "typing" });
    expect(hook.result.ghostText).toBeNull();

    await act(async () => {
      deferred.resolve("stale suggestion");
      await deferred.promise;
    });

    hook.rerender({ composerText: "" });
    expect(hook.result.ghostText).toBeNull();
    hook.unmount();
  });
});
