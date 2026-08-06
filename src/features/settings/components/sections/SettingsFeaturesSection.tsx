import { Trans, useTranslation } from "react-i18next";
import i18n from "@/i18n/i18n";
import type { CodexFeature } from "@/types";
import {
  SettingsSection,
  SettingsSubsection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import type { SettingsFeaturesSectionProps } from "@settings/hooks/useSettingsFeaturesSection";
import { fileManagerName, openInFileManagerLabel } from "@utils/platformPaths";

const FEATURE_DESCRIPTION_FALLBACKS: Record<string, string> = {
  undo: "Create a ghost commit at each turn.",
  shell_tool: "Enable the default shell tool.",
  unified_exec: "Use the single unified PTY-backed exec tool.",
  shell_snapshot: "Enable shell snapshotting.",
  js_repl: "Enable JavaScript REPL tools backed by a persistent Node kernel.",
  js_repl_tools_only: "Only expose js_repl tools directly to the model.",
  web_search_request: "Deprecated. Use top-level web_search instead.",
  web_search_cached: "Deprecated. Use top-level web_search instead.",
  search_tool: "Removed legacy search flag kept for backward compatibility.",
  runtime_metrics: "Enable runtime metrics snapshots via a manual reader.",
  sqlite: "Persist rollout metadata to a local SQLite database.",
  memory_tool: "Enable startup memory extraction and memory consolidation.",
  child_agents_md: "Append additional AGENTS.md guidance to user instructions.",
  apply_patch_freeform: "Include the freeform apply_patch tool.",
  use_linux_sandbox_bwrap: "Use the bubblewrap-based Linux sandbox pipeline.",
  request_rule: "Allow approval requests and exec rule proposals.",
  experimental_windows_sandbox:
    "Removed Windows sandbox flag kept for backward compatibility.",
  elevated_windows_sandbox:
    "Removed elevated Windows sandbox flag kept for backward compatibility.",
  remote_models: "Refresh remote models before AppReady.",
  powershell_utf8: "Enforce UTF-8 output in PowerShell.",
  enable_request_compression:
    "Compress streaming request bodies sent to codex-backend.",
  apps: "Enable ChatGPT Apps integration.",
  apps_mcp_gateway: "Route Apps MCP calls through the configured gateway.",
  skill_mcp_dependency_install:
    "Allow prompting and installing missing MCP dependencies.",
  skill_env_var_dependency_prompt:
    "Prompt for missing skill environment variable dependencies.",
  steer: "Enable turn steering capability when supported by Codex.",
  collaboration_modes: "Enable collaboration mode presets.",
  personality: "Enable personality selection.",
  responses_websockets:
    "Use Responses API WebSocket transport for OpenAI by default.",
  responses_websockets_v2: "Enable Responses API WebSocket v2 mode.",
};

function formatFeatureLabel(feature: CodexFeature): string {
  const displayName = feature.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  return feature.name
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function featureSubtitle(feature: CodexFeature): string {
  if (feature.description?.trim()) {
    return feature.description;
  }
  if (feature.announcement?.trim()) {
    return feature.announcement;
  }
  const fallbackDescription = FEATURE_DESCRIPTION_FALLBACKS[feature.name];
  if (fallbackDescription) {
    return fallbackDescription;
  }
  if (feature.stage === "deprecated") {
    return i18n.t("settings:features_deprecated");
  }
  if (feature.stage === "removed") {
    return i18n.t("settings:features_legacy");
  }
  return i18n.t("settings:features_default_subtitle", { name: feature.name });
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
  const { t } = useTranslation("settings");
  return (
    <SettingsSection
      title={t("features_title")}
      subtitle={t("features_subtitle")}
    >
      <SettingsToggleRow
        title={t("features_config_file")}
        subtitle={t("features_config_file_subtitle", { fileManager: fileManagerName() })}
      >
        <button type="button" className="ghost" onClick={onOpenConfig}>
          {openInFileManagerLabel()}
        </button>
      </SettingsToggleRow>
      {openConfigError && <div className="settings-help">{openConfigError}</div>}
      <SettingsSubsection
        title={t("features_stable_title")}
        subtitle={t("features_stable_subtitle")}
      />
      <SettingsToggleRow
        title={t("features_personality")}
        subtitle={
          <Trans i18nKey="settings:features_personality_subtitle" />
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
          aria-label={t("features_personality_aria")}
        >
          <option value="friendly">{t("features_personality_friendly")}</option>
          <option value="pragmatic">{t("features_personality_pragmatic")}</option>
        </select>
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("features_pause_queued")}
        subtitle={t("features_pause_queued_subtitle")}
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
          title={formatFeatureLabel(feature)}
          subtitle={featureSubtitle(feature)}
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
        <div className="settings-help">{t("features_no_stable")}</div>
      )}
      <SettingsSubsection
        title={t("features_experimental_title")}
        subtitle={t("features_experimental_subtitle")}
      />
      {experimentalFeatures.map((feature) => (
        <SettingsToggleRow
          key={feature.name}
          title={formatFeatureLabel(feature)}
          subtitle={featureSubtitle(feature)}
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
            {t("features_no_experimental")}
          </div>
        )}
      {featuresLoading && (
        <div className="settings-help">{t("features_loading")}</div>
      )}
      {!hasFeatureWorkspace && !featuresLoading && (
        <div className="settings-help">
          {t("features_connect_workspace")}
        </div>
      )}
      {featureError && <div className="settings-help">{featureError}</div>}
    </SettingsSection>
  );
}
