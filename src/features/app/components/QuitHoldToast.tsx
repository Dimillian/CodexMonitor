import type { QuitHoldState } from "../hooks/useHoldToQuit";

type QuitHoldToastProps = {
  state: QuitHoldState;
};

export function QuitHoldToast({ state }: QuitHoldToastProps) {
  if (!state.isVisible) {
    return null;
  }

  const isCanceled = state.status === "canceled";
  const message = isCanceled ? "Quit canceled" : "Hold Cmd+Q to quit";
  const progressPercent = Math.round(state.progress * 100);

  return (
    <div className="quit-hold-toasts" role="region" aria-live="polite">
      <div
        className={`quit-hold-toast ${state.status}`}
        role="status"
      >
        <div className="quit-hold-toast-body">{message}</div>
        {!isCanceled && (
          <div className="quit-hold-toast-progress">
            <div className="quit-hold-toast-progress-bar">
              <span
                className="quit-hold-toast-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
