/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposerInput } from "./ComposerInput";

vi.mock("../../../services/dragDrop", () => ({
  subscribeWindowDragDrop: vi.fn(() => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `tauri://${path}`,
}));

afterEach(() => {
  cleanup();
});

describe("ComposerInput dictation controls", () => {
  it("uses the mic control to cancel transcription while processing", () => {
    const onToggleDictation = vi.fn();
    const onCancelDictation = vi.fn();
    const onOpenDictationSettings = vi.fn();
    render(
      <ComposerInput
        text=""
        disabled={false}
        sendLabel="Send"
        canStop={false}
        canSend={false}
        isProcessing={false}
        onStop={() => {}}
        onSend={() => {}}
        dictationState="processing"
        dictationEnabled={true}
        onToggleDictation={onToggleDictation}
        onCancelDictation={onCancelDictation}
        onOpenDictationSettings={onOpenDictationSettings}
        onTextChange={() => {}}
        onSelectionChange={() => {}}
        onKeyDown={() => {}}
        textareaRef={createRef<HTMLTextAreaElement>()}
        suggestionsOpen={false}
        suggestions={[]}
        highlightIndex={0}
        onHighlightIndex={() => {}}
        onSelectSuggestion={() => {}}
      />,
    );

    const cancelButton = screen.getByRole("button", {
      name: "Cancel transcription",
    });
    fireEvent.click(cancelButton);

    expect(onCancelDictation).toHaveBeenCalledTimes(1);
    expect(onToggleDictation).not.toHaveBeenCalled();
    expect(onOpenDictationSettings).not.toHaveBeenCalled();
  });
});
