import { useCallback, useState } from "react";
import type { WorkspaceInfo } from "../../../types";
import { isWorkspacePathDir } from "../../../services/tauri";

type AddWorkspacePromptState = {
  path: string;
  isSubmitting: boolean;
  error: string | null;
} | null;

type UseAddWorkspacePromptOptions = {
  addWorkspaceFromPath: (path: string) => Promise<WorkspaceInfo | null>;
  onWorkspaceAdded?: (workspace: WorkspaceInfo) => void;
  onError?: (message: string) => void;
  shouldValidateDir?: boolean;
};

type UseAddWorkspacePromptResult = {
  addWorkspacePrompt: AddWorkspacePromptState;
  openPrompt: (initialPath?: string) => void;
  cancelPrompt: () => void;
  confirmPrompt: () => Promise<void>;
  updatePath: (value: string) => void;
};

export function useAddWorkspacePrompt({
  addWorkspaceFromPath,
  onWorkspaceAdded,
  onError,
  shouldValidateDir = true,
}: UseAddWorkspacePromptOptions): UseAddWorkspacePromptResult {
  const [addWorkspacePrompt, setAddWorkspacePrompt] =
    useState<AddWorkspacePromptState>(null);

  const openPrompt = useCallback((initialPath = "") => {
    setAddWorkspacePrompt({
      path: initialPath,
      isSubmitting: false,
      error: null,
    });
  }, []);

  const updatePath = useCallback((value: string) => {
    setAddWorkspacePrompt((prev) =>
      prev ? { ...prev, path: value, error: null } : prev,
    );
  }, []);

  const cancelPrompt = useCallback(() => {
    setAddWorkspacePrompt((prev) => {
      if (!prev || prev.isSubmitting) {
        return prev;
      }
      return null;
    });
  }, []);

  const confirmPrompt = useCallback(async () => {
    if (!addWorkspacePrompt || addWorkspacePrompt.isSubmitting) {
      return;
    }

    const snapshot = addWorkspacePrompt;
    const selection = snapshot.path.trim();
    if (!selection) {
      setAddWorkspacePrompt((prev) =>
        prev ? { ...prev, error: "Workspace path is required." } : prev,
      );
      return;
    }

    setAddWorkspacePrompt((prev) =>
      prev ? { ...prev, isSubmitting: true, error: null } : prev,
    );

    if (shouldValidateDir) {
      try {
        const isDir = await isWorkspacePathDir(selection);
        if (!isDir) {
          setAddWorkspacePrompt((prev) =>
            prev
              ? {
                  ...prev,
                  isSubmitting: false,
                  error: "Path is not a directory.",
                }
              : prev,
          );
          return;
        }
      } catch {
        // Best-effort validation; the actual add call will surface errors.
      }
    }

    try {
      const workspace = await addWorkspaceFromPath(selection);
      if (workspace) {
        onWorkspaceAdded?.(workspace);
      }
      setAddWorkspacePrompt(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAddWorkspacePrompt((prev) =>
        prev ? { ...prev, isSubmitting: false, error: message } : prev,
      );
      onError?.(message);
    }
  }, [
    addWorkspaceFromPath,
    addWorkspacePrompt,
    onError,
    onWorkspaceAdded,
    shouldValidateDir,
  ]);

  return {
    addWorkspacePrompt,
    openPrompt,
    cancelPrompt,
    confirmPrompt,
    updatePath,
  };
}

