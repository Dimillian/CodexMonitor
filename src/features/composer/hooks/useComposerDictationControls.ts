import { useCallback } from "react";
import { useI18n } from "@/i18n";

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
  const { tx } = useI18n();
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
    ? tx("Open dictation settings")
    : isDictationProcessing
      ? tx("Cancel transcription")
      : isDictating
        ? tx("Stop dictation")
        : tx("Start dictation");
  const micTitle = allowOpenDictationSettings
    ? tx("Dictation disabled. Open settings")
    : isDictationProcessing
      ? tx("Cancel transcription")
      : isDictating
        ? tx("Stop dictation")
        : tx("Start dictation");

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
