export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  // Covers iPhone/iPad/iPod.
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return true;
  }

  // iPadOS 13+ often reports itself as "MacIntel" to request desktop sites.
  // The reliable signal is touch support.
  const platform = navigator.platform ?? "";
  const touchPoints = navigator.maxTouchPoints ?? 0;
  if (platform === "MacIntel" && touchPoints > 1) {
    return true;
  }

  return false;
}
