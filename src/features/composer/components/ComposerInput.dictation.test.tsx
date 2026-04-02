/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import i18n from "i18next";
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
  void i18n.changeLanguage("en");
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

  it("localizes the placeholder and action labels", async () => {
    await act(async () => {
      await i18n.changeLanguage("zh");
    });
    render(
      <ComposerInput
        text=""
        disabled={false}
        sendLabel="发送"
        canStop={true}
        canSend={true}
        isProcessing={true}
        onStop={() => {}}
        onSend={() => {}}
        dictationState="idle"
        dictationEnabled={true}
        onToggleDictation={() => {}}
        onTextChange={() => {}}
        onSelectionChange={() => {}}
        onKeyDown={() => {}}
        onAddAttachment={() => {}}
        isExpanded={false}
        onToggleExpand={() => {}}
        textareaRef={createRef<HTMLTextAreaElement>()}
        suggestionsOpen={false}
        suggestions={[]}
        highlightIndex={0}
        onHighlightIndex={() => {}}
        onSelectSuggestion={() => {}}
      />,
    );

    expect(screen.getByPlaceholderText("让 Codex 执行某项操作...")).toBeTruthy();
    expect(screen.getByRole("button", { name: "添加图片" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "更多操作" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "展开输入框" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "停止" })).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });
});
