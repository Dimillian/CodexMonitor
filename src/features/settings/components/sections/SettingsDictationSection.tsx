import type { AppSettings, DictationModelStatus } from "@/types";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { formatDownloadSize } from "@utils/formatting";
import { useI18n } from "@/i18n/useI18n";

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
  const { t } = useI18n();
  const dictationProgress = dictationModelStatus?.progress ?? null;

  return (
    <SettingsSection
      title={t("settings.dictation.sectionTitle")}
      subtitle={t("settings.dictation.sectionSubtitle")}
    >
      <SettingsToggleRow
        title={t("settings.dictation.enable.title")}
        subtitle={t("settings.dictation.enable.subtitle")}
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
          {t("settings.dictation.model.label")}
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
          {selectedDictationModel.note} {t("settings.dictation.model.downloadSize")}:{" "}
          {selectedDictationModel.size}.
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-language">
          {t("settings.dictation.language.label")}
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
          <option value="">{t("settings.dictation.language.autoDetect")}</option>
          <option value="en">{t("settings.dictation.language.en")}</option>
          <option value="es">{t("settings.dictation.language.es")}</option>
          <option value="fr">{t("settings.dictation.language.fr")}</option>
          <option value="de">{t("settings.dictation.language.de")}</option>
          <option value="it">{t("settings.dictation.language.it")}</option>
          <option value="pt">{t("settings.dictation.language.pt")}</option>
          <option value="nl">{t("settings.dictation.language.nl")}</option>
          <option value="sv">{t("settings.dictation.language.sv")}</option>
          <option value="no">{t("settings.dictation.language.no")}</option>
          <option value="da">{t("settings.dictation.language.da")}</option>
          <option value="fi">{t("settings.dictation.language.fi")}</option>
          <option value="pl">{t("settings.dictation.language.pl")}</option>
          <option value="tr">{t("settings.dictation.language.tr")}</option>
          <option value="ru">{t("settings.dictation.language.ru")}</option>
          <option value="uk">{t("settings.dictation.language.uk")}</option>
          <option value="ja">{t("settings.dictation.language.ja")}</option>
          <option value="ko">{t("settings.dictation.language.ko")}</option>
          <option value="zh">{t("settings.dictation.language.zh")}</option>
        </select>
        <div className="settings-help">
          {t("settings.dictation.language.help")}
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-hold-key">
          {t("settings.dictation.holdKey.label")}
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
          <option value="">{t("settings.dictation.holdKey.off")}</option>
          <option value="alt">{optionKeyLabel}</option>
          <option value="shift">Shift</option>
          <option value="control">Control</option>
          <option value="meta">{metaKeyLabel}</option>
        </select>
        <div className="settings-help">
          {t("settings.dictation.holdKey.help")}
        </div>
      </div>
      {dictationModelStatus && (
        <div className="settings-field">
          <div className="settings-field-label">
            {t("settings.dictation.status.label")} ({selectedDictationModel.label})
          </div>
          <div className="settings-help">
            {dictationModelStatus.state === "ready" && t("settings.dictation.status.ready")}
            {dictationModelStatus.state === "missing" && t("settings.dictation.status.missing")}
            {dictationModelStatus.state === "downloading" &&
              t("settings.dictation.status.downloading")}
            {dictationModelStatus.state === "error" &&
              (dictationModelStatus.error ?? t("settings.dictation.status.errorFallback"))}
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
                {t("settings.dictation.actions.download")}
              </button>
            )}
            {dictationModelStatus.state === "downloading" && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onCancelDictationDownload}
                disabled={!onCancelDictationDownload}
              >
                {t("settings.dictation.actions.cancelDownload")}
              </button>
            )}
            {dictationReady && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onRemoveDictationModel}
                disabled={!onRemoveDictationModel}
              >
                {t("settings.dictation.actions.removeModel")}
              </button>
            )}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
