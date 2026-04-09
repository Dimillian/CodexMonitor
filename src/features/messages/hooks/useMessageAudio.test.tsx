// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateMessageAudioSummary } from "@services/tauri";
import { pushErrorToast } from "@services/toasts";
import { useMessageAudio } from "./useMessageAudio";

vi.mock("@services/tauri", () => ({
  generateMessageAudioSummary: vi.fn(),
}));

vi.mock("@services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

type MockUtteranceInstance = {
  text: string;
  onend: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
};

describe("useMessageAudio", () => {
  let speakMock: ReturnType<typeof vi.fn>;
  let cancelMock: ReturnType<typeof vi.fn>;
  let utterances: MockUtteranceInstance[];
  let originalSpeechSynthesis: SpeechSynthesis | undefined;
  let originalSpeechSynthesisUtterance: typeof SpeechSynthesisUtterance | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    utterances = [];
    speakMock = vi.fn((utterance: MockUtteranceInstance) => {
      utterances.push(utterance);
    });
    cancelMock = vi.fn();
    originalSpeechSynthesis = window.speechSynthesis;
    originalSpeechSynthesisUtterance = globalThis.SpeechSynthesisUtterance;

    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak: speakMock,
        cancel: cancelMock,
      } satisfies Partial<SpeechSynthesis>,
    });

    class MockSpeechSynthesisUtterance {
      text: string;
      onend: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: originalSpeechSynthesis,
    });
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
      configurable: true,
      value: originalSpeechSynthesisUtterance,
    });
  });

  it("speaks full responses and clears active state when playback ends", () => {
    const { result } = renderHook(() =>
      useMessageAudio({
        workspaceId: "ws-1",
        threadId: "thread-1",
        selectedModelId: "gpt-5-codex",
      }),
    );

    act(() => {
      result.current.listenToMessage("msg-1", "Hello world");
    });

    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(utterances[0]?.text).toBe("Hello world");
    expect(result.current.getMessageAudioState("msg-1")).toEqual({
      isActive: true,
      mode: "full",
      status: "speaking",
    });

    act(() => {
      utterances[0]?.onend?.(new Event("end"));
    });

    expect(result.current.getMessageAudioState("msg-1")).toEqual({
      isActive: false,
      mode: null,
      status: "idle",
    });
  });

  it("generates and caches summaries with the selected model", async () => {
    let resolveSummary: ((value: string) => void) | null = null;
    const summaryPromise = new Promise<string>((resolve) => {
      resolveSummary = resolve;
    });
    vi.mocked(generateMessageAudioSummary).mockReturnValueOnce(summaryPromise);

    const { result } = renderHook(() =>
      useMessageAudio({
        workspaceId: "ws-1",
        threadId: "thread-1",
        selectedModelId: "gpt-5-codex",
      }),
    );

    act(() => {
      void result.current.listenToMessageSummary("msg-1", "Long agent response");
    });

    expect(result.current.getMessageAudioState("msg-1")).toEqual({
      isActive: true,
      mode: "summary",
      status: "preparing",
    });

    await act(async () => {
      resolveSummary?.("Short spoken summary");
      await summaryPromise;
    });

    expect(generateMessageAudioSummary).toHaveBeenCalledWith(
      "ws-1",
      "Long agent response",
      "gpt-5-codex",
    );
    expect(utterances[utterances.length - 1]?.text).toBe("Short spoken summary");

    act(() => {
      result.current.stopMessageAudio("msg-1");
    });

    await act(async () => {
      await result.current.listenToMessageSummary("msg-1", "Long agent response");
    });

    expect(generateMessageAudioSummary).toHaveBeenCalledTimes(1);
    expect(utterances[utterances.length - 1]?.text).toBe("Short spoken summary");
  });

  it("cancels active playback when the thread changes", () => {
    const { result, rerender } = renderHook(
      (props: { workspaceId: string | null; threadId: string | null }) =>
        useMessageAudio({
          ...props,
          selectedModelId: "gpt-5-codex",
        }),
      {
        initialProps: {
          workspaceId: "ws-1",
          threadId: "thread-1",
        },
      },
    );

    act(() => {
      result.current.listenToMessage("msg-1", "Hello world");
    });

    rerender({
      workspaceId: "ws-1",
      threadId: "thread-2",
    });

    expect(cancelMock).toHaveBeenCalledTimes(2);
    expect(result.current.getMessageAudioState("msg-1")).toEqual({
      isActive: false,
      mode: null,
      status: "idle",
    });
  });

  it("surfaces an error toast when speech synthesis is unavailable", () => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
      configurable: true,
      value: undefined,
    });

    const { result } = renderHook(() =>
      useMessageAudio({
        workspaceId: "ws-1",
        threadId: "thread-1",
        selectedModelId: "gpt-5-codex",
      }),
    );

    act(() => {
      result.current.listenToMessage("msg-1", "Hello world");
    });

    expect(pushErrorToast).toHaveBeenCalledWith({
      title: "Audio playback unavailable",
      message: "This environment does not support spoken response playback.",
    });
  });
});
