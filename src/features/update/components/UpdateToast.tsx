import type { UpdateState } from "../hooks/useUpdater";

type UpdateToastProps = {
  state: UpdateState;
  onUpdate: () => void;
  onDismiss: () => void;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function UpdateToast({ state, onUpdate, onDismiss }: UpdateToastProps) {
  if (state.stage === "idle") {
    return null;
  }

  const totalBytes = state.progress?.totalBytes;
  const downloadedBytes = state.progress?.downloadedBytes ?? 0;
  const percent =
    totalBytes && totalBytes > 0
      ? Math.min(100, (downloadedBytes / totalBytes) * 100)
      : null;

  return (
    <div className="update-toasts" role="region" aria-live="polite">
      <div className="update-toast" role="status">
        <div className="update-toast-header">
          <div className="update-toast-title">Update</div>
          {state.version ? (
            <div className="update-toast-version">v{state.version}</div>
          ) : null}
        </div>
        {state.stage === "checking" && (
          <div className="update-toast-body">Checking for updates...</div>
        )}
        {state.stage === "available" && (
          <>
            <div className="update-toast-body">
              A new version is available.
            </div>
            <div className="update-toast-actions">
              <button className="secondary" onClick={onDismiss}>
                Later
              </button>
              <button className="primary" onClick={onUpdate}>
                Update
              </button>
            </div>
          </>
        )}
        {state.stage === "latest" && (
          <div className="update-toast-inline">
            <div className="update-toast-body update-toast-body-inline">
              You’re up to date.
            </div>
            <button className="secondary" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        )}
        {state.stage === "downloading" && (
          <>
            <div className="update-toast-body">
              Downloading update…
            </div>
            <div className="update-toast-progress">
              <div className="update-toast-progress-bar">
                <span
                  className="update-toast-progress-fill"
                  style={{ width: percent ? `${percent}%` : "24%" }}
                />
              </div>
              <div className="update-toast-progress-meta">
                {totalBytes
                  ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
                  : `${formatBytes(downloadedBytes)} downloaded`}
              </div>
            </div>
          </>
        )}
        {state.stage === "installing" && (
          <div className="update-toast-body">Installing update…</div>
        )}
        {state.stage === "restarting" && (
          <div className="update-toast-body">Restarting…</div>
        )}
        {state.stage === "error" && (
          <>
            <div className="update-toast-body">Update failed.</div>
            {state.error ? (
              <div className="update-toast-error">{state.error}</div>
            ) : null}
            <div className="update-toast-actions">
              <button className="secondary" onClick={onDismiss}>
                Dismiss
              </button>
              <button className="primary" onClick={onUpdate}>
                Retry
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
