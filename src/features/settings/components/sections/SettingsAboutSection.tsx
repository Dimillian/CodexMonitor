import { useEffect, useState } from "react";
import type { AppSettings } from "@/types";
import { useI18n } from "@/i18n";
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
  const { tx } = useI18n();
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
    ? buildDateValue || tx("unknown")
    : new Date(parsedBuildDate).toLocaleString();

  return (
    <SettingsSection
      title={tx("About")}
      subtitle={tx("App version, build metadata, and update controls.")}
    >
      <div className="settings-field">
        <div className="settings-help">
          {tx("Version:")} <code>{__APP_VERSION__}</code>
        </div>
        <div className="settings-help">
          {tx("Build type:")} <code>{tx(appBuildType)}</code>
        </div>
        <div className="settings-help">
          {tx("Branch:")} <code>{__APP_GIT_BRANCH__ || tx("unknown")}</code>
        </div>
        <div className="settings-help">
          {tx("Commit:")} <code>{__APP_COMMIT_HASH__ || tx("unknown")}</code>
        </div>
        <div className="settings-help">
          {tx("Build date:")} <code>{buildDateLabel}</code>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-label">{tx("App Updates")}</div>
        <SettingsToggleRow
          title={tx("Automatically check for app updates")}
          subtitle={tx("When enabled, CodexMonitor checks for new app versions on launch.")}
        >
          <SettingsToggleSwitch
            pressed={appSettings.automaticAppUpdateChecksEnabled}
            onClick={() => {
              onToggleAutomaticAppUpdateChecks?.();
            }}
          />
        </SettingsToggleRow>
        <div className="settings-help">
          {tx("Currently running version")} <code>{__APP_VERSION__}</code>
        </div>
        {!updaterEnabled && (
          <div className="settings-help">
            {tx("Updates are unavailable in this runtime.")}
          </div>
        )}

        {updaterState.stage === "error" && (
          <div className="settings-help ds-text-danger">
            {tx("Update failed:")} {updaterState.error}
          </div>
        )}

        {updaterState.stage === "downloading" ||
        updaterState.stage === "installing" ||
        updaterState.stage === "restarting" ? (
          <div className="settings-help">
            {updaterState.stage === "downloading" ? (
              <>
                {tx("Downloading update...")}{" "}
                {updaterState.progress?.totalBytes
                  ? `${Math.round((updaterState.progress.downloadedBytes / updaterState.progress.totalBytes) * 100)}%`
                  : formatBytes(updaterState.progress?.downloadedBytes ?? 0)}
              </>
            ) : updaterState.stage === "installing" ? (
              tx("Installing update...")
            ) : (
              tx("Restarting...")
            )}
          </div>
        ) : updaterState.stage === "available" ? (
          <div className="settings-help">
            {tx("Version")} <code>{updaterState.version}</code> {tx("is available.")}
          </div>
        ) : updaterState.stage === "latest" ? (
          <div className="settings-help">{tx("You are on the latest version.")}</div>
        ) : null}

        <div className="settings-controls">
          {updaterState.stage === "available" ? (
            <button
              type="button"
              className="primary"
              disabled={!updaterEnabled}
              onClick={() => void startUpdate()}
            >
              {tx("Download & Install")}
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
              {updaterState.stage === "checking" ? tx("Checking...") : tx("Check for updates")}
            </button>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
