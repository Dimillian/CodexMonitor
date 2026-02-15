/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isMobilePlatform } from "../../../utils/platformPaths";
import { Composer } from "./Composer";

vi.mock("../../../services/dragDrop", () => ({
  subscribeWindowDragDrop: vi.fn(() => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `tauri://${path}`,
}));

vi.mock("../../../utils/platformPaths", async () => {
  const actual = await vi.importActual<typeof import("../../../utils/platformPaths")>(
    "../../../utils/platformPaths",
  );
  return {
    ...actual,
    isMobilePlatform: vi.fn(() => false),
  };
});

type HarnessProps = {
  onSend: (text: string, images: string[]) => void;
  onQueue?: (text: string, images: string[]) => void;
  onStop?: () => void;
  canStop?: boolean;
  isProcessing?: boolean;
  steerEnabled?: boolean;
  sendLabel?: string;
  messageFontSize?: number;
  onMessageFontSizeChange?: (next: number) => void;
  continueModeEnabled?: boolean;
  onContinueModeEnabledChange?: (next: boolean) => void;
  continuePrompt?: string;
  onContinuePromptChange?: (next: string) => void;
  files?: string[];
};

function ComposerHarness({
  onSend,
  onQueue = () => {},
  onStop = () => {},
  canStop = false,
  isProcessing = false,
  steerEnabled = false,
  sendLabel = "发送",
  messageFontSize = 13,
  onMessageFontSizeChange,
  continueModeEnabled = false,
  onContinueModeEnabledChange,
  continuePrompt = "",
  onContinuePromptChange,
  files = [],
}: HarnessProps) {
  const [draftText, setDraftText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <Composer
      onSend={onSend}
      onQueue={onQueue}
      onStop={onStop}
      canStop={canStop}
      isProcessing={isProcessing}
      appsEnabled={true}
      steerEnabled={steerEnabled}
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
      skills={[]}
      apps={[]}
      prompts={[]}
      files={files}
      sendLabel={sendLabel}
      draftText={draftText}
      onDraftChange={setDraftText}
      textareaRef={textareaRef}
      dictationEnabled={false}
      messageFontSize={messageFontSize}
      onMessageFontSizeChange={onMessageFontSizeChange}
      continueModeEnabled={continueModeEnabled}
      onContinueModeEnabledChange={onContinueModeEnabledChange}
      continuePrompt={continuePrompt}
      onContinuePromptChange={onContinuePromptChange}
    />
  );
}

describe("Composer send triggers", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(isMobilePlatform).mockReturnValue(false);
    vi.restoreAllMocks();
  });

  it("sends once on Enter", () => {
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} />);

    const textarea = screen.getAllByRole("textbox")[0];
    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("hello world", []);
  });

  it("still sends when prompt history persistence fails for long text", () => {
    const onSend = vi.fn();
    const longText = "x".repeat(120_000);
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    render(<ComposerHarness onSend={onSend} />);

    const textarea = screen.getAllByRole("textbox")[0];
    fireEvent.change(textarea, { target: { value: longText } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(setItemSpy).toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(longText, []);
  });

  it("sends once on send-button click", () => {
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} />);

    const textarea = screen.getAllByRole("textbox")[0];
    fireEvent.change(textarea, { target: { value: "from button" } });
    fireEvent.click(screen.getByLabelText("发送"));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("from button", []);
  });

  it("blurs the textarea after Enter send on mobile", () => {
    vi.mocked(isMobilePlatform).mockReturnValue(true);
    const onSend = vi.fn();
    const blurSpy = vi.spyOn(HTMLTextAreaElement.prototype, "blur");
    render(<ComposerHarness onSend={onSend} />);

    const textarea = screen.getAllByRole("textbox")[0];
    fireEvent.change(textarea, { target: { value: "dismiss keyboard" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("dismiss keyboard", []);
    expect(blurSpy).toHaveBeenCalledTimes(1);
  });

  it("sends on Enter when autocomplete is open but has no matches", () => {
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} files={[]} />);

    const textarea = screen.getAllByRole("textbox")[0];
    fireEvent.change(textarea, { target: { value: "@missing-path" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("@missing-path", []);
  });

  it("queues on action-button click instead of interrupting in queue mode", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        onStop={onStop}
        canStop={true}
        isProcessing={true}
        steerEnabled={false}
        sendLabel="Queue"
      />,
    );

    const textarea = screen.getAllByRole("textbox")[0];
    fireEvent.change(textarea, { target: { value: "queued while processing" } });
    fireEvent.click(screen.getByLabelText("Queue"));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("queued while processing", []);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("queues on action-button click in steer mode while processing", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        onStop={onStop}
        canStop={true}
        isProcessing={true}
        steerEnabled={true}
        sendLabel="Queue"
      />,
    );

    const textarea = screen.getAllByRole("textbox")[0];
    fireEvent.change(textarea, { target: { value: "queue in steer mode" } });
    fireEvent.click(screen.getByLabelText("Queue"));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("queue in steer mode", []);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("changes message font size from composer footer slider", () => {
    const onSend = vi.fn();
    const onMessageFontSizeChange = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        messageFontSize={13}
        onMessageFontSizeChange={onMessageFontSizeChange}
      />,
    );

    const slider = screen.getByLabelText("消息字号");
    fireEvent.change(slider, { target: { value: "15" } });

    expect(onMessageFontSizeChange).toHaveBeenCalledWith(15);
  });

  it("changes continue mode and prompt from composer footer controls", () => {
    const onSend = vi.fn();
    const onContinueModeEnabledChange = vi.fn();
    const onContinuePromptChange = vi.fn();

    render(
      <ComposerHarness
        onSend={onSend}
        continueModeEnabled={false}
        onContinueModeEnabledChange={onContinueModeEnabledChange}
        continuePrompt="请继续完成我和你讨论的Plan！"
        onContinuePromptChange={onContinuePromptChange}
      />,
    );

    const toggle = screen.getByLabelText("Continue 模式");
    fireEvent.click(toggle);
    expect(onContinueModeEnabledChange).toHaveBeenCalledWith(true);

    const prompt = screen.getByLabelText("Continue 提示词");
    fireEvent.change(prompt, { target: { value: "继续执行当前任务计划" } });
    expect(onContinuePromptChange).toHaveBeenCalledWith("继续执行当前任务计划");
  });
});
