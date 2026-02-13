import { useCallback, useEffect, useState } from "react";
import type { WorkspaceInfo } from "../../../types";
import { validateBranchName } from "../utils/branchValidation";
import type { InitGitRepoOutcome } from "./useGitActions";

type InitGitRepoPromptState = {
  workspaceId: string;
  workspaceName: string;
  branch: string;
  createRemote: boolean;
  repoName: string;
  isPrivate: boolean;
  error: string | null;
};

export function useInitGitRepoPrompt({
  activeWorkspace,
  initGitRepo,
  createGitHubRepo,
  refreshGitRemote,
  isBusy,
}: {
  activeWorkspace: WorkspaceInfo | null;
  initGitRepo: (branch: string) => Promise<InitGitRepoOutcome>;
  createGitHubRepo: (
    repo: string,
    visibility: "private" | "public",
    branch: string,
  ) => Promise<
    | { ok: true }
    | { ok: false; error: string }
  >;
  refreshGitRemote: () => void;
  isBusy: boolean;
}) {
  const [initGitRepoPrompt, setInitGitRepoPrompt] =
    useState<InitGitRepoPromptState | null>(null);

  useEffect(() => {
    if (!initGitRepoPrompt) {
      return;
    }
    const activeId = activeWorkspace?.id ?? null;
    if (!activeId || activeId !== initGitRepoPrompt.workspaceId) {
      setInitGitRepoPrompt(null);
    }
  }, [activeWorkspace?.id, initGitRepoPrompt]);

  const openInitGitRepoPrompt = useCallback(() => {
    if (!activeWorkspace) {
      return;
    }

    const path = (activeWorkspace.path ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
    const parts = path.split("/");
    const suggestedRepoName = parts[parts.length - 1] ?? "";

    setInitGitRepoPrompt({
      workspaceId: activeWorkspace.id,
      workspaceName: activeWorkspace.name,
      branch: "main",
      createRemote: true,
      repoName: suggestedRepoName,
      isPrivate: true,
      error: null,
    });
  }, [activeWorkspace]);

  const handleInitGitRepoPromptBranchChange = useCallback((value: string) => {
    setInitGitRepoPrompt((prev) =>
      prev
        ? {
            ...prev,
            branch: value,
            error: null,
          }
        : prev,
    );
  }, []);

  const handleInitGitRepoPromptCreateRemoteChange = useCallback((value: boolean) => {
    setInitGitRepoPrompt((prev) =>
      prev
        ? {
            ...prev,
            createRemote: value,
            error: null,
          }
        : prev,
    );
  }, []);

  const handleInitGitRepoPromptRepoNameChange = useCallback((value: string) => {
    setInitGitRepoPrompt((prev) =>
      prev
        ? {
            ...prev,
            repoName: value,
            error: null,
          }
        : prev,
    );
  }, []);

  const handleInitGitRepoPromptPrivateChange = useCallback((value: boolean) => {
    setInitGitRepoPrompt((prev) =>
      prev
        ? {
            ...prev,
            isPrivate: value,
            error: null,
          }
        : prev,
    );
  }, []);

  const handleInitGitRepoPromptCancel = useCallback(() => {
    if (isBusy) {
      return;
    }
    setInitGitRepoPrompt(null);
  }, [isBusy]);

  const handleInitGitRepoPromptConfirm = useCallback(async () => {
    if (isBusy) {
      return;
    }
    const prompt = initGitRepoPrompt;
    if (!prompt) {
      return;
    }

    const trimmedBranch = prompt.branch.trim();
    const validationError =
      trimmedBranch.length === 0
        ? "Branch name is required."
        : validateBranchName(prompt.branch);
    if (validationError) {
      setInitGitRepoPrompt((prev) =>
        prev ? { ...prev, error: validationError } : prev,
      );
      return;
    }

    const trimmedRepo = prompt.repoName.trim();
    if (prompt.createRemote) {
      if (!trimmedRepo) {
        setInitGitRepoPrompt((prev) =>
          prev ? { ...prev, error: "Repository name is required." } : prev,
        );
        return;
      }
      if (/\s/.test(trimmedRepo)) {
        setInitGitRepoPrompt((prev) =>
          prev ? { ...prev, error: "Repository name cannot contain spaces." } : prev,
        );
        return;
      }
    }

    // The init action is workspace-scoped; if the active workspace changed, bail.
    if (!activeWorkspace || activeWorkspace.id !== prompt.workspaceId) {
      setInitGitRepoPrompt(null);
      return;
    }

    setInitGitRepoPrompt((prev) => (prev ? { ...prev, error: null } : prev));

    const initOutcome = await initGitRepo(trimmedBranch);
    if (initOutcome === "cancelled") {
      return;
    }

    if (initOutcome !== "initialized") {
      setInitGitRepoPrompt((prev) =>
        prev ? { ...prev, error: prev.error ?? "Failed to initialize Git repository." } : prev,
      );
      return;
    }

    if (prompt.createRemote) {
      const visibility = prompt.isPrivate ? "private" : "public";
      const remoteResult = await createGitHubRepo(trimmedRepo, visibility, trimmedBranch);
      if (!remoteResult.ok) {
        setInitGitRepoPrompt((prev) =>
          prev ? { ...prev, error: remoteResult.error } : prev,
        );
        return;
      }
      refreshGitRemote();
    }

    setInitGitRepoPrompt(null);
  }, [
    activeWorkspace,
    createGitHubRepo,
    initGitRepo,
    initGitRepoPrompt,
    isBusy,
    refreshGitRemote,
  ]);

  return {
    initGitRepoPrompt,
    openInitGitRepoPrompt,
    handleInitGitRepoPromptBranchChange,
    handleInitGitRepoPromptCreateRemoteChange,
    handleInitGitRepoPromptRepoNameChange,
    handleInitGitRepoPromptPrivateChange,
    handleInitGitRepoPromptCancel,
    handleInitGitRepoPromptConfirm,
  };
}
