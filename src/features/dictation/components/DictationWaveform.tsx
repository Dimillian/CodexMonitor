import { useEffect, useMemo, useState } from "react";

type DictationWaveformProps = {
  active: boolean;
  processing: boolean;
  level: number;
};

const MAX_BARS = 36;
const MIN_BAR = 0.08;

function normalizeLevel(level: number) {
  if (!Number.isFinite(level)) {
    return 0;
  }
  return Math.min(1, Math.max(0, level));
}

export function DictationWaveform({
  active,
  processing,
  level,
}: DictationWaveformProps) {
  const [bars, setBars] = useState<number[]>(
    () => new Array(MAX_BARS).fill(0),
  );
  const normalized = normalizeLevel(level);

  useEffect(() => {
    if (!active) {
      setBars(new Array(MAX_BARS).fill(0));
      return;
    }
    setBars((prev) => {
      const next = prev.slice(1);
      const value = Math.max(MIN_BAR, normalized);
      next.push(value);
      return next;
    });
  }, [active, normalized]);

  const barHeights = useMemo(
    () =>
      bars.map((value) => `${Math.round((MIN_BAR + value * 0.92) * 100)}%`),
    [bars],
  );

  return (
    <div
      className={`composer-waveform${processing ? " is-processing" : ""}`}
      aria-hidden
    >
      {processing && <span className="composer-waveform-label">Processing...</span>}
      {barHeights.map((height, index) => (
        <span
          key={index}
          className="composer-waveform-bar"
          style={{ height }}
        />
      ))}
    </div>
  );
}
