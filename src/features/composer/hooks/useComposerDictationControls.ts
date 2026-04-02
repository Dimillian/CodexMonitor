import { useCallback } from "react";
import { useTranslation } from "react-i18next";

type DictationState = "idle" | "listening" | "processing";

type UseComposerDictationControlsArgs = {
  disabled: boolean;
  dictationEnabled: boolean;
  dictationState: DictationState;
  onToggleDictation?: () => void;
  onCancelDictation?: () => void;
  onOpenDictationSettings?: () => void;
};

export function useComposerDictationControls({
  disabled,
  dictationEnabled,
  dictationState,
  onToggleDictation,
  onCancelDictation,
  onOpenDictationSettings,
}: UseComposerDictationControlsArgs) {
  const { t } = useTranslation();
  const isDictating = dictationState === "listening";
  const isDictationProcessing = dictationState === "processing";
  const isDictationBusy = dictationState !== "idle";
  const allowOpenDictationSettings = Boolean(
    onOpenDictationSettings && !dictationEnabled && !disabled && !isDictationProcessing,
  );
  const micDisabled =
    disabled ||
    (!allowOpenDictationSettings &&
      (isDictationProcessing ? !onCancelDictation : !dictationEnabled || !onToggleDictation));
  const micAriaLabel = allowOpenDictationSettings
    ? t("uiText.composerInput.openDictationSettings")
    : isDictationProcessing
      ? t("uiText.composerInput.cancelTranscription")
      : isDictating
        ? t("uiText.composerInput.stopDictation")
        : t("uiText.composerInput.startDictation");
  const micTitle = allowOpenDictationSettings
    ? t("uiText.composerInput.dictationDisabledOpenSettings")
    : isDictationProcessing
      ? t("uiText.composerInput.cancelTranscription")
      : isDictating
        ? t("uiText.composerInput.stopDictation")
        : t("uiText.composerInput.startDictation");

  const handleMicClick = useCallback(() => {
    if (isDictationProcessing) {
      if (disabled || !onCancelDictation) {
        return;
      }
      onCancelDictation();
      return;
    }
    if (allowOpenDictationSettings) {
      onOpenDictationSettings?.();
      return;
    }
    if (!onToggleDictation || micDisabled) {
      return;
    }
    onToggleDictation();
  }, [
    allowOpenDictationSettings,
    disabled,
    isDictationProcessing,
    micDisabled,
    onCancelDictation,
    onOpenDictationSettings,
    onToggleDictation,
    t,
  ]);

  return {
    allowOpenDictationSettings,
    handleMicClick,
    isDictating,
    isDictationBusy,
    isDictationProcessing,
    micAriaLabel,
    micDisabled,
    micTitle,
  };
}
