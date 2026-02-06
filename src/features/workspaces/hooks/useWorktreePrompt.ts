import { useCallback, useState } from "react";
import type { WorkspaceInfo, WorkspaceSettings } from "../../../types";

type WorktreePromptState = {
  workspace: WorkspaceInfo;
  name: string;
  branch: string;
  branchWasEdited: boolean;
  copyAgentsMd: boolean;
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
    options?: { displayName?: string | null; copyAgentsMd?: boolean },
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
  updateName: (value: string) => void;
  updateBranch: (value: string) => void;
  updateCopyAgentsMd: (value: boolean) => void;
  updateSetupScript: (value: string) => void;
};

function normalizeSetupScript(value: string | null | undefined): string | null {
  const next = value ?? "";
  return next.trim().length > 0 ? next : null;
}

function toBranchFromName(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const slug = trimmed
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (!slug) {
    return null;
  }
  return `codex/${slug}`;
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
      name: "",
      branch: defaultBranch,
      branchWasEdited: false,
      copyAgentsMd: true,
      setupScript: savedSetupScript ?? "",
      savedSetupScript,
      isSubmitting: false,
      isSavingScript: false,
      error: null,
      scriptError: null,
    });
  }, []);

  const updateName = useCallback((value: string) => {
    setWorktreePrompt((prev) => {
      if (!prev) {
        return prev;
      }
      if (prev.branchWasEdited) {
        return { ...prev, name: value, error: null };
      }
      const nextBranch = toBranchFromName(value);
      if (!nextBranch) {
        return { ...prev, name: value, error: null };
      }
      return {
        ...prev,
        name: value,
        branch: nextBranch,
        error: null,
      };
    });
  }, []);

  const updateBranch = useCallback((value: string) => {
    setWorktreePrompt((prev) =>
      prev ? { ...prev, branch: value, branchWasEdited: true, error: null } : prev,
    );
  }, []);

  const updateCopyAgentsMd = useCallback((value: boolean) => {
    setWorktreePrompt((prev) => (prev ? { ...prev, copyAgentsMd: value } : prev));
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
      const displayName = snapshot.name.trim();
      const worktreeWorkspace = await addWorktreeAgent(parentWorkspace, snapshot.branch, {
        displayName: displayName.length > 0 ? displayName : null,
        copyAgentsMd: snapshot.copyAgentsMd,
      });
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
    updateName,
    updateBranch,
    updateCopyAgentsMd,
    updateSetupScript,
  };
}
