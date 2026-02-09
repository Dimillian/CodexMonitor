import type { AppSettings } from "../../../../types";
import { useTranslation } from "react-i18next";

type SettingsGitSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  commitMessagePromptDraft: string;
  commitMessagePromptDirty: boolean;
  commitMessagePromptSaving: boolean;
  onSetCommitMessagePromptDraft: (value: string) => void;
  onSaveCommitMessagePrompt: () => Promise<void>;
  onResetCommitMessagePrompt: () => Promise<void>;
};

export function SettingsGitSection({
  appSettings,
  onUpdateAppSettings,
  commitMessagePromptDraft,
  commitMessagePromptDirty,
  commitMessagePromptSaving,
  onSetCommitMessagePromptDraft,
  onSaveCommitMessagePrompt,
  onResetCommitMessagePrompt,
}: SettingsGitSectionProps) {
  const { t } = useTranslation();

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t('settings.features.git_diff')}</div>
      <div className="settings-section-subtitle">
        {t('settings.features.git_diff_description')}
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t('settings.features.preload_git_diff')}</div>
          <div className="settings-toggle-subtitle">{t('settings.features.preload_git_diff_description')}</div>
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
          <div className="settings-toggle-title">{t('settings.features.ignore_whitespace')}</div>
          <div className="settings-toggle-subtitle">
            {t('settings.features.ignore_whitespace_description')}
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
      <div className="settings-field">
        <div className="settings-field-label">{t('git_diff.commit_message_prompt')}</div>
        <div className="settings-help">
          {t('git_diff.commit_message_prompt_help', { code: '<code>{diff}</code>' })}
        </div>
        <textarea
          className="settings-agents-textarea"
          value={commitMessagePromptDraft}
          onChange={(event) => onSetCommitMessagePromptDraft(event.target.value)}
          spellCheck={false}
          disabled={commitMessagePromptSaving}
        />
        <div className="settings-field-actions">
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onResetCommitMessagePrompt();
            }}
            disabled={commitMessagePromptSaving || !commitMessagePromptDirty}
          >
            {t('settings.features.reset')}
          </button>
          <button
            type="button"
            className="primary settings-button-compact"
            onClick={() => {
              void onSaveCommitMessagePrompt();
            }}
            disabled={commitMessagePromptSaving || !commitMessagePromptDirty}
          >
            {commitMessagePromptSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </section>
  );
}
