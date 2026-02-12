import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { AppSettings } from "@/types";
import {
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  CODE_FONT_SIZE_DEFAULT,
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
} from "@utils/fonts";

const CHAT_SCROLLBACK_DEFAULT = 200;
const CHAT_SCROLLBACK_MIN = 50;
const CHAT_SCROLLBACK_MAX = 5000;
const CHAT_SCROLLBACK_PRESETS = [200, 500, 1000, 2000, 5000] as const;

function clampChatScrollbackItems(value: number) {
  return Math.min(CHAT_SCROLLBACK_MAX, Math.max(CHAT_SCROLLBACK_MIN, Math.round(value)));
}

function isChatScrollbackPreset(
  value: number,
): value is (typeof CHAT_SCROLLBACK_PRESETS)[number] {
  return CHAT_SCROLLBACK_PRESETS.some((preset) => preset === value);
}

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
  const scrollbackUnlimited = appSettings.chatHistoryScrollbackItems === null;
  const [scrollbackDraft, setScrollbackDraft] = useState(() => {
    const value = appSettings.chatHistoryScrollbackItems;
    return typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : String(CHAT_SCROLLBACK_DEFAULT);
  });

  useEffect(() => {
    const value = appSettings.chatHistoryScrollbackItems;
    if (typeof value === "number" && Number.isFinite(value)) {
      setScrollbackDraft(String(value));
    }
  }, [appSettings.chatHistoryScrollbackItems]);

  const scrollbackPresetValue = (() => {
    const value = appSettings.chatHistoryScrollbackItems;
    if (typeof value === "number" && isChatScrollbackPreset(value)) {
      return String(value);
    }
    return "custom";
  })();

  const commitScrollback = () => {
    if (scrollbackUnlimited) {
      return;
    }
    const trimmed = scrollbackDraft.trim();
    const parsed = trimmed ? Number(trimmed) : Number.NaN;
    if (!Number.isFinite(parsed)) {
      const current = appSettings.chatHistoryScrollbackItems;
      const fallback =
        typeof current === "number" && Number.isFinite(current)
          ? current
          : CHAT_SCROLLBACK_DEFAULT;
      setScrollbackDraft(String(fallback));
      return;
    }
    const nextValue = clampChatScrollbackItems(parsed);
    setScrollbackDraft(String(nextValue));
    if (appSettings.chatHistoryScrollbackItems === nextValue) {
      return;
    }
    void onUpdateAppSettings({
      ...appSettings,
      chatHistoryScrollbackItems: nextValue,
    });
  };

  const toggleUnlimitedScrollback = () => {
    const nextUnlimited = !scrollbackUnlimited;
    if (nextUnlimited) {
      void onUpdateAppSettings({
        ...appSettings,
        chatHistoryScrollbackItems: null,
      });
      return;
    }
    const trimmed = scrollbackDraft.trim();
    const parsed = trimmed ? Number(trimmed) : Number.NaN;
    const nextValue = Number.isFinite(parsed)
      ? clampChatScrollbackItems(parsed)
      : CHAT_SCROLLBACK_DEFAULT;
    setScrollbackDraft(String(nextValue));
    void onUpdateAppSettings({
      ...appSettings,
      chatHistoryScrollbackItems: nextValue,
    });
  };

  const selectScrollbackPreset = (rawValue: string) => {
    if (rawValue === "custom") {
      return;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const nextValue = clampChatScrollbackItems(parsed);
    setScrollbackDraft(String(nextValue));
    void onUpdateAppSettings({
      ...appSettings,
      chatHistoryScrollbackItems: nextValue,
    });
  };

  return (
    <section className="settings-section">
      <div className="settings-section-title">Display &amp; Sound</div>
      <div className="settings-section-subtitle">
        Tune visuals and audio alerts to your preferences.
      </div>
      <div className="settings-subsection-title">Display</div>
      <div className="settings-subsection-subtitle">
        Adjust how the window renders backgrounds and effects.
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="theme-select">
          Theme
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
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="dim">Dim</option>
        </select>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Show remaining Codex limits</div>
          <div className="settings-toggle-subtitle">
            Display what is left instead of what is used.
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
          <div className="settings-toggle-title">Show file path in messages</div>
          <div className="settings-toggle-subtitle">
            Display the parent path next to file links in messages.
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
          <div className="settings-toggle-title">Split chat and diff center panes</div>
          <div className="settings-toggle-subtitle">
            Show chat and diff side by side instead of swapping between them.
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.splitChatDiffView ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              splitChatDiffView: !appSettings.splitChatDiffView,
            })
          }
          aria-pressed={appSettings.splitChatDiffView}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Auto-generate new thread titles</div>
          <div className="settings-toggle-subtitle">
            Generate a short title from your first message (uses extra tokens).
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
      <div className="settings-subsection-title">Chat</div>
      <div className="settings-subsection-subtitle">
        Control how much conversation history is retained per thread.
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Unlimited chat history</div>
          <div className="settings-toggle-subtitle">
            Keep full thread history in memory (may impact performance).
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${scrollbackUnlimited ? "on" : ""}`}
          onClick={toggleUnlimitedScrollback}
          aria-pressed={scrollbackUnlimited}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="chat-scrollback-preset">
          Scrollback preset
        </label>
        <select
          id="chat-scrollback-preset"
          className="settings-select"
          value={scrollbackPresetValue}
          onChange={(event) => selectScrollbackPreset(event.target.value)}
        >
          <option value="custom">Custom</option>
          {CHAT_SCROLLBACK_PRESETS.map((value) => (
            <option key={value} value={value}>
              {value === CHAT_SCROLLBACK_DEFAULT ? `${value} (Default)` : value}
            </option>
          ))}
        </select>
        <div className="settings-help">
          Higher values keep more history but may increase memory usage. Use “Sync from
          server” on a thread to re-fetch older messages.
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="chat-scrollback-items">
          Max items per thread
        </label>
        <div className="settings-field-row">
          <input
            id="chat-scrollback-items"
            type="text"
            inputMode="numeric"
            className="settings-input"
            value={scrollbackDraft}
            disabled={scrollbackUnlimited}
            onChange={(event) => setScrollbackDraft(event.target.value)}
            onBlur={commitScrollback}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitScrollback();
              }
            }}
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              setScrollbackDraft(String(CHAT_SCROLLBACK_DEFAULT));
              void onUpdateAppSettings({
                ...appSettings,
                chatHistoryScrollbackItems: CHAT_SCROLLBACK_DEFAULT,
              });
            }}
          >
            Reset
          </button>
        </div>
        <div className="settings-help">
          Range: {CHAT_SCROLLBACK_MIN}–{CHAT_SCROLLBACK_MAX}. Counts messages, tool calls,
          and other conversation items.
        </div>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Reduce transparency</div>
          <div className="settings-toggle-subtitle">Use solid surfaces instead of glass.</div>
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
          <div className="settings-toggle-title">Interface scale</div>
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
            aria-label="Interface scale"
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
            Reset
          </button>
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="ui-font-family">
          UI font family
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
            Reset
          </button>
        </div>
        <div className="settings-help">
          Applies to all UI text. Leave empty to use the default system font stack.
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="code-font-family">
          Code font family
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
            Reset
          </button>
        </div>
        <div className="settings-help">Applies to git diffs and other mono-spaced readouts.</div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="code-font-size">
          Code font size
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
            Reset
          </button>
        </div>
        <div className="settings-help">Adjusts code and diff text size.</div>
      </div>
      <div className="settings-subsection-title">Sounds</div>
      <div className="settings-subsection-subtitle">Control notification audio alerts.</div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Notification sounds</div>
          <div className="settings-toggle-subtitle">
            Play a sound when a long-running agent finishes while the window is unfocused.
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
          <div className="settings-toggle-title">System notifications</div>
          <div className="settings-toggle-subtitle">
            Show a system notification when a long-running agent finishes while the window is
            unfocused.
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
          Test sound
        </button>
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={onTestSystemNotification}
        >
          Test notification
        </button>
      </div>
    </section>
  );
}
