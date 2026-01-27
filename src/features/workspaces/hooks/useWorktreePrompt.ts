import { useCallback, useState } from "react";
import type { WorkspaceInfo, WorkspaceSettings } from "../../../types";

type WorktreePromptState = {
  workspace: WorkspaceInfo;
  branch: string;
  setupScript: string;
  savedSetupScript: string | null;
  isSubmitting: boolean;
  isSavingScript: boolean;
  error: string | null;
  scriptError: string | null;
} | null;

type UseWorktreePromptOptions = {
  addWorktreeAgent: (
    workspace: WorkspaceInfo,
    branch: string,
  ) => Promise<WorkspaceInfo | null>;
  updateWorkspaceSettings: (
    id: string,
    settings: Partial<WorkspaceSettings>,
  ) => Promise<WorkspaceInfo>;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  onSelectWorkspace: (workspaceId: string) => void;
  onWorktreeCreated?: (worktree: WorkspaceInfo, parent: WorkspaceInfo) => Promise<void> | void;
  onCompactActivate?: () => void;
  onError?: (message: string) => void;
};

type UseWorktreePromptResult = {
  worktreePrompt: WorktreePromptState;
  openPrompt: (workspace: WorkspaceInfo) => void;
  confirmPrompt: () => Promise<void>;
  cancelPrompt: () => void;
  updateBranch: (value: string) => void;
  updateSetupScript: (value: string) => void;
};

function normalizeSetupScript(value: string | null | undefined): string | null {
  const next = value ?? "";
  return next.trim().length > 0 ? next : null;
}

export function useWorktreePrompt({
  addWorktreeAgent,
  updateWorkspaceSettings,
  connectWorkspace,
  onSelectWorkspace,
  onWorktreeCreated,
  onCompactActivate,
  onError,
}: UseWorktreePromptOptions): UseWorktreePromptResult {
  const [worktreePrompt, setWorktreePrompt] = useState<WorktreePromptState>(null);

  const openPrompt = useCallback((workspace: WorkspaceInfo) => {
    const defaultBranch = `codex/${new Date().toISOString().slice(0, 10)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const savedSetupScript = normalizeSetupScript(workspace.settings.worktreeSetupScript);
    setWorktreePrompt({
      workspace,
      branch: defaultBranch,
      setupScript: savedSetupScript ?? "",
      savedSetupScript,
      isSubmitting: false,
      isSavingScript: false,
      error: null,
      scriptError: null,
    });
  }, []);

  const updateBranch = useCallback((value: string) => {
    setWorktreePrompt((prev) => (prev ? { ...prev, branch: value, error: null } : prev));
  }, []);

  const updateSetupScript = useCallback((value: string) => {
    setWorktreePrompt((prev) =>
      prev ? { ...prev, setupScript: value, scriptError: null, error: null } : prev,
    );
  }, []);

  const cancelPrompt = useCallback(() => {
    setWorktreePrompt(null);
  }, []);

  const persistSetupScript = useCallback(
    async (prompt: NonNullable<WorktreePromptState>) => {
      const nextScript = normalizeSetupScript(prompt.setupScript);
      if (nextScript === prompt.savedSetupScript) {
        return prompt.workspace;
      }
      setWorktreePrompt((prev) =>
        prev ? { ...prev, isSavingScript: true, scriptError: null, error: null } : prev,
      );
      try {
        const updated = await updateWorkspaceSettings(prompt.workspace.id, {
          ...prompt.workspace.settings,
          worktreeSetupScript: nextScript,
        });
        setWorktreePrompt((prev) =>
          prev
            ? {
                ...prev,
                workspace: updated,
                savedSetupScript: nextScript,
                setupScript: nextScript ?? "",
                isSavingScript: false,
                scriptError: null,
              }
            : prev,
        );
        return updated;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setWorktreePrompt((prev) =>
          prev ? { ...prev, isSavingScript: false, scriptError: message } : prev,
        );
        throw new Error(message);
      }
    },
    [updateWorkspaceSettings],
  );

  const confirmPrompt = useCallback(async () => {
    if (!worktreePrompt || worktreePrompt.isSubmitting) {
      return;
    }
    const snapshot = worktreePrompt;
    setWorktreePrompt((prev) =>
      prev ? { ...prev, isSubmitting: true, error: null, scriptError: null } : prev,
    );

    let parentWorkspace = snapshot.workspace;
    try {
      parentWorkspace = await persistSetupScript(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWorktreePrompt((prev) =>
        prev ? { ...prev, isSubmitting: false, error: message } : prev,
      );
      onError?.(message);
      return;
    }

    try {
      const worktreeWorkspace = await addWorktreeAgent(parentWorkspace, snapshot.branch);
      if (!worktreeWorkspace) {
        setWorktreePrompt(null);
        return;
      }
      onSelectWorkspace(worktreeWorkspace.id);
      if (!worktreeWorkspace.connected) {
        await connectWorkspace(worktreeWorkspace);
      }
      try {
        await onWorktreeCreated?.(worktreeWorkspace, parentWorkspace);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onError?.(message);
      }
      onCompactActivate?.();
      setWorktreePrompt(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWorktreePrompt((prev) =>
        prev ? { ...prev, isSubmitting: false, error: message } : prev,
      );
      onError?.(message);
    }
  }, [
    addWorktreeAgent,
    connectWorkspace,
    onCompactActivate,
    onError,
    onSelectWorkspace,
    onWorktreeCreated,
    persistSetupScript,
    worktreePrompt,
  ]);

  return {
    worktreePrompt,
    openPrompt,
    confirmPrompt,
    cancelPrompt,
    updateBranch,
    updateSetupScript,
  };
}
