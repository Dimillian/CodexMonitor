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
    const textareaRef: RefObject<HTMLTextAreaElement> = { current: textarea };
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
    const textareaRef: RefObject<HTMLTextAreaElement> = { current: textarea };
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
});
