import type { AppSettings } from "@/types";

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
      <div className="settings-section-title">Composer</div>
      <div className="settings-section-subtitle">
        Control helpers and formatting behavior inside the message editor.
      </div>
      <div className="settings-subsection-title">Presets</div>
      <div className="settings-subsection-subtitle">
        Choose a starting point and fine-tune the toggles below.
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-preset">
          Preset
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
          Presets update the toggles below. Customize any setting after selecting.
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">Code fences</div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Expand fences on Space</div>
          <div className="settings-toggle-subtitle">
            Typing ``` then Space inserts a fenced block.
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
          <div className="settings-toggle-title">Expand fences on Enter</div>
          <div className="settings-toggle-subtitle">
            Use Enter to expand ``` lines when enabled.
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
          <div className="settings-toggle-title">Support language tags</div>
          <div className="settings-toggle-subtitle">
            Allows ```lang + Space to include a language.
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
          <div className="settings-toggle-title">Wrap selection in fences</div>
          <div className="settings-toggle-subtitle">
            Wraps selected text when creating a fence.
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
          <div className="settings-toggle-title">Copy blocks without fences</div>
          <div className="settings-toggle-subtitle">
            When enabled, Copy is plain text. Hold {optionKeyLabel} to include ``` fences.
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
      <div className="settings-subsection-title">Pasting</div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Auto-wrap multi-line paste</div>
          <div className="settings-toggle-subtitle">
            Wraps multi-line paste inside a fenced block.
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
          <div className="settings-toggle-title">Auto-wrap code-like single lines</div>
          <div className="settings-toggle-subtitle">
            Wraps long single-line code snippets on paste.
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
      <div className="settings-subsection-title">Lists</div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Continue lists on Shift+Enter</div>
          <div className="settings-toggle-subtitle">
            Continues numbered and bulleted lists when the line has content.
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
