import type { AppSettings, DictationModelStatus } from "../../../../types";
import { formatDownloadSize } from "../../../../utils/formatting";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const dictationProgress = dictationModelStatus?.progress ?? null;

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t('settings.sections.dictation')}</div>
      <div className="settings-section-subtitle">
        {t('settings.dictation.enable')}
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t('settings.dictation.turn_on')}</div>
          <div className="settings-toggle-subtitle">
            {t('settings.dictation.first_use')}
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.dictationEnabled ? "on" : ""}`}
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
          aria-pressed={appSettings.dictationEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-model">
          {t('settings.dictation_model')}
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
          {selectedDictationModel.note} 下载大小：{selectedDictationModel.size}
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-language">
          {t('settings.dictation.language_preference')}
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
          <option value="">{t('settings.dictation.auto_detect_only')}</option>
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="it">Italian</option>
          <option value="pt">Portuguese</option>
          <option value="nl">Dutch</option>
          <option value="sv">Swedish</option>
          <option value="no">Norwegian</option>
          <option value="da">Danish</option>
          <option value="fi">Finnish</option>
          <option value="pl">Polish</option>
          <option value="tr">Turkish</option>
          <option value="ru">Russian</option>
          <option value="uk">Ukrainian</option>
          <option value="ja">Japanese</option>
          <option value="ko">Korean</option>
          <option value="zh">Chinese</option>
        </select>
        <div className="settings-help">
          {t('settings.dictation.language_preference_description')}
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-hold-key">
          {t('settings.dictation.hold_to_dictate')}
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
          <option value="">{t('settings.dictation.off')}</option>
          <option value="alt">{optionKeyLabel}</option>
          <option value="shift">{t('settings.dictation.shift_key')}</option>
          <option value="control">{t('settings.dictation.control_key')}</option>
          <option value="meta">{metaKeyLabel}</option>
        </select>
        <div className="settings-help">
          {t('settings.dictation.hold_to_dictate_description')}
        </div>
      </div>
      {dictationModelStatus && (
        <div className="settings-field">
          <div className="settings-field-label">{t('settings.dictation.model_status', { modelLabel: selectedDictationModel.label })}</div>
          <div className="settings-help">
            {dictationModelStatus.state === "ready" && t('settings.dictation.ready')}
            {dictationModelStatus.state === "missing" && t('settings.dictation.not_downloaded')}
            {dictationModelStatus.state === "downloading" && t('settings.dictation.downloading')}
            {dictationModelStatus.state === "error" &&
              (dictationModelStatus.error ?? t('settings.dictation.download_error'))}
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
                {t('settings.dictation.download_model')}
              </button>
            )}
            {dictationModelStatus.state === "downloading" && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onCancelDictationDownload}
                disabled={!onCancelDictationDownload}
              >
                {t('settings.dictation.cancel_download')}
              </button>
            )}
            {dictationReady && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onRemoveDictationModel}
                disabled={!onRemoveDictationModel}
              >
                {t('settings.dictation.remove_model')}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
