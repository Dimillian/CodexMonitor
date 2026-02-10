import type { AppSettings } from "../../../../types";

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
  return (
    <section className="settings-section">
      <div className="settings-section-title">编辑器</div>
      <div className="settings-section-subtitle">
        控制输入框中的快捷输入与格式化行为。
      </div>
      <div className="settings-subsection-title">快捷输入预设</div>
      <div className="settings-subsection-subtitle">
        选择一个起点，然后按需微调下方各项开关。
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-preset">
          预设方案
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
          切换预设会重置下方开关；选择后仍可逐项调整。
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">代码块</div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">空格创建代码块</div>
          <div className="settings-toggle-subtitle">
            输入三个反引号 ``` 后按空格，自动插入代码块。
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
          <div className="settings-toggle-title">回车创建代码块</div>
          <div className="settings-toggle-subtitle">
            输入三个反引号 ``` 后按回车，自动插入代码块。
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
          <div className="settings-toggle-title">语言标记</div>
          <div className="settings-toggle-subtitle">
            支持输入 ```python 等语言名 + 空格，自动标记代码块语言。
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
          <div className="settings-toggle-title">选中文本自动包裹</div>
          <div className="settings-toggle-subtitle">
            创建代码块时，自动将已选中的文本包裹在其中。
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
          <div className="settings-toggle-title">复制代码块为纯文本</div>
          <div className="settings-toggle-subtitle">
            复制时只保留代码内容，不含 ``` 标记。按住 {optionKeyLabel} 可保留完整格式。
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
      <div className="settings-subsection-title">粘贴</div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">多行粘贴自动成块</div>
          <div className="settings-toggle-subtitle">
            粘贴多行内容时，自动包裹为代码块。
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
          <div className="settings-toggle-title">单行代码自动成块</div>
          <div className="settings-toggle-subtitle">
            粘贴较长的单行代码时，自动包裹为代码块。
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
      <div className="settings-subsection-title">列表</div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Shift+Enter 继续列表</div>
          <div className="settings-toggle-subtitle">
            在有序列表或项目符号列表中按 Shift+Enter，自动续写下一项。
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
