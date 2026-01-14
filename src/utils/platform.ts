export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  // Covers iPhone/iPad/iPod. (Modern iPadOS may report "Macintosh", but will still
  // include iPad on most WebViews; we keep this simple for now.)
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

