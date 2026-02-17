import { useCallback, useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppSettings, ModelOption } from "@/types";
import { resolveCommitMessageModelSelection } from "@/features/git/utils/commitMessageModelSelection";

type UseCommitMessageModelSelectionOptions = {
  models: ModelOption[];
  commitMessageModelId: string | null;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  queueSaveSettings: (next: AppSettings) => Promise<AppSettings | void>;
};

type UseCommitMessageModelSelectionResult = {
  resolvedCommitMessageModelId: string | null;
  onCommitMessageModelChange: (id: string | null) => void;
};

export function useCommitMessageModelSelection({
  models,
  commitMessageModelId,
  setAppSettings,
  queueSaveSettings,
}: UseCommitMessageModelSelectionOptions): UseCommitMessageModelSelectionResult {
  const selection = useMemo(
    () => resolveCommitMessageModelSelection(models, commitMessageModelId),
    [models, commitMessageModelId],
  );

  const persistCommitMessageModelId = useCallback(
    (id: string | null) => {
      setAppSettings((current) => {
        if (current.commitMessageModelId === id) {
          return current;
        }
        const next = { ...current, commitMessageModelId: id };
        void queueSaveSettings(next);
        return next;
      });
    },
    [queueSaveSettings, setAppSettings],
  );

  useEffect(() => {
    if (!selection.shouldNormalize) {
      return;
    }
    persistCommitMessageModelId(selection.normalizedModelId);
  }, [persistCommitMessageModelId, selection.normalizedModelId, selection.shouldNormalize]);

  return {
    resolvedCommitMessageModelId: selection.resolvedModelId,
    onCommitMessageModelChange: persistCommitMessageModelId,
  };
}
