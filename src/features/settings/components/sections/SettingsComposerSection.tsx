import { Trans, useTranslation } from "react-i18next";
import type { AppSettings } from "@/types";
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
  composerPresetLabelKeys: Record<ComposerPreset, string>;
  onComposerPresetChange: (preset: ComposerPreset) => void;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export function SettingsComposerSection({
  appSettings,
  optionKeyLabel,
  followUpShortcutLabel,
  composerPresetLabelKeys,
  onComposerPresetChange,
  onUpdateAppSettings,
}: SettingsComposerSectionProps) {
  const { t } = useTranslation("settings");
  const steerUnavailable = !appSettings.steerEnabled;
  return (
    <SettingsSection
      title={t("composer_title")}
      subtitle={t("composer_subtitle")}
    >
      <div className="settings-field">
        <div className="settings-field-label">{t("composer_follow_up_behavior")}</div>
        <div className={`settings-segmented${appSettings.followUpMessageBehavior === "steer" ? " is-second-active" : ""}`} aria-label={t("composer_follow_up_aria")}>
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
            <span className="settings-segmented-option-label">{t("composer_queue")}</span>
          </label>
          <label
            className={`settings-segmented-option${
              appSettings.followUpMessageBehavior === "steer" ? " is-active" : ""
            }${steerUnavailable ? " is-disabled" : ""}`}
            title={steerUnavailable ? t("composer_steer_unavailable") : ""}
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
            <span className="settings-segmented-option-label">{t("composer_steer")}</span>
          </label>
        </div>
        <div className="settings-help">
          {t("composer_follow_up_help", { shortcut: followUpShortcutLabel })}
        </div>
        <SettingsToggleRow
          title={t("composer_show_follow_up_hint")}
          subtitle={t("composer_follow_up_hint_subtitle")}
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
            {t("composer_steer_unavailable_msg")}
          </div>
        )}
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("composer_presets")}</div>
      <div className="settings-subsection-subtitle">
        {t("composer_presets_subtitle")}
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-preset">
          {t("composer_preset")}
        </label>
        <select
          id="composer-preset"
          className="settings-select"
          value={appSettings.composerEditorPreset}
          onChange={(event) =>
            onComposerPresetChange(event.target.value as ComposerPreset)
          }
        >
          {Object.entries(composerPresetLabelKeys).map(([preset, labelKey]) => (
            <option key={preset} value={preset}>
              {t(labelKey)}
            </option>
          ))}
        </select>
        <div className="settings-help">
          {t("composer_preset_help")}
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("composer_code_fences")}</div>
      <SettingsToggleRow
        title={t("composer_expand_fences_space")}
        subtitle={t("composer_expand_fences_space_subtitle")}
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
        title={t("composer_expand_fences_enter")}
        subtitle={t("composer_expand_fences_enter_subtitle")}
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
        title={t("composer_language_tags")}
        subtitle={t("composer_language_tags_subtitle")}
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
        title={t("composer_wrap_selection")}
        subtitle={t("composer_wrap_selection_subtitle")}
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
        title={t("composer_copy_blocks")}
        subtitle={
          <Trans i18nKey="settings:composer_copy_blocks_subtitle" values={{ key: optionKeyLabel }} />
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
      <div className="settings-subsection-title">{t("composer_pasting")}</div>
      <SettingsToggleRow
        title={t("composer_auto_wrap_multiline")}
        subtitle={t("composer_auto_wrap_multiline_subtitle")}
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
        title={t("composer_auto_wrap_code_like")}
        subtitle={t("composer_auto_wrap_code_like_subtitle")}
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
      <div className="settings-subsection-title">{t("composer_lists")}</div>
      <SettingsToggleRow
        title={t("composer_continue_lists")}
        subtitle={t("composer_continue_lists_subtitle")}
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
