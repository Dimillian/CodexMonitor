<<<<<<< HEAD
import { useLayoutEffect, useRef } from "react";
import type { AppSettings, DictationModelStatus } from "../../../../types";
import { formatDownloadSize } from "../../../../utils/formatting";
=======
import type { AppSettings, DictationModelStatus } from "@/types";
import { formatDownloadSize } from "@utils/formatting";
>>>>>>> origin/main

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
  const dictationProgress = dictationModelStatus?.progress ?? null;
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const progressPercent =
    dictationProgress?.totalBytes && dictationProgress.totalBytes > 0
      ? Math.min(
          100,
          (dictationProgress.downloadedBytes / dictationProgress.totalBytes) * 100,
        )
      : 0;

  useLayoutEffect(() => {
    if (!progressFillRef.current) {
      return;
    }
    progressFillRef.current.style.setProperty(
      "--settings-download-progress-width",
      `${progressPercent}%`,
    );
  }, [progressPercent]);

  return (
    <section className="settings-section">
      <div className="settings-section-title">听写</div>
      <div className="settings-section-subtitle">
        通过麦克风语音输入，使用本地 Whisper 模型转为文字。
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">启用听写</div>
          <div className="settings-toggle-subtitle">
            开启后，首次使用时会自动下载所选的 Whisper 语音识别模型。
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
          听写模型
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
          {selectedDictationModel.note} 下载大小： {selectedDictationModel.size}.
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-language">
          偏好听写语言
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
          <option value="">仅自动检测</option>
          <option value="en">英语</option>
          <option value="es">西班牙语</option>
          <option value="fr">法语</option>
          <option value="de">德语</option>
          <option value="it">意大利语</option>
          <option value="pt">葡萄牙语</option>
          <option value="nl">荷兰语</option>
          <option value="sv">瑞典语</option>
          <option value="no">挪威语</option>
          <option value="da">丹麦语</option>
          <option value="fi">芬兰语</option>
          <option value="pl">波兰语</option>
          <option value="tr">土耳其语</option>
          <option value="ru">俄语</option>
          <option value="uk">乌克兰语</option>
          <option value="ja">日语</option>
          <option value="ko">韩语</option>
          <option value="zh">中文</option>
        </select>
        <div className="settings-help">
          自动检测始终开启；该选项会优先偏向你选择的语言。
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-hold-key">
          按住说话按键
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
          <option value="">关闭</option>
          <option value="alt">{optionKeyLabel}</option>
          <option value="shift">Shift</option>
          <option value="control">控制键</option>
          <option value="meta">{metaKeyLabel}</option>
        </select>
        <div className="settings-help">
          按住按键开始听写，松开后停止并处理。
        </div>
      </div>
      {dictationModelStatus && (
        <div className="settings-field">
          <div className="settings-field-label">模型状态（{selectedDictationModel.label}）</div>
          <div className="settings-help">
            {dictationModelStatus.state === "ready" && "可用于听写。"}
            {dictationModelStatus.state === "missing" && "模型尚未下载。"}
            {dictationModelStatus.state === "downloading" && "正在下载模型..."}
            {dictationModelStatus.state === "error" &&
              (dictationModelStatus.error ?? "下载失败。")}
          </div>
          {dictationProgress && (
            <div className="settings-download-progress">
              <div className="settings-download-bar">
                <div className="settings-download-fill" ref={progressFillRef} />
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
                下载模型
              </button>
            )}
            {dictationModelStatus.state === "downloading" && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onCancelDictationDownload}
                disabled={!onCancelDictationDownload}
              >
                取消下载
              </button>
            )}
            {dictationReady && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onRemoveDictationModel}
                disabled={!onRemoveDictationModel}
              >
                移除模型
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
