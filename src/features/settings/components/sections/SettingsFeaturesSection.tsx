import type { AppSettings } from "@/types";
import { fileManagerName, openInFileManagerLabel } from "@utils/platformPaths";

type SettingsFeaturesSectionProps = {
  appSettings: AppSettings;
  hasCodexHomeOverrides: boolean;
  openConfigError: string | null;
  onOpenConfig: () => void;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export function SettingsFeaturesSection({
  appSettings,
  hasCodexHomeOverrides,
  openConfigError,
  onOpenConfig,
  onUpdateAppSettings,
}: SettingsFeaturesSectionProps) {
  return (
    <section className="settings-section">
      <div className="settings-section-title">Features</div>
      <div className="settings-section-subtitle">
        Manage stable and experimental Codex features.
      </div>
      {hasCodexHomeOverrides && (
        <div className="settings-help">
          Feature settings are stored in the default CODEX_HOME config.toml.
          <br />
          Workspace overrides are not updated.
        </div>
      )}
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Config file</div>
          <div className="settings-toggle-subtitle">
            Open the Codex config in {fileManagerName()}.
          </div>
        </div>
        <button type="button" className="ghost" onClick={onOpenConfig}>
          {openInFileManagerLabel()}
        </button>
      </div>
      {openConfigError && <div className="settings-help">{openConfigError}</div>}
      <div className="settings-subsection-title">Stable Features</div>
      <div className="settings-subsection-subtitle">
        Production-ready features enabled by default.
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Collaboration modes</div>
          <div className="settings-toggle-subtitle">
            Enable collaboration mode presets (Code, Plan).
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.collaborationModesEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              collaborationModesEnabled: !appSettings.collaborationModesEnabled,
            })
          }
          aria-pressed={appSettings.collaborationModesEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Personality</div>
          <div className="settings-toggle-subtitle">
            Choose Codex communication style (writes top-level <code>personality</code> in
            config.toml).
          </div>
        </div>
        <select
          id="features-personality-select"
          className="settings-select"
          value={appSettings.personality}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              personality: event.target.value as AppSettings["personality"],
            })
          }
          aria-label="Personality"
        >
          <option value="friendly">Friendly</option>
          <option value="pragmatic">Pragmatic</option>
        </select>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Steer mode</div>
          <div className="settings-toggle-subtitle">
            Send messages immediately. Use Tab to queue while a run is active.
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.steerEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              steerEnabled: !appSettings.steerEnabled,
            })
          }
          aria-pressed={appSettings.steerEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Background terminal</div>
          <div className="settings-toggle-subtitle">
            Run long-running terminal commands in the background.
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.unifiedExecEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              unifiedExecEnabled: !appSettings.unifiedExecEnabled,
            })
          }
          aria-pressed={appSettings.unifiedExecEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-subsection-title">Experimental Features</div>
      <div className="settings-subsection-subtitle">
        Preview features that may change or be removed.
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Multi-agent</div>
          <div className="settings-toggle-subtitle">
            Enable multi-agent collaboration tools in Codex.
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.experimentalCollabEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              experimentalCollabEnabled: !appSettings.experimentalCollabEnabled,
            })
          }
          aria-pressed={appSettings.experimentalCollabEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Apps</div>
          <div className="settings-toggle-subtitle">
            Enable ChatGPT apps/connectors and the <code>/apps</code> command.
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.experimentalAppsEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              experimentalAppsEnabled: !appSettings.experimentalAppsEnabled,
            })
          }
          aria-pressed={appSettings.experimentalAppsEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
    </section>
  );
}
