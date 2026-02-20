import { useCallback, useMemo, useState } from "react";
import { pickWorkspacePath } from "@services/tauri";

type WorkspaceFromUrlPromptState = {
  url: string;
  destinationPath: string;
  targetFolderName: string;
  error: string | null;
  isSubmitting: boolean;
} | null;

type UseWorkspaceFromUrlPromptOptions = {
  onSubmit: (
    url: string,
    destinationPath: string,
    targetFolderName?: string | null,
  ) => Promise<void>;
};

export function useWorkspaceFromUrlPrompt({ onSubmit }: UseWorkspaceFromUrlPromptOptions) {
  const [prompt, setPrompt] = useState<WorkspaceFromUrlPromptState>(null);

  const openPrompt = useCallback(() => {
    setPrompt({
      url: "",
      destinationPath: "",
      targetFolderName: "",
      error: null,
      isSubmitting: false,
    });
  }, []);

  const closePrompt = useCallback(() => {
    setPrompt(null);
  }, []);

  const canSubmit = useMemo(() => {
    if (!prompt) {
      return false;
    }
    return prompt.url.trim().length > 0 && prompt.destinationPath.trim().length > 0;
  }, [prompt]);

  const chooseDestinationPath = useCallback(async () => {
    const selected = await pickWorkspacePath();
    if (!selected) {
      return;
    }
    setPrompt((prev) => (prev ? { ...prev, destinationPath: selected, error: null } : prev));
  }, []);

  const submitPrompt = useCallback(async () => {
    if (!prompt || prompt.isSubmitting) {
      return;
    }
    const url = prompt.url.trim();
    const destinationPath = prompt.destinationPath.trim();
    const targetFolderName = prompt.targetFolderName.trim() || null;

    if (!url) {
      setPrompt((prev) => (prev ? { ...prev, error: "Remote Git URL is required." } : prev));
      return;
    }
    if (!destinationPath) {
      setPrompt((prev) => (prev ? { ...prev, error: "Destination folder is required." } : prev));
      return;
    }

    setPrompt((prev) => (prev ? { ...prev, isSubmitting: true, error: null } : prev));
    try {
      await onSubmit(url, destinationPath, targetFolderName);
      setPrompt(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPrompt((prev) => (prev ? { ...prev, isSubmitting: false, error: message } : prev));
    }
  }, [onSubmit, prompt]);

  return {
    workspaceFromUrlPrompt: prompt,
    openWorkspaceFromUrlPrompt: openPrompt,
    closeWorkspaceFromUrlPrompt: closePrompt,
    chooseWorkspaceFromUrlDestinationPath: chooseDestinationPath,
    submitWorkspaceFromUrlPrompt: submitPrompt,
    updateWorkspaceFromUrlUrl: (url: string) =>
      setPrompt((prev) => (prev ? { ...prev, url, error: null } : prev)),
    updateWorkspaceFromUrlTargetFolderName: (targetFolderName: string) =>
      setPrompt((prev) => (prev ? { ...prev, targetFolderName, error: null } : prev)),
    clearWorkspaceFromUrlDestinationPath: () =>
      setPrompt((prev) => (prev ? { ...prev, destinationPath: "", error: null } : prev)),
    canSubmitWorkspaceFromUrlPrompt: canSubmit,
  };
}
