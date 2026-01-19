import { useCallback, useMemo, useState } from "react";
import type { WorkspaceInfo } from "../../../types";
import { pickWorkspacePath } from "../../../services/tauri";

type ClonePromptState = {
  workspace: WorkspaceInfo;
  copyName: string;
  copiesFolder: string;
  initialCopiesFolder: string;
  groupId: string | null;
  suggestedCopiesFolder: string | null;
  isSubmitting: boolean;
  error: string | null;
} | null;

type UseClonePromptOptions = {
  addCloneAgent: (
    workspace: WorkspaceInfo,
    copyName: string,
    copiesFolder: string,
  ) => Promise<WorkspaceInfo | null>;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  onSelectWorkspace: (workspaceId: string) => void;
  resolveProjectContext: (
    workspace: WorkspaceInfo,
  ) => { groupId: string | null; copiesFolder: string | null };
  persistProjectCopiesFolder?: (groupId: string, copiesFolder: string) => Promise<void>;
  onCompactActivate?: () => void;
  onError?: (message: string) => void;
};

type UseClonePromptResult = {
  clonePrompt: ClonePromptState;
  openPrompt: (workspace: WorkspaceInfo) => void;
  confirmPrompt: () => Promise<void>;
  cancelPrompt: () => void;
  updateCopyName: (value: string) => void;
  chooseCopiesFolder: () => Promise<void>;
  useSuggestedCopiesFolder: () => void;
  clearCopiesFolder: () => void;
};

function normalizePathSeparators(path: string) {
  return path.replace(/\\/g, "/");
}

function dirname(path: string) {
  const normalized = normalizePathSeparators(path).replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index === -1) {
    return "";
  }
  return normalized.slice(0, index);
}

function basename(path: string) {
  const normalized = normalizePathSeparators(path).replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index === -1) {
    return normalized;
  }
  return normalized.slice(index + 1);
}

function joinPath(parent: string, name: string) {
  const normalized = normalizePathSeparators(parent).replace(/\/+$/, "");
  if (!normalized) {
    return name;
  }
  return `${normalized}/${name}`;
}

function suggestCopiesFolder(workspacePath: string) {
  const parent = dirname(workspacePath);
  const repoName = basename(workspacePath);
  if (!parent || !repoName) {
    return null;
  }
  return joinPath(parent, `${repoName}-copies`);
}

function slugifyWorkspaceName(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || null;
}

function defaultCopyName(workspace: WorkspaceInfo) {
  const repoName = basename(workspace.path);
  const slug = slugifyWorkspaceName(repoName)?.slice(0, 32) ?? null;
  const suffix = Math.random().toString(36).slice(2, 6);
  return slug ? `${slug}-${suffix}` : suffix;
}

export function useClonePrompt({
  addCloneAgent,
  connectWorkspace,
  onSelectWorkspace,
  resolveProjectContext,
  persistProjectCopiesFolder,
  onCompactActivate,
  onError,
}: UseClonePromptOptions): UseClonePromptResult {
  const [clonePrompt, setClonePrompt] = useState<ClonePromptState>(null);

  const openPrompt = useCallback(
    (workspace: WorkspaceInfo) => {
      const { groupId, copiesFolder } = resolveProjectContext(workspace);
      setClonePrompt({
        workspace,
        copyName: defaultCopyName(workspace),
        copiesFolder: copiesFolder ?? "",
        initialCopiesFolder: copiesFolder ?? "",
        groupId,
        suggestedCopiesFolder: suggestCopiesFolder(workspace.path),
        isSubmitting: false,
        error: null,
      });
    },
    [resolveProjectContext],
  );

  const updateCopyName = useCallback((value: string) => {
    setClonePrompt((prev) =>
      prev ? { ...prev, copyName: value, error: null } : prev,
    );
  }, []);

  const cancelPrompt = useCallback(() => {
    setClonePrompt(null);
  }, []);

  const chooseCopiesFolder = useCallback(async () => {
    const selection = await pickWorkspacePath();
    if (!selection) {
      return;
    }
    setClonePrompt((prev) =>
      prev ? { ...prev, copiesFolder: selection, error: null } : prev,
    );
  }, []);

  const useSuggestedCopiesFolder = useCallback(() => {
    setClonePrompt((prev) => {
      if (!prev || !prev.suggestedCopiesFolder) {
        return prev;
      }
      return { ...prev, copiesFolder: prev.suggestedCopiesFolder, error: null };
    });
  }, []);

  const clearCopiesFolder = useCallback(() => {
    setClonePrompt((prev) => (prev ? { ...prev, copiesFolder: "", error: null } : prev));
  }, []);

  const canPersistCopiesFolder = useMemo(() => {
    if (!clonePrompt) {
      return false;
    }
    if (!clonePrompt.groupId || !persistProjectCopiesFolder) {
      return false;
    }
    return clonePrompt.copiesFolder.trim().length > 0;
  }, [clonePrompt, persistProjectCopiesFolder]);

  const confirmPrompt = useCallback(async () => {
    if (!clonePrompt || clonePrompt.isSubmitting) {
      return;
    }
    const copyName = clonePrompt.copyName.trim();
    const copiesFolder = clonePrompt.copiesFolder.trim();
    if (!copyName) {
      setClonePrompt((prev) =>
        prev ? { ...prev, error: "Copy name is required." } : prev,
      );
      return;
    }
    if (!copiesFolder) {
      setClonePrompt((prev) =>
        prev ? { ...prev, error: "Copies folder is required." } : prev,
      );
      return;
    }

    setClonePrompt((prev) =>
      prev ? { ...prev, isSubmitting: true, error: null } : prev,
    );
    try {
      const cloneWorkspace = await addCloneAgent(
        clonePrompt.workspace,
        copyName,
        copiesFolder,
      );
      if (!cloneWorkspace) {
        setClonePrompt(null);
        return;
      }
      onSelectWorkspace(cloneWorkspace.id);
      if (!cloneWorkspace.connected) {
        await connectWorkspace(cloneWorkspace);
      }

      if (
        canPersistCopiesFolder &&
        clonePrompt.groupId &&
        copiesFolder !== clonePrompt.initialCopiesFolder
      ) {
        try {
          await persistProjectCopiesFolder?.(clonePrompt.groupId, copiesFolder);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          onError?.(message);
        }
      }

      onCompactActivate?.();
      setClonePrompt(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setClonePrompt((prev) =>
        prev ? { ...prev, isSubmitting: false, error: message } : prev,
      );
      onError?.(message);
    }
  }, [
    addCloneAgent,
    canPersistCopiesFolder,
    clonePrompt,
    connectWorkspace,
    onCompactActivate,
    onError,
    onSelectWorkspace,
    persistProjectCopiesFolder,
  ]);

  return {
    clonePrompt,
    openPrompt,
    confirmPrompt,
    cancelPrompt,
    updateCopyName,
    chooseCopiesFolder,
    useSuggestedCopiesFolder,
    clearCopiesFolder,
  };
}
