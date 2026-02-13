export const CHAT_SCROLLBACK_DEFAULT = 200;
export const CHAT_SCROLLBACK_MIN = 50;
export const CHAT_SCROLLBACK_MAX = 5000;
export const CHAT_SCROLLBACK_PRESETS = [200, 500, 1000, 2000, 5000] as const;

export function clampChatScrollbackItems(value: number) {
  return Math.min(
    CHAT_SCROLLBACK_MAX,
    Math.max(CHAT_SCROLLBACK_MIN, Math.round(value)),
  );
}

export function isChatScrollbackPreset(
  value: number,
): value is (typeof CHAT_SCROLLBACK_PRESETS)[number] {
  return CHAT_SCROLLBACK_PRESETS.some((preset) => preset === value);
}

export function normalizeChatHistoryScrollbackItems(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return CHAT_SCROLLBACK_DEFAULT;
  }
  return clampChatScrollbackItems(parsed);
}
