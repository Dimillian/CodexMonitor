import { useCallback, useEffect, useRef, useState } from "react";
import { generateMessageAudioSummary } from "@services/tauri";
import { pushErrorToast } from "@services/toasts";

export type MessageAudioMode = "full" | "summary";
export type MessageAudioStatus = "idle" | "preparing" | "speaking";

type ActivePlayback = {
  messageId: string | null;
  mode: MessageAudioMode | null;
  status: MessageAudioStatus;
};

export type MessageAudioState = {
  isActive: boolean;
  mode: MessageAudioMode | null;
  status: MessageAudioStatus;
};

type UseMessageAudioArgs = {
  workspaceId: string | null;
  threadId: string | null;
  selectedModelId?: string | null;
};

const MAX_SPEECH_CHUNK_LENGTH = 900;
const IDLE_PLAYBACK: ActivePlayback = {
  messageId: null,
  mode: null,
  status: "idle",
};

function resolveSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (typeof SpeechSynthesisUtterance !== "function") {
    return null;
  }
  return window.speechSynthesis ?? null;
}

function normalizeSpeechText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitWordsToMaxLength(text: string, maxChunkLength: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChunkLength && current) {
      chunks.push(current);
      current = word;
      continue;
    }
    current = candidate;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function splitParagraphToChunks(paragraph: string, maxChunkLength: number): string[] {
  if (paragraph.length <= maxChunkLength) {
    return [paragraph];
  }

  const sentences = paragraph
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return splitWordsToMaxLength(paragraph, maxChunkLength);
  }

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > maxChunkLength) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...splitWordsToMaxLength(sentence, maxChunkLength));
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChunkLength && current) {
      chunks.push(current);
      current = sentence;
      continue;
    }
    current = candidate;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

export function splitSpeechText(
  text: string,
  maxChunkLength: number = MAX_SPEECH_CHUNK_LENGTH,
): string[] {
  const normalized = normalizeSpeechText(text);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => splitParagraphToChunks(paragraph, maxChunkLength));
}

function buildSummaryCacheKey({
  workspaceId,
  threadId,
  messageId,
  modelId,
}: {
  workspaceId: string | null;
  threadId: string | null;
  messageId: string;
  modelId: string | null | undefined;
}) {
  return [workspaceId ?? "no-workspace", threadId ?? "no-thread", messageId, modelId ?? "default"]
    .join("::");
}

