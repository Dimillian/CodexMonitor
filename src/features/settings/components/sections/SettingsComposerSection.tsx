import type { AppSettings } from "@/types";
import { useI18n } from "@/i18n/useI18n";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";

type ComposerPreset = AppSettings["composerEditorPreset"];

type SettingsComposerSectionProps = {
  appSettings: AppSettings;
  optionKeyLabel: string;
  followUpShortcutLabel: string;
  composerPresetLabels: Record<ComposerPreset, string>;
  onComposerPresetChange: (preset: ComposerPreset) => void;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export function SettingsComposerSection({
  appSettings,
  optionKeyLabel,
  followUpShortcutLabel,
  composerPresetLabels,
  onComposerPresetChange,
  onUpdateAppSettings,
}: SettingsComposerSectionProps) {
  const { t } = useI18n();
  const steerUnavailable = !appSettings.steerEnabled;
  return (
    <SettingsSection
      title={t("settings.composer.sectionTitle")}
      subtitle={t("settings.composer.sectionSubtitle")}
    >
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.composer.followUp.label")}</div>
        <div className="settings-segmented" aria-label={t("settings.composer.followUp.label")}>
          <label
            className={`settings-segmented-option${
              appSettings.followUpMessageBehavior === "queue" ? " is-active" : ""
            }`}
          >
            <input
              className="settings-segmented-input"
              type="radio"
              name="follow-up-behavior"
              value="queue"
              checked={appSettings.followUpMessageBehavior === "queue"}
              onChange={() =>
                void onUpdateAppSettings({
                  ...appSettings,
                  followUpMessageBehavior: "queue",
                })
              }
            />
            <span className="settings-segmented-option-label">
              {t("settings.composer.followUp.option.queue")}
            </span>
          </label>
          <label
            className={`settings-segmented-option${
              appSettings.followUpMessageBehavior === "steer" ? " is-active" : ""
            }${steerUnavailable ? " is-disabled" : ""}`}
            title={steerUnavailable ? t("settings.composer.followUp.steerUnavailableTitle") : ""}
          >
            <input
              className="settings-segmented-input"
              type="radio"
              name="follow-up-behavior"
              value="steer"
              checked={appSettings.followUpMessageBehavior === "steer"}
              disabled={steerUnavailable}
              onChange={() => {
                if (steerUnavailable) {
                  return;
                }
                void onUpdateAppSettings({
                  ...appSettings,
                  followUpMessageBehavior: "steer",
                });
              }}
            />
            <span className="settings-segmented-option-label">
              {t("settings.composer.followUp.option.steer")}
            </span>
          </label>
        </div>
        <div className="settings-help">
          {t("settings.composer.followUp.help.before")}
          {followUpShortcutLabel}
          {t("settings.composer.followUp.help.after")}
        </div>
        <SettingsToggleRow
          title={t("settings.composer.followUp.hint.title")}
          subtitle={t("settings.composer.followUp.hint.subtitle")}
        >
          <SettingsToggleSwitch
            pressed={appSettings.composerFollowUpHintEnabled}
            onClick={() =>
              void onUpdateAppSettings({
                ...appSettings,
                composerFollowUpHintEnabled: !appSettings.composerFollowUpHintEnabled,
              })
            }
          />
        </SettingsToggleRow>
        {steerUnavailable && (
          <div className="settings-help">
            {t("settings.composer.followUp.steerUnavailableHelp")}
          </div>
        )}
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("settings.composer.presets.title")}</div>
      <div className="settings-subsection-subtitle">{t("settings.composer.presets.subtitle")}</div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-preset">
          {t("settings.composer.presets.label")}
        </label>
        <select
          id="composer-preset"
          className="settings-select"
          value={appSettings.composerEditorPreset}
          onChange={(event) =>
            onComposerPresetChange(event.target.value as ComposerPreset)
          }
        >
          {Object.entries(composerPresetLabels).map(([preset, label]) => (
            <option key={preset} value={preset}>
              {label}
            </option>
          ))}
        </select>
        <div className="settings-help">
          {t("settings.composer.presets.help")}
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("settings.composer.codeFences.title")}</div>
      <SettingsToggleRow
        title={t("settings.composer.codeFences.space.title")}
        subtitle={t("settings.composer.codeFences.space.subtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceExpandOnSpace}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceExpandOnSpace: !appSettings.composerFenceExpandOnSpace,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.composer.codeFences.enter.title")}
        subtitle={t("settings.composer.codeFences.enter.subtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceExpandOnEnter}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceExpandOnEnter: !appSettings.composerFenceExpandOnEnter,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.composer.codeFences.langTags.title")}
        subtitle={t("settings.composer.codeFences.langTags.subtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceLanguageTags}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceLanguageTags: !appSettings.composerFenceLanguageTags,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.composer.codeFences.wrapSelection.title")}
        subtitle={t("settings.composer.codeFences.wrapSelection.subtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceWrapSelection}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceWrapSelection: !appSettings.composerFenceWrapSelection,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.composer.codeFences.copyNoFence.title")}
        subtitle={
          <>
            {t("settings.composer.codeFences.copyNoFence.subtitle.before")}
            {optionKeyLabel}
            {t("settings.composer.codeFences.copyNoFence.subtitle.after")}
          </>
        }
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerCodeBlockCopyUseModifier}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerCodeBlockCopyUseModifier:
                !appSettings.composerCodeBlockCopyUseModifier,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("settings.composer.pasting.title")}</div>
      <SettingsToggleRow
        title={t("settings.composer.pasting.multiline.title")}
        subtitle={t("settings.composer.pasting.multiline.subtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceAutoWrapPasteMultiline}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceAutoWrapPasteMultiline:
                !appSettings.composerFenceAutoWrapPasteMultiline,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.composer.pasting.codeLike.title")}
        subtitle={t("settings.composer.pasting.codeLike.subtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceAutoWrapPasteCodeLike}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceAutoWrapPasteCodeLike:
                !appSettings.composerFenceAutoWrapPasteCodeLike,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("settings.composer.lists.title")}</div>
      <SettingsToggleRow
        title={t("settings.composer.lists.continue.title")}
        subtitle={t("settings.composer.lists.continue.subtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerListContinuation}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerListContinuation: !appSettings.composerListContinuation,
            })
          }
        />
      </SettingsToggleRow>
    </SettingsSection>
  );
}
