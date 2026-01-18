export function isAppleMobileDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent ?? "";
  if (/\b(iPad|iPhone|iPod)\b/i.test(ua)) {
    return true;
  }
  // iPadOS can report itself as "Macintosh" while still being touch-capable.
  const isMacLike = /\bMacintosh\b/i.test(ua);
  const hasTouch =
    typeof window !== "undefined" &&
    ("ontouchend" in window || navigator.maxTouchPoints > 1);
  return isMacLike && hasTouch;
}