export function useMessageAudio({
  workspaceId,
  threadId,
  selectedModelId = null,
}: UseMessageAudioArgs) {
  const [playback, setPlayback] = useState<ActivePlayback>(IDLE_PLAYBACK);
  const playbackRef = useRef(playback);
  const requestTokenRef = useRef(0);
  const summaryCacheRef = useRef<Map<string, string>>(new Map());
  const previousWorkspaceIdRef = useRef(workspaceId);
  const previousThreadIdRef = useRef(threadId);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  const setIdlePlayback = useCallback(() => {
    setPlayback(IDLE_PLAYBACK);
  }, []);

  const cancelSpeech = useCallback(() => {
    const synthesis = resolveSpeechSynthesis();
    if (!synthesis) {
      return;
    }
    try {
      synthesis.cancel();
    } catch {
      // Some runtimes can throw here; cancelation is best effort.
    }
  }, []);

  const cancelActivePlayback = useCallback(() => {
    requestTokenRef.current += 1;
    cancelSpeech();
    setIdlePlayback();
  }, [cancelSpeech, setIdlePlayback]);

  const reportUnavailable = useCallback(() => {
    pushErrorToast({
      title: "Audio playback unavailable",
      message: "This environment does not support spoken response playback.",
    });
  }, []);

  const startSpeaking = useCallback(
    (messageId: string, mode: MessageAudioMode, text: string, token: number) => {
      const synthesis = resolveSpeechSynthesis();
      if (!synthesis) {
        reportUnavailable();
        setIdlePlayback();
        return;
      }

      const chunks = splitSpeechText(text);
      if (chunks.length === 0) {
        setIdlePlayback();
        return;
      }

      setPlayback({
        messageId,
        mode,
        status: "speaking",
      });

      const speakChunk = (index: number) => {
        if (requestTokenRef.current !== token) {
          return;
        }

        if (index >= chunks.length) {
          setIdlePlayback();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        utterance.onend = () => {
          if (requestTokenRef.current !== token) {
            return;
          }
          speakChunk(index + 1);
        };
        utterance.onerror = () => {
          if (requestTokenRef.current !== token) {
            return;
          }
          pushErrorToast({
            title: "Audio playback failed",
            message: "The spoken response could not be played.",
          });
          setIdlePlayback();
        };

        try {
          synthesis.speak(utterance);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "The spoken response could not be played.";
          pushErrorToast({
            title: "Audio playback failed",
            message,
          });
          setIdlePlayback();
        }
      };

      speakChunk(0);
    },
    [reportUnavailable, setIdlePlayback],
  );

  const listenToMessage = useCallback(
    (messageId: string, speakableText: string) => {
      const token = requestTokenRef.current + 1;
      requestTokenRef.current = token;
      cancelSpeech();
      startSpeaking(messageId, "full", speakableText, token);
    },
    [cancelSpeech, startSpeaking],
  );

  const listenToMessageSummary = useCallback(
    async (messageId: string, responseText: string) => {
      if (!workspaceId) {
        pushErrorToast({
          title: "Response summary unavailable",
          message: "A workspace must be active before generating a response summary.",
        });
        return;
      }

      const token = requestTokenRef.current + 1;
      requestTokenRef.current = token;
      cancelSpeech();
      setPlayback({
        messageId,
        mode: "summary",
        status: "preparing",
      });

      const cacheKey = buildSummaryCacheKey({
        workspaceId,
        threadId,
        messageId,
        modelId: selectedModelId,
      });
      const cachedSummary = summaryCacheRef.current.get(cacheKey);
      if (cachedSummary) {
        startSpeaking(messageId, "summary", cachedSummary, token);
        return;
      }

      try {
        const summary = await generateMessageAudioSummary(
          workspaceId,
          responseText,
          selectedModelId,
        );
        if (requestTokenRef.current !== token) {
          return;
        }
        summaryCacheRef.current.set(cacheKey, summary);
        startSpeaking(messageId, "summary", summary, token);
      } catch (error) {
        if (requestTokenRef.current !== token) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "The response summary could not be generated.";
        pushErrorToast({
          title: "Response summary failed",
          message,
        });
        setIdlePlayback();
      }
    },
    [
      cancelSpeech,
      selectedModelId,
      setIdlePlayback,
      startSpeaking,
      threadId,
      workspaceId,
    ],
  );

  const stopMessageAudio = useCallback(
    (messageId?: string) => {
      if (messageId && playbackRef.current.messageId !== messageId) {
        return;
      }
      cancelActivePlayback();
    },
    [cancelActivePlayback],
  );

  useEffect(() => {
    const workspaceChanged = previousWorkspaceIdRef.current !== workspaceId;
    const threadChanged = previousThreadIdRef.current !== threadId;
    previousWorkspaceIdRef.current = workspaceId;
    previousThreadIdRef.current = threadId;

    if (workspaceChanged || threadChanged) {
      cancelActivePlayback();
    }
  }, [cancelActivePlayback, threadId, workspaceId]);

  useEffect(
    () => () => {
      requestTokenRef.current += 1;
      cancelSpeech();
    },
    [cancelSpeech],
  );

  const getMessageAudioState = useCallback(
    (messageId: string): MessageAudioState => {
      if (playback.messageId !== messageId) {
        return {
          isActive: false,
          mode: null,
          status: "idle",
        };
      }
      return {
        isActive: true,
        mode: playback.mode,
        status: playback.status,
      };
    },
    [playback],
  );

  return {
    getMessageAudioState,
    listenToMessage,
    listenToMessageSummary,
    stopMessageAudio,
  };
}
