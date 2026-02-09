import type { Dispatch, SetStateAction } from "react";
import type { AppSettings } from "../../../../types";
import { useTranslation } from "react-i18next";
import {
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  CODE_FONT_SIZE_DEFAULT,
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
} from "../../../../utils/fonts";

type SettingsDisplaySectionProps = {
  appSettings: AppSettings;
  reduceTransparency: boolean;
  scaleShortcutTitle: string;
  scaleShortcutText: string;
  scaleDraft: string;
  uiFontDraft: string;
  codeFontDraft: string;
  codeFontSizeDraft: number;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onToggleTransparency: (value: boolean) => void;
  onSetScaleDraft: Dispatch<SetStateAction<string>>;
  onCommitScale: () => Promise<void>;
  onResetScale: () => Promise<void>;
  onSetUiFontDraft: Dispatch<SetStateAction<string>>;
  onCommitUiFont: () => Promise<void>;
  onSetCodeFontDraft: Dispatch<SetStateAction<string>>;
  onCommitCodeFont: () => Promise<void>;
  onSetCodeFontSizeDraft: Dispatch<SetStateAction<number>>;
  onCommitCodeFontSize: (nextSize: number) => Promise<void>;
  onTestNotificationSound: () => void;
  onTestSystemNotification: () => void;
};

