import type { AppSettings } from "../../../../types";

type SettingsGitSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export function SettingsGitSection({
  appSettings,
  onUpdateAppSettings,
}: SettingsGitSectionProps) {
  return (
    <section className="settings-section">
      <div className="settings-section-title">Git</div>
      <div className="settings-section-subtitle">
        Manage how diffs are loaded in the Git sidebar.
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Preload git diffs</div>
          <div className="settings-toggle-subtitle">Make viewing git diff faster.</div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.preloadGitDiffs ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              preloadGitDiffs: !appSettings.preloadGitDiffs,
            })
          }
          aria-pressed={appSettings.preloadGitDiffs}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Ignore whitespace changes</div>
          <div className="settings-toggle-subtitle">
            Hides whitespace-only changes in local and commit diffs.
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.gitDiffIgnoreWhitespaceChanges ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              gitDiffIgnoreWhitespaceChanges: !appSettings.gitDiffIgnoreWhitespaceChanges,
            })
          }
          aria-pressed={appSettings.gitDiffIgnoreWhitespaceChanges}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
    </section>
  );
}
