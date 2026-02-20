import { useCallback, useEffect, useState } from "react";
import type { AppSettings, ModelOption } from "@/types";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "@utils/commitMessagePrompt";

type UseSettingsGitSectionArgs = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  models: ModelOption[];
};

export type SettingsGitSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  models: ModelOption[];
  commitMessagePromptDraft: string;
  commitMessagePromptDirty: boolean;
  commitMessagePromptSaving: boolean;
  onSetCommitMessagePromptDraft: (value: string) => void;
  onSaveCommitMessagePrompt: () => Promise<void>;
  onResetCommitMessagePrompt: () => Promise<void>;
};

export const useSettingsGitSection = ({
  appSettings,
  onUpdateAppSettings,
  models,
}: UseSettingsGitSectionArgs): SettingsGitSectionProps => {
  const [commitMessagePromptDraft, setCommitMessagePromptDraft] = useState(
    appSettings.commitMessagePrompt,
  );
  const [commitMessagePromptSaving, setCommitMessagePromptSaving] = useState(false);

  useEffect(() => {
    setCommitMessagePromptDraft(appSettings.commitMessagePrompt);
  }, [appSettings.commitMessagePrompt]);

  const commitMessagePromptDirty =
    commitMessagePromptDraft !== appSettings.commitMessagePrompt;

  const handleSaveCommitMessagePrompt = useCallback(async () => {
    if (commitMessagePromptSaving || !commitMessagePromptDirty) {
      return;
    }
    setCommitMessagePromptSaving(true);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        commitMessagePrompt: commitMessagePromptDraft,
      });
    } finally {
      setCommitMessagePromptSaving(false);
    }
  }, [
    appSettings,
    commitMessagePromptDirty,
    commitMessagePromptDraft,
    commitMessagePromptSaving,
    onUpdateAppSettings,
  ]);

  const handleResetCommitMessagePrompt = useCallback(async () => {
    if (commitMessagePromptSaving) {
      return;
    }
    setCommitMessagePromptDraft(DEFAULT_COMMIT_MESSAGE_PROMPT);
    setCommitMessagePromptSaving(true);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
      });
    } finally {
      setCommitMessagePromptSaving(false);
    }
  }, [appSettings, commitMessagePromptSaving, onUpdateAppSettings]);

  return {
    appSettings,
    onUpdateAppSettings,
    models,
    commitMessagePromptDraft,
    commitMessagePromptDirty,
    commitMessagePromptSaving,
    onSetCommitMessagePromptDraft: setCommitMessagePromptDraft,
    onSaveCommitMessagePrompt: handleSaveCommitMessagePrompt,
    onResetCommitMessagePrompt: handleResetCommitMessagePrompt,
  };
};
