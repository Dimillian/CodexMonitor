/** @vitest-environment jsdom */
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { ComposerEditorSettings } from "../../../types";
import { Composer } from "./Composer";

vi.mock("../../../services/dragDrop", () => ({
  subscribeWindowDragDrop: vi.fn(() => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `tauri://${path}`,
}));

type HarnessProps = {
  initialText?: string;
  editorSettings: ComposerEditorSettings;
};

function ComposerHarness({ initialText = "", editorSettings }: HarnessProps) {
  const [draftText, setDraftText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <Composer
      onSend={() => {}}
      onQueue={() => {}}
      onStop={() => {}}
      canStop={false}
      isProcessing={false}
      steerEnabled={false}
      collaborationModes={[]}
      selectedCollaborationModeId={null}
      onSelectCollaborationMode={() => {}}
      models={[]}
      selectedModelId={null}
      onSelectModel={() => {}}
      reasoningOptions={[]}
      selectedEffort={null}
      onSelectEffort={() => {}}
      reasoningSupported={false}
      accessMode="current"
      onSelectAccessMode={() => {}}
      skills={[]}
      prompts={[]}
      files={[]}
      draftText={draftText}
      onDraftChange={setDraftText}
      textareaRef={textareaRef}
      dictationEnabled={false}
      editorSettings={editorSettings}
    />
  );
}

type RenderedHarness = {
  container: HTMLDivElement;
  unmount: () => void;
};

function renderComposerHarness(props: HarnessProps): RenderedHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<ComposerHarness {...props} />);
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function getTextarea(container: HTMLElement) {
  const textarea = container.querySelector("textarea");
  if (!textarea) {
    throw new Error("Textarea not found");
  }
  return textarea;
}

const smartSettings: ComposerEditorSettings = {
  preset: "smart",
  expandFenceOnSpace: true,
  expandFenceOnEnter: false,
  fenceLanguageTags: true,
  fenceWrapSelection: true,
  autoWrapPasteMultiline: true,
  autoWrapPasteCodeLike: true,
  continueListOnShiftEnter: true,
};

describe("Composer editor helpers", () => {
  it("expands ```lang + Space into a fenced block", async () => {
    const harness = renderComposerHarness({
      initialText: "```ts",
      editorSettings: smartSettings,
    });
    const textarea = getTextarea(harness.container);
    textarea.setSelectionRange(5, 5);

    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
    });

    expect(getTextarea(harness.container).value).toBe("```ts\n\n```");

    harness.unmount();
  });

  it("continues numbered lists on Shift+Enter", async () => {
    const harness = renderComposerHarness({
      initialText: "1. First",
      editorSettings: smartSettings,
    });
    const textarea = getTextarea(harness.container);
    textarea.setSelectionRange(8, 8);

    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
        }),
      );
    });

    expect(getTextarea(harness.container).value).toBe("1. First\n2. ");

    harness.unmount();
  });

  it("auto-wraps multi-line paste into a fenced block", async () => {
    const harness = renderComposerHarness({
      editorSettings: smartSettings,
    });
    const textarea = getTextarea(harness.container);
    textarea.setSelectionRange(0, 0);

    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) =>
          type === "text/plain" ? "line one\nline two" : "",
        items: [],
      },
    });

    await act(async () => {
      textarea.dispatchEvent(event);
    });

    expect(getTextarea(harness.container).value).toBe(
      "```\nline one\nline two\n```",
    );

    harness.unmount();
  });
});
