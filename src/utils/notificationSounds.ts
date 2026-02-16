import type { DebugEntry } from "../types";

type DebugLogger = (entry: DebugEntry) => void;

type SoundLabel = "success" | "error" | "test";

type AudioContextConstructor = new () => AudioContext;

let audioContext: AudioContext | null = null;

function resolveAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  return (window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?: AudioContextConstructor;
      }
    ).webkitAudioContext ??
    null);
}

function getAudioContext(): AudioContext {
  if (audioContext && audioContext.state !== "closed") {
    return audioContext;
  }

  const AudioContextImpl = resolveAudioContextConstructor();
  if (!AudioContextImpl) {
    throw new Error("Web Audio API is not available in this environment");
  }

  audioContext = new AudioContextImpl();
  return audioContext;
}

export function playNotificationSound(
  url: string,
  label: SoundLabel,
  onDebug?: DebugLogger,
) {
  try {
    const ctx = getAudioContext();

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    void fetch(url)
      .then((response) => response.arrayBuffer())
      .then((audioFileBuffer) => ctx.decodeAudioData(audioFileBuffer))
      .then((audioBuffer) => {
        const source = ctx.createBufferSource();
        const gainNode = ctx.createGain();

        gainNode.gain.value = 0.05;
        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start();
      })
      .catch((error) => {
        onDebug?.({
          id: `${Date.now()}-audio-${label}-load-or-play-error`,
          timestamp: Date.now(),
          source: "error",
          label: `audio/${label} load/play error`,
          payload: error instanceof Error ? error.message : String(error),
        });
      });
  } catch (error) {
    onDebug?.({
      id: `${Date.now()}-audio-${label}-init-error`,
      timestamp: Date.now(),
      source: "error",
      label: `audio/${label} init error`,
      payload: error instanceof Error ? error.message : String(error),
    });
  }
}
