import { useEffect, useState } from "react";
import { getAppBuildType, type AppBuildType } from "@services/tauri";

export function SettingsAboutSection() {
  const [appBuildType, setAppBuildType] = useState<AppBuildType | "unknown">("unknown");

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
    </section>
  );
}
