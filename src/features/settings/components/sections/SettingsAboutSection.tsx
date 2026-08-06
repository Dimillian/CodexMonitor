import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "@/types";
import {
  getAppBuildType,
  isMobileRuntime,
  type AppBuildType,
} from "@services/tauri";
import { useUpdater } from "@/features/update/hooks/useUpdater";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";

type SettingsAboutSectionProps = {
  appSettings: AppSettings;
  onToggleAutomaticAppUpdateChecks?: () => void;
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

export function SettingsAboutSection({
  appSettings,
  onToggleAutomaticAppUpdateChecks,
}: SettingsAboutSectionProps) {
  const { t } = useTranslation("settings");
  const [appBuildType, setAppBuildType] = useState<AppBuildType | "unknown">("unknown");
  const [updaterEnabled, setUpdaterEnabled] = useState(false);
  const { state: updaterState, checkForUpdates, startUpdate } = useUpdater({
    enabled: updaterEnabled,
    autoCheckOnMount: false,
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
    <SettingsSection title={t("about_title")} subtitle={t("about_subtitle")}>
      <div className="settings-field">
        <div className="settings-help">
          {t("about_version")} <code>{__APP_VERSION__}</code>
        </div>
        <div className="settings-help">
          {t("about_build_type")} <code>{appBuildType}</code>
        </div>
        <div className="settings-help">
          {t("about_branch")} <code>{__APP_GIT_BRANCH__ || t("about_unknown")}</code>
        </div>
        <div className="settings-help">
          {t("about_commit")} <code>{__APP_COMMIT_HASH__ || t("about_unknown")}</code>
        </div>
        <div className="settings-help">
          {t("about_build_date")} <code>{buildDateLabel}</code>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-label">{t("about_app_updates")}</div>
        <SettingsToggleRow
          title={t("about_auto_check_updates")}
          subtitle={t("about_auto_check_updates_subtitle")}
        >
          <SettingsToggleSwitch
            pressed={appSettings.automaticAppUpdateChecksEnabled}
            onClick={() => {
              onToggleAutomaticAppUpdateChecks?.();
            }}
          />
        </SettingsToggleRow>
        <div className="settings-help">
          {t("about_currently_running")} <code>{__APP_VERSION__}</code>
        </div>
        {!updaterEnabled && (
          <div className="settings-help">
            {t("about_updates_unavailable")}
          </div>
        )}

        {updaterState.stage === "error" && (
          <div className="settings-help ds-text-danger">
            {t("about_update_failed")} {updaterState.error}
          </div>
        )}

        {updaterState.stage === "downloading" ||
        updaterState.stage === "installing" ||
        updaterState.stage === "restarting" ? (
          <div className="settings-help">
            {updaterState.stage === "downloading" ? (
              <>
                {t("about_downloading")}{" "}
                {updaterState.progress?.totalBytes
                  ? `${Math.round((updaterState.progress.downloadedBytes / updaterState.progress.totalBytes) * 100)}%`
                  : formatBytes(updaterState.progress?.downloadedBytes ?? 0)}
              </>
            ) : updaterState.stage === "installing" ? (
              t("about_installing")
            ) : (
              t("about_restarting")
            )}
          </div>
        ) : updaterState.stage === "available" ? (
          <div className="settings-help">
            {t("about_version_available", { version: updaterState.version })}
          </div>
        ) : updaterState.stage === "latest" ? (
          <div className="settings-help">{t("about_latest_version")}</div>
        ) : null}

        <div className="settings-controls">
          {updaterState.stage === "available" ? (
            <button
              type="button"
              className="primary"
              disabled={!updaterEnabled}
              onClick={() => void startUpdate()}
            >
              {t("about_download_install")}
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
              {updaterState.stage === "checking" ? t("about_checking") : t("about_check_for_updates")}
            </button>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
