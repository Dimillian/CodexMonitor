// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RefObject } from "react";
import { useComposerInsert } from "./useComposerInsert";

describe("useComposerInsert", () => {
  it("inserts text when enabled", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "Hello";
    textarea.selectionStart = 5;
    textarea.selectionEnd = 5;
    const textareaRef: RefObject<HTMLTextAreaElement | null> = { current: textarea };
    const onDraftChange = vi.fn();

    const { result } = renderHook(() =>
      useComposerInsert({
        isEnabled: true,
        draftText: "Hello",
        onDraftChange,
        textareaRef,
      }),
    );

    act(() => {
      result.current("./src");
    });

    expect(onDraftChange).toHaveBeenCalledWith("Hello ./src");
  });

  it("does nothing when disabled", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "Hello";
    textarea.selectionStart = 5;
    textarea.selectionEnd = 5;
    const textareaRef: RefObject<HTMLTextAreaElement | null> = { current: textarea };
    const onDraftChange = vi.fn();

    const { result } = renderHook(() =>
      useComposerInsert({
        isEnabled: false,
        draftText: "Hello",
        onDraftChange,
        textareaRef,
      }),
    );

    act(() => {
      result.current("./src");
    });

    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("keeps callback stable across draft changes and uses latest draft", () => {
    const textareaRef: RefObject<HTMLTextAreaElement | null> = { current: null };
    const onDraftChange = vi.fn();

    const { result, rerender } = renderHook(
      ({ draftText }) =>
        useComposerInsert({
          isEnabled: true,
          draftText,
          onDraftChange,
          textareaRef,
        }),
      {
        initialProps: { draftText: "Hello" },
      },
    );

    const initialCallback = result.current;
    rerender({ draftText: "Hello world" });
    expect(result.current).toBe(initialCallback);

    act(() => {
      result.current("./src");
    });

    expect(onDraftChange).toHaveBeenCalledWith("Hello world ./src");
  });

  it("focuses textarea immediately and reapplies caret after frame", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "Hello";
    textarea.selectionStart = 5;
    textarea.selectionEnd = 5;
    const textareaRef: RefObject<HTMLTextAreaElement | null> = { current: textarea };
    const onDraftChange = vi.fn();

    const focusSpy = vi.spyOn(textarea, "focus");
    const setSelectionRangeSpy = vi.spyOn(textarea, "setSelectionRange");
    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return 1;
    });

    const { result } = renderHook(() =>
      useComposerInsert({
        isEnabled: true,
        draftText: "Hello",
        onDraftChange,
        textareaRef,
      }),
    );

    act(() => {
      result.current("./src");
    });

    expect(onDraftChange).toHaveBeenCalledWith("Hello ./src");
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(rafCallbacks).toHaveLength(1);

    act(() => {
      rafCallbacks[0](0);
    });

    expect(focusSpy).toHaveBeenCalledTimes(2);
    expect(setSelectionRangeSpy).toHaveBeenLastCalledWith(
      "Hello ./src".length,
      "Hello ./src".length,
    );

    rafSpy.mockRestore();
  });
});
