import { useTranslation } from "react-i18next";
import type { AppSettings, DictationModelStatus } from "@/types";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { formatDownloadSize } from "@utils/formatting";

type DictationModelOption = {
  id: string;
  labelKey: string;
  size: string;
  noteKey: string;
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
  const { t } = useTranslation("settings");
  const dictationProgress = dictationModelStatus?.progress ?? null;

  return (
    <SettingsSection
      title={t("dictation_title")}
      subtitle={t("dictation_subtitle")}
    >
      <SettingsToggleRow
        title={t("dictation_enable")}
        subtitle={t("dictation_enable_subtitle")}
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
          {t("dictation_model")}
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
              {t(model.labelKey)} ({model.size})
            </option>
          ))}
        </select>
        <div className="settings-help">
          {t("dictation_model_note", { note: t(selectedDictationModel.noteKey), size: selectedDictationModel.size })}
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-language">
          {t("dictation_language")}
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
          <option value="">{t("dictation_language_auto")}</option>
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
          {t("dictation_language_help")}
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-hold-key">
          {t("dictation_hold_key")}
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
          <option value="">{t("dictation_hold_key_off")}</option>
          <option value="alt">{t("dictation_hold_key_alt", { key: optionKeyLabel })}</option>
          <option value="shift">{t("dictation_hold_key_shift")}</option>
          <option value="control">{t("dictation_hold_key_control")}</option>
          <option value="meta">{t("dictation_hold_key_meta", { key: metaKeyLabel })}</option>
        </select>
        <div className="settings-help">
          {t("dictation_hold_key_help")}
        </div>
      </div>
      {dictationModelStatus && (
        <div className="settings-field">
          <div className="settings-field-label">{t("dictation_model_status", { model: t(selectedDictationModel.labelKey) })}</div>
          <div className="settings-help">
            {dictationModelStatus.state === "ready" && t("dictation_status_ready")}
            {dictationModelStatus.state === "missing" && t("dictation_status_missing")}
            {dictationModelStatus.state === "downloading" && t("dictation_status_downloading")}
            {dictationModelStatus.state === "error" &&
              (dictationModelStatus.error ?? t("dictation_status_error"))}
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
                {t("dictation_download_model")}
              </button>
            )}
            {dictationModelStatus.state === "downloading" && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onCancelDictationDownload}
                disabled={!onCancelDictationDownload}
              >
                {t("dictation_cancel_download")}
              </button>
            )}
            {dictationReady && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onRemoveDictationModel}
                disabled={!onRemoveDictationModel}
              >
                {t("dictation_remove_model")}
              </button>
            )}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
