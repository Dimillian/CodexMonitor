import type { AppSettings } from "../../../../types";

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
  return (
    <section className="settings-section">
      <div className="settings-section-title">Git</div>
      <div className="settings-section-subtitle">
        管理 Git 变更对比（diff）的加载和显示偏好。
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">预加载变更对比</div>
          <div className="settings-toggle-subtitle">提前加载 Git diff 内容，切换文件时显示更快。</div>
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
          <div className="settings-toggle-title">忽略空白字符变化</div>
          <div className="settings-toggle-subtitle">
            隐藏仅包含空格、缩进等空白字符的变更行。
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
        <div className="settings-field-label">Commit Message 生成提示词</div>
        <div className="settings-help">
          自定义 AI 生成提交信息的提示词模板。使用 <code>{"{diff}"}</code> 占位符插入当前 diff 内容。
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
            重置
          </button>
          <button
            type="button"
            className="primary settings-button-compact"
            onClick={() => {
              void onSaveCommitMessagePrompt();
            }}
            disabled={commitMessagePromptSaving || !commitMessagePromptDirty}
          >
            {commitMessagePromptSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </section>
  );
}
