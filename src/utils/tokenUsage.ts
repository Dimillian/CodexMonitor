const COMPACT_TOKEN_UNITS = [
  { divisor: 1_000_000_000, suffix: "B" },
  { divisor: 1_000_000, suffix: "M" },
  { divisor: 1_000, suffix: "K" },
] as const;

export function formatCompactTokenCount(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  for (let index = 0; index < COMPACT_TOKEN_UNITS.length; index += 1) {
    const unit = COMPACT_TOKEN_UNITS[index];
    if (value < unit.divisor) {
      continue;
    }

    const scaled = value / unit.divisor;
    const decimals = scaled >= 10 ? 0 : 1;
    const factor = 10 ** decimals;
    const rounded = Math.round(scaled * factor) / factor;

    if (rounded >= 1000 && index > 0) {
      const promotedUnit = COMPACT_TOKEN_UNITS[index - 1];
      const promotedScaled = value / promotedUnit.divisor;
      const promotedDecimals = promotedScaled >= 10 ? 0 : 1;
      const promotedFactor = 10 ** promotedDecimals;
      const promotedRounded =
        Math.round(promotedScaled * promotedFactor) / promotedFactor;
      const promotedText =
        promotedDecimals === 0
          ? promotedRounded.toFixed(0)
          : promotedRounded.toFixed(1);
      return `${promotedText}${promotedUnit.suffix}`;
    }

    const text = decimals === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
    return `${text}${unit.suffix}`;
  }

  return String(Math.round(value));
}
