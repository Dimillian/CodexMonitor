import type { Dispatch, SetStateAction } from "react";
import type { AppSettings } from "../../../../types";
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
  return (
    <section className="settings-section">
      <div className="settings-section-title">显示与声音</div>
      <div className="settings-section-subtitle">
        调整视觉与声音提醒偏好。
      </div>
      <div className="settings-subsection-title">显示</div>
      <div className="settings-subsection-subtitle">
        调整窗口背景与效果的显示方式。
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="theme-select">
          主题
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
          <option value="system">跟随系统</option>
          <option value="light">浅色</option>
          <option value="dark">深色</option>
          <option value="dim">暗色</option>
        </select>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">在消息中显示文件路径</div>
          <div className="settings-toggle-subtitle">
            在消息中的文件链接旁显示父级路径。
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
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="thread-scroll-restore-mode">
          线程切换滚动策略
        </label>
        <select
          id="thread-scroll-restore-mode"
          className="settings-select"
          value={appSettings.threadScrollRestoreMode}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              threadScrollRestoreMode:
                event.target.value as AppSettings["threadScrollRestoreMode"],
            })
          }
        >
          <option value="latest">进入线程自动到底部（推荐）</option>
          <option value="remember">回到上次阅读位置</option>
        </select>
        <div className="settings-help">
          自动到底部适合实时追踪输出；回到上次位置适合长线程分段阅读。
        </div>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">自动生成对话标题</div>
          <div className="settings-toggle-subtitle">
            根据首条消息自动生成简短标题（会额外消耗少量 token）。
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
          <div className="settings-toggle-title">降低透明效果</div>
          <div className="settings-toggle-subtitle">使用实体背景替代玻璃效果。</div>
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
          <div className="settings-toggle-title">界面缩放</div>
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
            aria-label="界面缩放"
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
            重置
          </button>
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="ui-font-family">
          界面字体
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
            重置
          </button>
        </div>
        <div className="settings-help">
          应用于所有界面文本。留空则使用系统默认字体栈。
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="code-font-family">
          代码字体
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
            重置
          </button>
        </div>
        <div className="settings-help">应用于代码块、Git diff 等等宽显示区域。</div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="code-font-size">
          代码字号
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
            重置
          </button>
        </div>
        <div className="settings-help">调整代码与 diff 文本大小。</div>
      </div>
      <div className="settings-subsection-title">声音</div>
      <div className="settings-subsection-subtitle">控制通知音频提醒。</div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">通知声音</div>
          <div className="settings-toggle-subtitle">
            窗口不在前台时，任务完成后播放提示音。
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
          <div className="settings-toggle-title">系统通知</div>
          <div className="settings-toggle-subtitle">
            窗口不在前台时，任务完成后显示系统级通知横幅。
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
          测试声音
        </button>
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={onTestSystemNotification}
        >
          测试通知
        </button>
      </div>
    </section>
  );
}
