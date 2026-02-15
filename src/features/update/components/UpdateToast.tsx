import { useLayoutEffect, useRef } from "react";
import type { UpdateState } from "../hooks/useUpdater";
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
  const totalBytes = state.progress?.totalBytes;
  const downloadedBytes = state.progress?.downloadedBytes ?? 0;
  const percent =
    totalBytes && totalBytes > 0
      ? Math.min(100, (downloadedBytes / totalBytes) * 100)
      : null;
  const progressPercent = percent ?? 24;
  const progressFillRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    if (!progressFillRef.current) {
      return;
    }
    progressFillRef.current.style.setProperty(
      "--update-toast-progress-width",
      `${progressPercent}%`,
    );
  }, [progressPercent]);

  if (state.stage === "idle") {
    return null;
  }

  return (
    <ToastViewport className="update-toasts" role="region" ariaLive="polite">
      <ToastCard className="update-toast" role="status">
        <ToastHeader className="update-toast-header">
          <ToastTitle className="update-toast-title">更新</ToastTitle>
          {state.version ? (
            <div className="update-toast-version">v{state.version}</div>
          ) : null}
        </ToastHeader>
        {state.stage === "checking" && (
          <ToastBody className="update-toast-body">正在检查更新...</ToastBody>
        )}
        {state.stage === "available" && (
          <>
            <ToastBody className="update-toast-body">
              检测到新版本可用。
            </ToastBody>
            <ToastActions className="update-toast-actions">
              <button className="secondary" onClick={onDismiss}>
                稍后
              </button>
              <button className="primary" onClick={onUpdate}>
                更新
              </button>
            </ToastActions>
          </>
        )}
        {state.stage === "latest" && (
          <div className="update-toast-inline">
            <ToastBody className="update-toast-body update-toast-body-inline">
              当前已是最新版本。
            </ToastBody>
            <button className="secondary" onClick={onDismiss}>
              关闭
            </button>
          </div>
        )}
        {state.stage === "downloading" && (
          <>
            <ToastBody className="update-toast-body">
              正在下载更新…
            </ToastBody>
            <div className="update-toast-progress">
              <div className="update-toast-progress-bar">
                <span className="update-toast-progress-fill" ref={progressFillRef} />
              </div>
              <div className="update-toast-progress-meta">
                {totalBytes
                  ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
                  : `已下载 ${formatBytes(downloadedBytes)}`}
              </div>
            </div>
          </>
        )}
        {state.stage === "installing" && (
          <ToastBody className="update-toast-body">正在安装更新…</ToastBody>
        )}
        {state.stage === "restarting" && (
          <ToastBody className="update-toast-body">正在重启…</ToastBody>
        )}
        {state.stage === "error" && (
          <>
            <ToastBody className="update-toast-body">更新失败。</ToastBody>
            {state.error ? (
              <ToastError className="update-toast-error">{state.error}</ToastError>
            ) : null}
            <ToastActions className="update-toast-actions">
              <button className="secondary" onClick={onDismiss}>
                关闭
              </button>
              <button className="primary" onClick={onUpdate}>
                重试
              </button>
            </ToastActions>
          </>
        )}
      </ToastCard>
    </ToastViewport>
  );
}
