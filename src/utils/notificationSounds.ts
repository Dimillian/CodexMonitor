import type { DebugEntry } from "../types";

type DebugLogger = (entry: DebugEntry) => void;

type SoundLabel = "success" | "error" | "test";

export function playNotificationSound(
  url: string,
  label: SoundLabel,
  onDebug?: DebugLogger,
) {
  try {
    const audio = new Audio(url);
    audio.volume = 0.05;
    audio.preload = "auto";
    audio.addEventListener("error", () => {
      onDebug?.({
        id: `${Date.now()}-audio-${label}-load-error`,
        timestamp: Date.now(),
        source: "error",
        label: `audio/${label} load error`,
        payload: `Failed to load audio: ${url}`,
      });
    });
    void audio.play().catch((error) => {
      onDebug?.({
        id: `${Date.now()}-audio-${label}-play-error`,
        timestamp: Date.now(),
        source: "error",
        label: `audio/${label} play error`,
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
