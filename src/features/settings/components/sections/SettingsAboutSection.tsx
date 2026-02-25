import { useEffect, useState } from "react";
import {
  getAppBuildType,
  isMobileRuntime,
  type AppBuildType,
} from "@services/tauri";
import { useUpdater } from "@/features/update/hooks/useUpdater";

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

export function SettingsAboutSection() {
  const [appBuildType, setAppBuildType] = useState<AppBuildType | "unknown">("unknown");
  const [updaterEnabled, setUpdaterEnabled] = useState(false);
  const { state: updaterState, checkForUpdates, startUpdate } = useUpdater({
    enabled: updaterEnabled,
  });

  useEffect(() => {
    let active = true;
    const loadBuildType = async () => {
      try {
        const value = await getAppBuildType();
        if (active) {
          setAppBuildType(value);
        }
      } catch {
        if (active) {
          setAppBuildType("unknown");
        }
      }
    };
    void loadBuildType();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const detectRuntime = async () => {
      try {
        const mobileRuntime = await isMobileRuntime();
        if (active) {
          setUpdaterEnabled(!mobileRuntime);
        }
      } catch {
        if (active) {
          // In non-Tauri previews we still want local desktop-like behavior.
          setUpdaterEnabled(true);
        }
      }
    };
    void detectRuntime();
    return () => {
      active = false;
    };
  }, []);

  const buildDateValue = __APP_BUILD_DATE__.trim();
  const parsedBuildDate = Date.parse(buildDateValue);
  const buildDateLabel = Number.isNaN(parsedBuildDate)
    ? buildDateValue || "unknown"
    : new Date(parsedBuildDate).toLocaleString();

  return (
    <section className="settings-section">
      <div className="settings-field">
        <div className="settings-help">
          Version: <code>{__APP_VERSION__}</code>
        </div>
        <div className="settings-help">
          Build type: <code>{appBuildType}</code>
        </div>
        <div className="settings-help">
          Branch: <code>{__APP_GIT_BRANCH__ || "unknown"}</code>
        </div>
        <div className="settings-help">
          Commit: <code>{__APP_COMMIT_HASH__ || "unknown"}</code>
        </div>
        <div className="settings-help">
          Build date: <code>{buildDateLabel}</code>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-label">App Updates</div>
        <div className="settings-help">
          Currently running version <code>{__APP_VERSION__}</code>
        </div>
        {!updaterEnabled && (
          <div className="settings-help">
            Updates are unavailable in this runtime.
          </div>
        )}

        {updaterState.stage === "error" && (
          <div className="settings-help ds-text-danger">
            Update failed: {updaterState.error}
          </div>
        )}

        {updaterState.stage === "downloading" ||
        updaterState.stage === "installing" ||
        updaterState.stage === "restarting" ? (
          <div className="settings-help">
            {updaterState.stage === "downloading" ? (
              <>
                Downloading update...{" "}
                {updaterState.progress?.totalBytes
                  ? `${Math.round((updaterState.progress.downloadedBytes / updaterState.progress.totalBytes) * 100)}%`
                  : formatBytes(updaterState.progress?.downloadedBytes ?? 0)}
              </>
            ) : updaterState.stage === "installing" ? (
              "Installing update..."
            ) : (
              "Restarting..."
            )}
          </div>
        ) : updaterState.stage === "available" ? (
          <div className="settings-help">
            Version <code>{updaterState.version}</code> is available.
          </div>
        ) : updaterState.stage === "latest" ? (
          <div className="settings-help">You are on the latest version.</div>
        ) : null}

        <div className="settings-controls">
          {updaterState.stage === "available" ? (
            <button
              type="button"
              className="primary"
              disabled={!updaterEnabled}
              onClick={() => void startUpdate()}
            >
              Download & Install
            </button>
          ) : (
            <button
              type="button"
              className="ghost"
              disabled={
                !updaterEnabled ||
                updaterState.stage === "checking" ||
                updaterState.stage === "downloading" ||
                updaterState.stage === "installing" ||
                updaterState.stage === "restarting"
              }
              onClick={() => void checkForUpdates({ announceNoUpdate: true })}
            >
              {updaterState.stage === "checking" ? "Checking..." : "Check for updates"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
