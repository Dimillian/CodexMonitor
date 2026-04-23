import type { AppSettings } from "@/types";
import { useI18n } from "@/i18n";
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
  const { tx } = useI18n();
  const steerUnavailable = !appSettings.steerEnabled;
  return (
    <SettingsSection
      title={tx("Composer")}
      subtitle={tx("Control helpers and formatting behavior inside the message editor.")}
    >
      <div className="settings-field">
        <div className="settings-field-label">{tx("Follow-up behavior")}</div>
        <div className={`settings-segmented${appSettings.followUpMessageBehavior === "steer" ? " is-second-active" : ""}`} aria-label={tx("Follow-up behavior")}>
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
            <span className="settings-segmented-option-label">{tx("Queue")}</span>
          </label>
          <label
            className={`settings-segmented-option${
              appSettings.followUpMessageBehavior === "steer" ? " is-active" : ""
            }${steerUnavailable ? " is-disabled" : ""}`}
            title={steerUnavailable ? tx("Steer is unavailable in the current Codex config.") : ""}
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
            <span className="settings-segmented-option-label">{tx("Steer")}</span>
          </label>
        </div>
        <div className="settings-help">
          {tx("Choose the default while a run is active. Press {shortcut} to send the opposite behavior for one message.", {
            shortcut: followUpShortcutLabel,
          })}
        </div>
        <SettingsToggleRow
          title={tx("Show follow-up hint while processing")}
          subtitle={tx("Displays queue/steer shortcut guidance above the composer.")}
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
            {tx("Steer is unavailable in the current Codex config. Follow-ups will queue.")}
          </div>
        )}
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{tx("Presets")}</div>
      <div className="settings-subsection-subtitle">
        {tx("Choose a starting point and fine-tune the toggles below.")}
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-preset">
          {tx("Preset")}
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
              {tx(label)}
            </option>
          ))}
        </select>
        <div className="settings-help">
          {tx("Presets update the toggles below. Customize any setting after selecting.")}
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{tx("Code fences")}</div>
      <SettingsToggleRow
        title={tx("Expand fences on Space")}
        subtitle={tx("Typing ``` then Space inserts a fenced block.")}
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
        title={tx("Expand fences on Enter")}
        subtitle={tx("Use Enter to expand ``` lines when enabled.")}
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
        title={tx("Support language tags")}
        subtitle={tx("Allows ```lang + Space to include a language.")}
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
        title={tx("Wrap selection in fences")}
        subtitle={tx("Wraps selected text when creating a fence.")}
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
        title={tx("Copy blocks without fences")}
        subtitle={
          <>
            {tx("When enabled, Copy is plain text. Hold {key} to include ``` fences.", {
              key: optionKeyLabel,
            })}
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
      <div className="settings-subsection-title">{tx("Pasting")}</div>
      <SettingsToggleRow
        title={tx("Auto-wrap multi-line paste")}
        subtitle={tx("Wraps multi-line paste inside a fenced block.")}
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
        title={tx("Auto-wrap code-like single lines")}
        subtitle={tx("Wraps long single-line code snippets on paste.")}
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
      <div className="settings-subsection-title">{tx("Lists")}</div>
      <SettingsToggleRow
        title={tx("Continue lists on Shift+Enter")}
        subtitle={tx("Continues numbered and bulleted lists when the line has content.")}
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
