// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMessageEdit } from "./useMessageEdit";

describe("useMessageEdit", () => {
  const onRegenerate = vi.fn().mockResolvedValue(undefined);

  function setup() {
    return renderHook(() => useMessageEdit({ onRegenerate }));
  }

  it("starts in idle state", () => {
    const { result } = setup();
    expect(result.current.editingItemId).toBeNull();
    expect(result.current.editText).toBe("");
    expect(result.current.editImages).toEqual([]);
    expect(result.current.isConfirming).toBe(false);
    expect(result.current.isRegenerating).toBe(false);
  });

  it("enters editing state with startEdit", () => {
    const { result } = setup();
    act(() => {
      result.current.startEdit("item-1", "Hello world", ["img.png"]);
    });
    expect(result.current.editingItemId).toBe("item-1");
    expect(result.current.editText).toBe("Hello world");
    expect(result.current.editImages).toEqual(["img.png"]);
    expect(result.current.isConfirming).toBe(false);
    expect(result.current.isRegenerating).toBe(false);
  });

  it("defaults images to empty array when not provided to startEdit", () => {
    const { result } = setup();
    act(() => {
      result.current.startEdit("item-1", "text");
    });
    expect(result.current.editImages).toEqual([]);
  });

  it("updates edit text via updateEditText", () => {
    const { result } = setup();
    act(() => {
      result.current.startEdit("item-1", "original");
    });
    act(() => {
      result.current.updateEditText("updated");
    });
    expect(result.current.editText).toBe("updated");
  });

  it("ignores updateEditText when not editing", () => {
    const { result } = setup();
    act(() => {
      result.current.updateEditText("should be ignored");
    });
    expect(result.current.editText).toBe("");
    expect(result.current.editingItemId).toBeNull();
  });

  it("returns to idle on cancelEdit", () => {
    const { result } = setup();
    act(() => {
      result.current.startEdit("item-1", "some text");
    });
    act(() => {
      result.current.cancelEdit();
    });
    expect(result.current.editingItemId).toBeNull();
    expect(result.current.editText).toBe("");
    expect(result.current.isConfirming).toBe(false);
    expect(result.current.isRegenerating).toBe(false);
  });

  it("shows confirmation dialog on requestRegenerate", () => {
    const { result } = setup();
    act(() => {
      result.current.startEdit("item-1", "text");
    });
    act(() => {
      result.current.requestRegenerate();
    });
    expect(result.current.isConfirming).toBe(true);
  });

  it("does nothing on requestRegenerate when not editing", () => {
    const { result } = setup();
    act(() => {
      result.current.requestRegenerate();
    });
    expect(result.current.isConfirming).toBe(false);
  });

  it("dismisses confirmation on cancelConfirm", () => {
    const { result } = setup();
    act(() => {
      result.current.startEdit("item-1", "text");
    });
    act(() => {
      result.current.requestRegenerate();
    });
    act(() => {
      result.current.cancelConfirm();
    });
    expect(result.current.isConfirming).toBe(false);
    expect(result.current.editingItemId).toBe("item-1");
  });

  it("calls onRegenerate and resets state on executeRegenerate", async () => {
    onRegenerate.mockClear();
    const { result } = setup();
    act(() => {
      result.current.startEdit("item-1", "  revised text  ", ["img.png"]);
    });
    await act(async () => {
      await result.current.executeRegenerate();
    });
    expect(onRegenerate).toHaveBeenCalledWith("item-1", "revised text", ["img.png"]);
    expect(result.current.editingItemId).toBeNull();
    expect(result.current.isRegenerating).toBe(false);
  });

  it("does nothing on executeRegenerate when not editing", async () => {
    onRegenerate.mockClear();
    const { result } = setup();
    await act(async () => {
      await result.current.executeRegenerate();
    });
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it("rejects empty text on executeRegenerate", async () => {
    onRegenerate.mockClear();
    const { result } = setup();
    act(() => {
      result.current.startEdit("item-1", "   ");
    });
    await act(async () => {
      await result.current.executeRegenerate();
    });
    expect(onRegenerate).not.toHaveBeenCalled();
    // State should still be editing (not cleared) since the guard blocked it
    expect(result.current.editingItemId).toBe("item-1");
  });

  it("resets state even if onRegenerate throws", async () => {
    const failingRegenerate = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() =>
      useMessageEdit({ onRegenerate: failingRegenerate }),
    );
    act(() => {
      result.current.startEdit("item-1", "text");
    });
    await act(async () => {
      await result.current.executeRegenerate().catch(() => {});
    });
    expect(result.current.editingItemId).toBeNull();
    expect(result.current.isRegenerating).toBe(false);
  });

  it("resets confirming and regenerating when a new edit starts", () => {
    const { result } = setup();
    act(() => {
      result.current.startEdit("item-1", "text");
    });
    act(() => {
      result.current.requestRegenerate();
    });
    expect(result.current.isConfirming).toBe(true);
    act(() => {
      result.current.startEdit("item-2", "other text");
    });
    expect(result.current.editingItemId).toBe("item-2");
    expect(result.current.isConfirming).toBe(false);
    expect(result.current.isRegenerating).toBe(false);
  });
});
