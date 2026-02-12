import type { AppSettings } from "@/types";
import { useTranslation } from "react-i18next";
import { openInFileManagerLabel } from "@utils/platformPaths";

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
  const { t } = useTranslation();
  return (
    <section className="settings-section">
      <div className="settings-section-title">{t('settings.sections.features')}</div>
      <div className="settings-section-subtitle">
        {t('settings.features.manage_features')}
      </div>
      {hasCodexHomeOverrides && (
        <div className="settings-help">
          {t('settings.features.features_stored')}
          <br />
          {t('settings.features.overrides_not_synced')}
        </div>
      )}
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t('settings.features.config_file')}</div>
          <div className="settings-toggle-subtitle">
            {t('settings.features.communication_style_description')}
          </div>
        </div>
        <button type="button" className="ghost" onClick={onOpenConfig}>
          {openInFileManagerLabel()}
        </button>
      </div>
      {openConfigError && <div className="settings-help">{openConfigError}</div>}
      <div className="settings-subsection-title">{t('settings.features.stable_features')}</div>
      <div className="settings-subsection-subtitle">
        {t('settings.features.stable_features_description')}
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t('settings.features.collaboration_mode')}</div>
          <div className="settings-toggle-subtitle">
            {t('settings.features.collaboration_mode_description')}
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
          <div className="settings-toggle-title">{t('settings.communication_style')}</div>
          <div className="settings-toggle-subtitle">
            {t('settings.features.communication_style_subtitle')}
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
          aria-label={t('settings.communication_style')}
        >
          <option value="friendly">{t('settings.friendly')}</option>
          <option value="pragmatic">{t('settings.pragmatic')}</option>
        </select>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t('settings.features.guided_mode')}</div>
          <div className="settings-toggle-subtitle">
            {t('settings.features.guided_mode_description')}
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
          <div className="settings-toggle-title">{t('settings.background_terminal')}</div>
          <div className="settings-toggle-subtitle">
            {t('settings.features.background_terminal_description')}
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
      <div className="settings-subsection-title">{t('settings.features.experimental_features')}</div>
      <div className="settings-subsection-subtitle">
        {t('settings.features.experimental_features_description')}
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t('settings.features.multi_agent')}</div>
          <div className="settings-toggle-subtitle">
            {t('settings.features.multi_agent_description')}
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
          <div className="settings-toggle-title">{t('settings.features.apps')}</div>
          <div className="settings-toggle-subtitle">
            {t('settings.features.apps_description')}
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
