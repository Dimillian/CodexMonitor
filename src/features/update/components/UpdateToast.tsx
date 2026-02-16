import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { PostUpdateNoticeState, UpdateState } from "../hooks/useUpdater";
import {
  ToastActions,
  ToastBody,
  ToastCard,
  ToastError,
  ToastHeader,
  ToastTitle,
  ToastViewport,
} from "../../design-system/components/toast/ToastPrimitives";

type UpdateToastProps = {
  state: UpdateState;
  onUpdate: () => void;
  onDismiss: () => void;
  postUpdateNotice?: PostUpdateNoticeState;
  onDismissPostUpdateNotice?: () => void;
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

export function UpdateToast({
  state,
  onUpdate,
  onDismiss,
  postUpdateNotice = null,
  onDismissPostUpdateNotice,
}: UpdateToastProps) {
  if (postUpdateNotice) {
    return (
      <ToastViewport className="update-toasts" role="region" ariaLive="polite">
        <ToastCard className="update-toast" role="status">
          <ToastHeader className="update-toast-header">
            <ToastTitle className="update-toast-title">What's New</ToastTitle>
            <div className="update-toast-version">v{postUpdateNotice.version}</div>
          </ToastHeader>
          {postUpdateNotice.stage === "loading" ? (
            <ToastBody className="update-toast-body">
              Updated successfully. Loading release notes...
            </ToastBody>
          ) : null}
          {postUpdateNotice.stage === "ready" ? (
            <>
              <ToastBody className="update-toast-body">
                Updated successfully. Here is what is new:
              </ToastBody>
              <div className="update-toast-notes" role="document">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => {
                      if (!href) {
                        return <span>{children}</span>;
                      }
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => {
                            event.preventDefault();
                            void openUrl(href);
                          }}
                        >
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {postUpdateNotice.body}
                </ReactMarkdown>
              </div>
            </>
          ) : null}
          {postUpdateNotice.stage === "fallback" ? (
            <ToastBody className="update-toast-body">
              Updated to v{postUpdateNotice.version}. Release notes could not be
              loaded.
            </ToastBody>
          ) : null}
          <ToastActions className="update-toast-actions">
            {postUpdateNotice.stage !== "loading" ? (
              <button
                className="primary"
                onClick={() => {
                  void openUrl(postUpdateNotice.htmlUrl);
                }}
              >
                View on GitHub
              </button>
            ) : null}
            <button
              className="secondary"
              onClick={onDismissPostUpdateNotice ?? onDismiss}
            >
              Dismiss
            </button>
          </ToastActions>
        </ToastCard>
      </ToastViewport>
    );
  }

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
    <ToastViewport className="update-toasts" role="region" ariaLive="polite">
      <ToastCard className="update-toast" role="status">
        <ToastHeader className="update-toast-header">
          <ToastTitle className="update-toast-title">Update</ToastTitle>
          {state.version ? (
            <div className="update-toast-version">v{state.version}</div>
          ) : null}
        </ToastHeader>
        {state.stage === "checking" && (
          <ToastBody className="update-toast-body">Checking for updates...</ToastBody>
        )}
        {state.stage === "available" && (
          <>
            <ToastBody className="update-toast-body">
              A new version is available.
            </ToastBody>
            <ToastActions className="update-toast-actions">
              <button className="secondary" onClick={onDismiss}>
                Later
              </button>
              <button className="primary" onClick={onUpdate}>
                Update
              </button>
            </ToastActions>
          </>
        )}
        {state.stage === "latest" && (
          <div className="update-toast-inline">
            <ToastBody className="update-toast-body update-toast-body-inline">
              You’re up to date.
            </ToastBody>
            <button className="secondary" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        )}
        {state.stage === "downloading" && (
          <>
            <ToastBody className="update-toast-body">
              Downloading update…
            </ToastBody>
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
          <ToastBody className="update-toast-body">Installing update…</ToastBody>
        )}
        {state.stage === "restarting" && (
          <ToastBody className="update-toast-body">Restarting…</ToastBody>
        )}
        {state.stage === "error" && (
          <>
            <ToastBody className="update-toast-body">Update failed.</ToastBody>
            {state.error ? (
              <ToastError className="update-toast-error">{state.error}</ToastError>
            ) : null}
            <ToastActions className="update-toast-actions">
              <button className="secondary" onClick={onDismiss}>
                Dismiss
              </button>
              <button className="primary" onClick={onUpdate}>
                Retry
              </button>
            </ToastActions>
          </>
        )}
      </ToastCard>
    </ToastViewport>
  );
}
