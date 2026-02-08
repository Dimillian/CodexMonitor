/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
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

function renderInput(props: {
  isProcessing: boolean;
  sendLabel: string;
}) {
  return render(
    <ComposerInput
      text="hello"
      disabled={false}
      sendLabel={props.sendLabel}
      canStop={false}
      canSend={true}
      isProcessing={props.isProcessing}
      onStop={() => {}}
      onSend={() => {}}
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
}

describe("ComposerInput processing mode hints", () => {
  it("shows steer and tab queue hints while processing in steer mode", () => {
    renderInput({ isProcessing: true, sendLabel: "Send" });

    expect(screen.getByText("Steer")).toBeTruthy();
    expect(screen.getByText("Agent is working. Enter steers.")).toBeTruthy();
    expect(screen.getByText("queues")).toBeTruthy();
    expect(screen.getByText("Tab")).toBeTruthy();
  });

  it("shows queue mode hint while processing in queue mode", () => {
    renderInput({ isProcessing: true, sendLabel: "Queue" });

    expect(screen.getByText("Queue")).toBeTruthy();
    expect(screen.getByText("Agent is working. Enter queues.")).toBeTruthy();
    expect(screen.queryByText("Agent is working. Enter steers.")).toBeNull();
  });
});
