import type { AppSettings, DictationModelStatus } from "@/types";
import { useI18n } from "@/i18n";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { formatDownloadSize } from "@utils/formatting";

type DictationModelOption = {
  id: string;
  label: string;
  size: string;
  note: string;
};

type SettingsDictationSectionProps = {
  appSettings: AppSettings;
  optionKeyLabel: string;
  metaKeyLabel: string;
  dictationModels: DictationModelOption[];
  selectedDictationModel: DictationModelOption;
  dictationModelStatus?: DictationModelStatus | null;
  dictationReady: boolean;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onDownloadDictationModel?: () => void;
  onCancelDictationDownload?: () => void;
  onRemoveDictationModel?: () => void;
};

export function SettingsDictationSection({
  appSettings,
  optionKeyLabel,
  metaKeyLabel,
  dictationModels,
  selectedDictationModel,
  dictationModelStatus,
  dictationReady,
  onUpdateAppSettings,
  onDownloadDictationModel,
  onCancelDictationDownload,
  onRemoveDictationModel,
}: SettingsDictationSectionProps) {
  const { tx } = useI18n();
  const dictationProgress = dictationModelStatus?.progress ?? null;

  return (
    <SettingsSection
      title={tx("Dictation")}
      subtitle={tx("Enable microphone dictation with on-device transcription.")}
    >
      <SettingsToggleRow
        title={tx("Enable dictation")}
        subtitle={tx("Downloads the selected Whisper model on first use.")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.dictationEnabled}
          onClick={() => {
            const nextEnabled = !appSettings.dictationEnabled;
            void onUpdateAppSettings({
              ...appSettings,
              dictationEnabled: nextEnabled,
            });
            if (
              !nextEnabled &&
              dictationModelStatus?.state === "downloading" &&
              onCancelDictationDownload
            ) {
              onCancelDictationDownload();
            }
            if (
              nextEnabled &&
              dictationModelStatus?.state === "missing" &&
              onDownloadDictationModel
            ) {
              onDownloadDictationModel();
            }
          }}
        />
      </SettingsToggleRow>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-model">
          {tx("Dictation model")}
        </label>
        <select
          id="dictation-model"
          className="settings-select"
          value={appSettings.dictationModelId}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              dictationModelId: event.target.value,
            })
          }
        >
          {dictationModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label} ({model.size})
            </option>
          ))}
        </select>
        <div className="settings-help">
          {tx(selectedDictationModel.note)}{" "}
          {tx("Download size: {size}.", { size: selectedDictationModel.size })}
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-language">
          {tx("Preferred dictation language")}
        </label>
        <select
          id="dictation-language"
          className="settings-select"
          value={appSettings.dictationPreferredLanguage ?? ""}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              dictationPreferredLanguage: event.target.value || null,
            })
          }
        >
          <option value="">{tx("Auto-detect only")}</option>
          <option value="en">{tx("English")}</option>
          <option value="es">{tx("Spanish")}</option>
          <option value="fr">{tx("French")}</option>
          <option value="de">{tx("German")}</option>
          <option value="it">{tx("Italian")}</option>
          <option value="pt">{tx("Portuguese")}</option>
          <option value="nl">{tx("Dutch")}</option>
          <option value="sv">{tx("Swedish")}</option>
          <option value="no">{tx("Norwegian")}</option>
          <option value="da">{tx("Danish")}</option>
          <option value="fi">{tx("Finnish")}</option>
          <option value="pl">{tx("Polish")}</option>
          <option value="tr">{tx("Turkish")}</option>
          <option value="ru">{tx("Russian")}</option>
          <option value="uk">{tx("Ukrainian")}</option>
          <option value="ja">{tx("Japanese")}</option>
          <option value="ko">{tx("Korean")}</option>
          <option value="zh">{tx("Chinese")}</option>
        </select>
        <div className="settings-help">
          {tx("Auto-detect stays on; this nudges the decoder toward your preference.")}
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-hold-key">
          {tx("Hold-to-dictate key")}
        </label>
        <select
          id="dictation-hold-key"
          className="settings-select"
          value={appSettings.dictationHoldKey ?? ""}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              dictationHoldKey: event.target.value,
            })
          }
        >
          <option value="">{tx("Off")}</option>
          <option value="alt">{optionKeyLabel}</option>
          <option value="shift">{tx("Shift")}</option>
          <option value="control">{tx("Control")}</option>
          <option value="meta">{metaKeyLabel}</option>
        </select>
        <div className="settings-help">
          {tx("Hold the key to start dictation, release to stop and process.")}
        </div>
      </div>
      {dictationModelStatus && (
        <div className="settings-field">
          <div className="settings-field-label">
            {tx("Model status ({model})", { model: selectedDictationModel.label })}
          </div>
          <div className="settings-help">
            {dictationModelStatus.state === "ready" && tx("Ready for dictation.")}
            {dictationModelStatus.state === "missing" && tx("Model not downloaded yet.")}
            {dictationModelStatus.state === "downloading" && tx("Downloading model...")}
            {dictationModelStatus.state === "error" &&
              (dictationModelStatus.error ?? tx("Download error."))}
          </div>
          {dictationProgress && (
            <div className="settings-download-progress">
              <div className="settings-download-bar">
                <div
                  className="settings-download-fill"
                  style={{
                    width: dictationProgress.totalBytes
                      ? `${Math.min(
                          100,
                          (dictationProgress.downloadedBytes / dictationProgress.totalBytes) * 100,
                        )}%`
                      : "0%",
                  }}
                />
              </div>
              <div className="settings-download-meta">
                {formatDownloadSize(dictationProgress.downloadedBytes)}
              </div>
            </div>
          )}
          <div className="settings-field-actions">
            {dictationModelStatus.state === "missing" && (
              <button
                type="button"
                className="primary"
                onClick={onDownloadDictationModel}
                disabled={!onDownloadDictationModel}
              >
                {tx("Download model")}
              </button>
            )}
            {dictationModelStatus.state === "downloading" && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onCancelDictationDownload}
                disabled={!onCancelDictationDownload}
              >
                {tx("Cancel download")}
              </button>
            )}
            {dictationReady && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onRemoveDictationModel}
                disabled={!onRemoveDictationModel}
              >
                {tx("Remove model")}
              </button>
            )}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
