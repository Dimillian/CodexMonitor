import type { CodexFeature } from "@/types";
import type { SettingsFeaturesSectionProps } from "@settings/hooks/useSettingsFeaturesSection";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { fileManagerName, openInFileManagerLabel } from "@utils/platformPaths";
import { useI18n } from "@/i18n/useI18n";

function toTitleCaseFeatureName(name: string): string {
  return name
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatFeatureLabel(
  feature: CodexFeature,
  t: (key: string, params?: Record<string, string>) => string,
  hasKey: (key: string) => boolean,
): string {
  const displayName = feature.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  const key = `settings.features.fallback.label.${feature.name}`;
  if (hasKey(key)) {
    return t(key);
  }
  return toTitleCaseFeatureName(feature.name);
}

function featureSubtitle(
  feature: CodexFeature,
  t: (key: string, params?: Record<string, string>) => string,
  hasKey: (key: string) => boolean,
): string {
  if (feature.description?.trim()) {
    return feature.description;
  }
  if (feature.announcement?.trim()) {
    return feature.announcement;
  }
  const key = `settings.features.fallback.description.${feature.name}`;
  if (hasKey(key)) {
    return t(key);
  }
  if (feature.stage === "deprecated") {
    return t("settings.features.feature.deprecated");
  }
  if (feature.stage === "removed") {
    return t("settings.features.feature.removed");
  }
  return t("settings.features.feature.key", { name: feature.name });
}

export function SettingsFeaturesSection({
  appSettings,
  hasFeatureWorkspace,
  openConfigError,
  featureError,
  featuresLoading,
  featureUpdatingKey,
  stableFeatures,
  experimentalFeatures,
  hasDynamicFeatureRows,
  onOpenConfig,
  onToggleCodexFeature,
  onUpdateAppSettings,
}: SettingsFeaturesSectionProps) {
  const { t, hasKey } = useI18n();
  return (
    <SettingsSection
      title={t("settings.features.sectionTitle")}
      subtitle={t("settings.features.sectionSubtitle")}
    >
      <SettingsToggleRow
        title={t("settings.features.configFile.title")}
        subtitle={t("settings.features.configFile.subtitle", {
          fileManager: fileManagerName(),
        })}
      >
        <button type="button" className="ghost" onClick={onOpenConfig}>
          {openInFileManagerLabel()}
        </button>
      </SettingsToggleRow>
      {openConfigError && <div className="settings-help">{openConfigError}</div>}
      <div className="settings-subsection-title">{t("settings.features.stable.title")}</div>
      <div className="settings-subsection-subtitle">{t("settings.features.stable.subtitle")}</div>
      <SettingsToggleRow
        title={t("settings.features.personality.title")}
        subtitle={
          <>
            {t("settings.features.personality.subtitle.before")}
            <code>personality</code>
            {t("settings.features.personality.subtitle.after")}
          </>
        }
      >
        <select
          id="features-personality-select"
          className="settings-select"
          value={appSettings.personality}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              personality: event.target.value as (typeof appSettings)["personality"],
            })
          }
          aria-label={t("settings.features.personality.title")}
        >
          <option value="friendly">{t("settings.features.personality.option.friendly")}</option>
          <option value="pragmatic">{t("settings.features.personality.option.pragmatic")}</option>
        </select>
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.features.pauseQueue.title")}
        subtitle={t("settings.features.pauseQueue.subtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.pauseQueuedMessagesWhenResponseRequired}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              pauseQueuedMessagesWhenResponseRequired:
                !appSettings.pauseQueuedMessagesWhenResponseRequired,
            })
          }
        />
      </SettingsToggleRow>
      {stableFeatures.map((feature) => (
        <SettingsToggleRow
          key={feature.name}
          title={formatFeatureLabel(feature, t, hasKey)}
          subtitle={featureSubtitle(feature, t, hasKey)}
        >
          <SettingsToggleSwitch
            pressed={feature.enabled}
            onClick={() => onToggleCodexFeature(feature)}
            disabled={featureUpdatingKey === feature.name}
          />
        </SettingsToggleRow>
      ))}
      {hasFeatureWorkspace &&
        !featuresLoading &&
        !featureError &&
        stableFeatures.length === 0 && (
        <div className="settings-help">{t("settings.features.noStable")}</div>
      )}
      <div className="settings-subsection-title">{t("settings.features.experimental.title")}</div>
      <div className="settings-subsection-subtitle">
        {t("settings.features.experimental.subtitle")}
      </div>
      {experimentalFeatures.map((feature) => (
        <SettingsToggleRow
          key={feature.name}
          title={formatFeatureLabel(feature, t, hasKey)}
          subtitle={featureSubtitle(feature, t, hasKey)}
        >
          <SettingsToggleSwitch
            pressed={feature.enabled}
            onClick={() => onToggleCodexFeature(feature)}
            disabled={featureUpdatingKey === feature.name}
          />
        </SettingsToggleRow>
      ))}
      {hasFeatureWorkspace &&
        !featuresLoading &&
        !featureError &&
        hasDynamicFeatureRows &&
        experimentalFeatures.length === 0 && (
          <div className="settings-help">
            {t("settings.features.noExperimental")}
          </div>
        )}
      {featuresLoading && (
        <div className="settings-help">{t("settings.features.loading")}</div>
      )}
      {!hasFeatureWorkspace && !featuresLoading && (
        <div className="settings-help">{t("settings.features.connectWorkspace")}</div>
      )}
      {featureError && <div className="settings-help">{featureError}</div>}
    </SettingsSection>
  );
}
