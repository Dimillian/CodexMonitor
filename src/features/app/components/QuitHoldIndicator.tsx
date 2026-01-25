type QuitHoldIndicatorProps = {
  isActive: boolean;
  progress: number;
};

export function QuitHoldIndicator({
  isActive,
  progress,
}: QuitHoldIndicatorProps) {
  if (!isActive) {
    return null;
  }

  const percent = Math.min(100, Math.max(0, progress * 100));

  return (
    <div
      className="quit-hold-indicator"
      role="progressbar"
      aria-label="Hold to quit"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <span className="quit-hold-track">
        <span className="quit-hold-fill" style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}