export function SettingsDisplaySection({
  appSettings,
  reduceTransparency,
  scaleShortcutTitle,
  scaleShortcutText,
  scaleDraft,
  uiFontDraft,
  codeFontDraft,
  codeFontSizeDraft,
  onUpdateAppSettings,
  onToggleTransparency,
  onSetScaleDraft,
  onCommitScale,
  onResetScale,
  onSetUiFontDraft,
  onCommitUiFont,
  onSetCodeFontDraft,
  onCommitCodeFont,
  onSetCodeFontSizeDraft,
  onCommitCodeFontSize,
  onTestNotificationSound,
  onTestSystemNotification,
}: SettingsDisplaySectionProps) {
  const { t } = useTranslation();

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t("settings.sections.display_sound")}</div>
      <div className="settings-section-subtitle">
        {t("settings.display_sound.adjust")}
      </div>
      <div className="settings-subsection-title">{t("settings.display_sound.display")}</div>
      <div className="settings-subsection-subtitle">
        {t("settings.display_sound.rendering")}
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="theme-select">
          {t("settings.theme")}
        </label>
        <select
          id="theme-select"
          className="settings-select"
          value={appSettings.theme}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              theme: event.target.value as AppSettings["theme"],
            })
          }
        >
          <option value="system">{t("settings.system")}</option>
          <option value="light">{t("settings.light")}</option>
          <option value="dark">{t("settings.dark")}</option>
          <option value="dim">{t("settings.dim")}</option>
        </select>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.show_remaining_limits")}</div>
          <div className="settings-toggle-subtitle">
            {t("settings.show_remaining_subtitle")}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.usageShowRemaining ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              usageShowRemaining: !appSettings.usageShowRemaining,
            })
          }
          aria-pressed={appSettings.usageShowRemaining}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.show_file_path_in_messages")}</div>
          <div className="settings-toggle-subtitle">
            {t("settings.show_file_path_in_messages_subtitle")}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.showMessageFilePath ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              showMessageFilePath: !appSettings.showMessageFilePath,
            })
          }
          aria-pressed={appSettings.showMessageFilePath}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.auto_generate_thread_titles")}</div>
          <div className="settings-toggle-subtitle">
            {t("settings.auto_generate_thread_titles_subtitle")}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.threadTitleAutogenerationEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              threadTitleAutogenerationEnabled:
                !appSettings.threadTitleAutogenerationEnabled,
            })
          }
          aria-pressed={appSettings.threadTitleAutogenerationEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.reduce_transparency")}</div>
          <div className="settings-toggle-subtitle">{t("settings.reduce_transparency_subtitle")}</div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${reduceTransparency ? "on" : ""}`}
          onClick={() => onToggleTransparency(!reduceTransparency)}
          aria-pressed={reduceTransparency}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row settings-scale-row">
        <div>
          <div className="settings-toggle-title">{t("settings.ui_scale")}</div>
          <div className="settings-toggle-subtitle" title={scaleShortcutTitle}>
            {scaleShortcutText}
          </div>
        </div>
        <div className="settings-scale-controls">
          <input
            id="ui-scale"
            type="text"
            inputMode="decimal"
            className="settings-input settings-input--scale"
            value={scaleDraft}
            aria-label={t("settings.ui_scale")}
            onChange={(event) => onSetScaleDraft(event.target.value)}
            onBlur={() => {
              void onCommitScale();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onCommitScale();
              }
            }}
          />
          <button
            type="button"
            className="ghost settings-scale-reset"
            onClick={() => {
              void onResetScale();
            }}
          >
            {t("settings.reset")}
          </button>
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="ui-font-family">
          {t("settings.ui_font_family")}
        </label>
        <div className="settings-field-row">
          <input
            id="ui-font-family"
            type="text"
            className="settings-input"
            value={uiFontDraft}
            onChange={(event) => onSetUiFontDraft(event.target.value)}
            onBlur={() => {
              void onCommitUiFont();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onCommitUiFont();
              }
            }}
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              onSetUiFontDraft(DEFAULT_UI_FONT_FAMILY);
              void onUpdateAppSettings({
                ...appSettings,
                uiFontFamily: DEFAULT_UI_FONT_FAMILY,
              });
            }}
          >
            {t("settings.reset")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.display_sound.ui_font_description")}
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="code-font-family">
          {t("settings.code_font_family")}
        </label>
        <div className="settings-field-row">
          <input
            id="code-font-family"
            type="text"
            className="settings-input"
            value={codeFontDraft}
            onChange={(event) => onSetCodeFontDraft(event.target.value)}
            onBlur={() => {
              void onCommitCodeFont();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onCommitCodeFont();
              }
            }}
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              onSetCodeFontDraft(DEFAULT_CODE_FONT_FAMILY);
              void onUpdateAppSettings({
                ...appSettings,
                codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
              });
            }}
          >
            {t("settings.reset")}
          </button>
        </div>
        <div className="settings-help">{t("settings.code_font_help")}</div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="code-font-size">
          {t("settings.code_font_size")}
        </label>
        <div className="settings-field-row">
          <input
            id="code-font-size"
            type="range"
            min={CODE_FONT_SIZE_MIN}
            max={CODE_FONT_SIZE_MAX}
            step={1}
            className="settings-input settings-input--range"
            value={codeFontSizeDraft}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              onSetCodeFontSizeDraft(nextValue);
              void onCommitCodeFontSize(nextValue);
            }}
          />
          <div className="settings-scale-value">{codeFontSizeDraft}px</div>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              onSetCodeFontSizeDraft(CODE_FONT_SIZE_DEFAULT);
              void onCommitCodeFontSize(CODE_FONT_SIZE_DEFAULT);
            }}
          >
            {t("settings.reset")}
          </button>
        </div>
        <div className="settings-help">{t("settings.display_sound.code_font_description")}</div>
      </div>
      <div className="settings-subsection-title">{t("settings.display_sound.sound")}</div>
      <div className="settings-subsection-subtitle">{t("settings.display_sound.control_sounds")}</div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.notification_sounds")}</div>
          <div className="settings-toggle-subtitle">
            {t("settings.display_sound.notification_sound_description")}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.notificationSoundsEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              notificationSoundsEnabled: !appSettings.notificationSoundsEnabled,
            })
          }
          aria-pressed={appSettings.notificationSoundsEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.system_notifications")}</div>
          <div className="settings-toggle-subtitle">
            {t("settings.system_notifications_subtitle")}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.systemNotificationsEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              systemNotificationsEnabled: !appSettings.systemNotificationsEnabled,
            })
          }
          aria-pressed={appSettings.systemNotificationsEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-sound-actions">
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={onTestNotificationSound}
        >
          {t("settings.test_notification_sound")}
        </button>
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={onTestSystemNotification}
        >
          {t("settings.test_system_notification")}
        </button>
      </div>
    </section>
  );
}
