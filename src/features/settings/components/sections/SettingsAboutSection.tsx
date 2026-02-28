import { useEffect, useState } from "react";
import {
  getAppBuildType,
  isMobileRuntime,
  type AppBuildType,
} from "@services/tauri";
import { SettingsSection } from "@/features/design-system/components/settings/SettingsPrimitives";
import { useUpdater } from "@/features/update/hooks/useUpdater";
import { useI18n } from "@/i18n/useI18n";

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
  const { t } = useI18n();
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
    ? buildDateValue || t("settings.about.unknown")
    : new Date(parsedBuildDate).toLocaleString();

  return (
    <SettingsSection title={t("settings.nav.about")}>
      <div className="settings-field">
        <div className="settings-help">
          {t("settings.about.version")}: <code>{__APP_VERSION__}</code>
        </div>
        <div className="settings-help">
          {t("settings.about.buildType")}: <code>{appBuildType}</code>
        </div>
        <div className="settings-help">
          {t("settings.about.branch")}: <code>{__APP_GIT_BRANCH__ || t("settings.about.unknown")}</code>
        </div>
        <div className="settings-help">
          {t("settings.about.commit")}: <code>{__APP_COMMIT_HASH__ || t("settings.about.unknown")}</code>
        </div>
        <div className="settings-help">
          {t("settings.about.buildDate")}: <code>{buildDateLabel}</code>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-label">{t("settings.about.updates.title")}</div>
        <div className="settings-help">
          {t("settings.about.updates.currentVersion")} <code>{__APP_VERSION__}</code>
        </div>
        {!updaterEnabled && (
          <div className="settings-help">
            {t("settings.about.updates.unavailable")}
          </div>
        )}

        {updaterState.stage === "error" && (
          <div className="settings-help ds-text-danger">
            {t("settings.about.updates.error")}: {updaterState.error}
          </div>
        )}

        {updaterState.stage === "downloading" ||
        updaterState.stage === "installing" ||
        updaterState.stage === "restarting" ? (
          <div className="settings-help">
            {updaterState.stage === "downloading" ? (
              <>
                {t("settings.about.updates.downloading")}{" "}
                {updaterState.progress?.totalBytes
                  ? `${Math.round((updaterState.progress.downloadedBytes / updaterState.progress.totalBytes) * 100)}%`
                  : formatBytes(updaterState.progress?.downloadedBytes ?? 0)}
              </>
            ) : updaterState.stage === "installing" ? (
              t("settings.about.updates.installing")
            ) : (
              t("settings.about.updates.restarting")
            )}
          </div>
        ) : updaterState.stage === "available" ? (
          <div className="settings-help">
            {t("settings.about.updates.available.prefix")} <code>{updaterState.version}</code>{" "}
            {t("settings.about.updates.available.suffix")}
          </div>
        ) : updaterState.stage === "latest" ? (
          <div className="settings-help">
            {t("settings.about.updates.latest")}
          </div>
        ) : null}

        <div className="settings-controls">
          {updaterState.stage === "available" ? (
            <button
              type="button"
              className="primary"
              disabled={!updaterEnabled}
              onClick={() => void startUpdate()}
            >
              {t("settings.about.updates.downloadInstall")}
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
              {updaterState.stage === "checking"
                ? t("settings.about.updates.checking")
                : t("settings.about.updates.check")}
            </button>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
