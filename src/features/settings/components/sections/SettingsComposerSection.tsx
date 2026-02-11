import type { AppSettings } from "@/types";
import { useTranslation } from "react-i18next";

type ComposerPreset = AppSettings["composerEditorPreset"];

type SettingsComposerSectionProps = {
  appSettings: AppSettings;
  optionKeyLabel: string;
  composerPresetLabels: Record<ComposerPreset, string>;
  onComposerPresetChange: (preset: ComposerPreset) => void;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export function SettingsComposerSection({
  appSettings,
  optionKeyLabel,
  composerPresetLabels,
  onComposerPresetChange,
  onUpdateAppSettings,
}: SettingsComposerSectionProps) {
  const { t } = useTranslation();

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t("settings.composer.title")}</div>
      <div className="settings-section-subtitle">
        {t("settings.composer.control")}
      </div>
      <div className="settings-subsection-title">{t("settings.composer.presets")}</div>
      <div className="settings-subsection-subtitle">
        {t("settings.composer.presets_description")}
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-preset">
          {t("settings.composer.preset")}
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
          {t("settings.composer.presets_sync")}
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("settings.composer.code_fences")}</div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.composer.expand_on_space")}</div>
          <div className="settings-toggle-subtitle">
            {t("settings.composer.expand_on_space_description")}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.composerFenceExpandOnSpace ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceExpandOnSpace: !appSettings.composerFenceExpandOnSpace,
            })
          }
          aria-pressed={appSettings.composerFenceExpandOnSpace}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.composer.expand_on_enter")}</div>
          <div className="settings-toggle-subtitle">
            {t("settings.composer.expand_on_enter_description")}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.composerFenceExpandOnEnter ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceExpandOnEnter: !appSettings.composerFenceExpandOnEnter,
            })
          }
          aria-pressed={appSettings.composerFenceExpandOnEnter}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.composer.language_tags")}</div>
          <div className="settings-toggle-subtitle">
            {t("settings.composer.language_tags_description")}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.composerFenceLanguageTags ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceLanguageTags: !appSettings.composerFenceLanguageTags,
            })
          }
          aria-pressed={appSettings.composerFenceLanguageTags}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.composer.wrap_selection")}</div>
          <div className="settings-toggle-subtitle">
            {t("settings.composer.wrap_selection_description")}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.composerFenceWrapSelection ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceWrapSelection: !appSettings.composerFenceWrapSelection,
            })
          }
          aria-pressed={appSettings.composerFenceWrapSelection}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.composer.copy_without_fences")}</div>
          <div className="settings-toggle-subtitle">
            {t("settings.composer.copy_without_fences_description", { optionKeyLabel })}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.composerCodeBlockCopyUseModifier ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerCodeBlockCopyUseModifier:
                !appSettings.composerCodeBlockCopyUseModifier,
            })
          }
          aria-pressed={appSettings.composerCodeBlockCopyUseModifier}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("settings.composer.paste")}</div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.composer.auto_wrap_multiline")}</div>
          <div className="settings-toggle-subtitle">
            {t("settings.composer.auto_wrap_multiline_description")}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.composerFenceAutoWrapPasteMultiline ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceAutoWrapPasteMultiline:
                !appSettings.composerFenceAutoWrapPasteMultiline,
            })
          }
          aria-pressed={appSettings.composerFenceAutoWrapPasteMultiline}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.composer.auto_wrap_single_line")}</div>
          <div className="settings-toggle-subtitle">
            {t("settings.composer.auto_wrap_single_line_description")}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.composerFenceAutoWrapPasteCodeLike ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceAutoWrapPasteCodeLike:
                !appSettings.composerFenceAutoWrapPasteCodeLike,
            })
          }
          aria-pressed={appSettings.composerFenceAutoWrapPasteCodeLike}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("settings.composer.lists")}</div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.composer.continue_list")}</div>
          <div className="settings-toggle-subtitle">
            {t("settings.composer.continue_list_description")}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.composerListContinuation ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerListContinuation: !appSettings.composerListContinuation,
            })
          }
          aria-pressed={appSettings.composerListContinuation}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
    </section>
  );
}
