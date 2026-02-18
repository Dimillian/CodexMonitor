import { useCallback, useEffect, useRef, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import {
  applyWorktreeChanges as applyWorktreeChangesService,
  createGitHubRepo as createGitHubRepoService,
  initGitRepo as initGitRepoService,
  revertGitAll,
  revertGitFile as revertGitFileService,
  stageGitAll as stageGitAllService,
  stageGitFile as stageGitFileService,
  stageGitSelection as stageGitSelectionService,
  unstageGitFile as unstageGitFileService,
} from "../../../services/tauri";
import type {
  GitSelectionApplyResult,
  GitSelectionLine,
  WorkspaceInfo,
} from "../../../types";

type UseGitActionsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onRefreshGitStatus: () => void;
  onRefreshGitDiffs: () => void;
  onClearGitRootCandidates?: () => void;
  onError?: (error: unknown) => void;
};

export type InitGitRepoOutcome = "initialized" | "cancelled" | "failed";

export function useGitActions({
  activeWorkspace,
  onRefreshGitStatus,
  onRefreshGitDiffs,
  onClearGitRootCandidates,
  onError,
}: UseGitActionsOptions) {
  const [worktreeApplyError, setWorktreeApplyError] = useState<string | null>(null);
  const [worktreeApplyLoading, setWorktreeApplyLoading] = useState(false);
  const [worktreeApplySuccess, setWorktreeApplySuccess] = useState(false);
  const [initGitRepoLoading, setInitGitRepoLoading] = useState(false);
  const [createGitHubRepoLoading, setCreateGitHubRepoLoading] = useState(false);
  const worktreeApplyTimerRef = useRef<number | null>(null);
  const workspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);
  const workspaceId = activeWorkspace?.id ?? null;
  const isWorktree = activeWorkspace?.kind === "worktree";

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  useEffect(() => {
    setWorktreeApplyError(null);
    setWorktreeApplyLoading(false);
    setWorktreeApplySuccess(false);
    setInitGitRepoLoading(false);
    setCreateGitHubRepoLoading(false);
    if (worktreeApplyTimerRef.current) {
      window.clearTimeout(worktreeApplyTimerRef.current);
      worktreeApplyTimerRef.current = null;
    }
  }, [workspaceId]);

  const refreshGitData = useCallback(() => {
    onRefreshGitStatus();
    onRefreshGitDiffs();
  }, [onRefreshGitDiffs, onRefreshGitStatus]);

  const stageGitFile = useCallback(
    async (path: string) => {
      if (!workspaceId) {
        return;
      }
      const actionWorkspaceId = workspaceId;
      try {
        await stageGitFileService(actionWorkspaceId, path);
      } catch (error) {
        onError?.(error);
      } finally {
        if (workspaceIdRef.current === actionWorkspaceId) {
          refreshGitData();
        }
      }
    },
    [onError, refreshGitData, workspaceId],
  );

  const stageGitAll = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    const actionWorkspaceId = workspaceId;
    try {
      await stageGitAllService(actionWorkspaceId);
    } catch (error) {
      onError?.(error);
    } finally {
      if (workspaceIdRef.current === actionWorkspaceId) {
        refreshGitData();
      }
    }
  }, [onError, refreshGitData, workspaceId]);

  const stageGitSelection = useCallback(
    async (options: {
      path: string;
      op: "stage" | "unstage";
      source: "unstaged" | "staged";
      lines: GitSelectionLine[];
    }): Promise<GitSelectionApplyResult | null> => {
      if (!workspaceId) {
        return null;
      }
      const actionWorkspaceId = workspaceId;
      try {
        return await stageGitSelectionService(
          actionWorkspaceId,
          options.path,
          options.op,
          options.source,
          options.lines,
        );
      } catch (error) {
        onError?.(error);
        return null;
      } finally {
        if (workspaceIdRef.current === actionWorkspaceId) {
          refreshGitData();
        }
      }
    },
    [onError, refreshGitData, workspaceId],
  );

  const unstageGitFile = useCallback(
    async (path: string) => {
      if (!workspaceId) {
        return;
      }
      const actionWorkspaceId = workspaceId;
      try {
        await unstageGitFileService(actionWorkspaceId, path);
      } catch (error) {
        onError?.(error);
      } finally {
        if (workspaceIdRef.current === actionWorkspaceId) {
          refreshGitData();
        }
      }
    },
    [onError, refreshGitData, workspaceId],
  );

  const revertGitFile = useCallback(
    async (path: string) => {
      if (!workspaceId) {
        return;
      }
      const actionWorkspaceId = workspaceId;
      try {
        await revertGitFileService(actionWorkspaceId, path);
      } catch (error) {
        onError?.(error);
      } finally {
        if (workspaceIdRef.current === actionWorkspaceId) {
          refreshGitData();
        }
      }
    },
    [onError, refreshGitData, workspaceId],
  );

  const revertAllGitChanges = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    const confirmed = await ask(
      "Revert all changes in this repo?\n\nThis will discard all staged and unstaged changes, including untracked files.",
      { title: "Revert all changes", kind: "warning" },
    );
    if (!confirmed) {
      return;
    }
    try {
      await revertGitAll(workspaceId);
      refreshGitData();
    } catch (error) {
      onError?.(error);
    }
  }, [onError, refreshGitData, workspaceId]);

  const applyWorktreeChanges = useCallback(async () => {
    if (!workspaceId || !isWorktree) {
      return;
    }
    const applyWorkspaceId = workspaceId;
    setWorktreeApplyError(null);
    setWorktreeApplySuccess(false);
    setWorktreeApplyLoading(true);
    try {
      await applyWorktreeChangesService(applyWorkspaceId);
      if (workspaceIdRef.current !== applyWorkspaceId) {
        return;
      }
      if (worktreeApplyTimerRef.current) {
        window.clearTimeout(worktreeApplyTimerRef.current);
      }
      setWorktreeApplySuccess(true);
      worktreeApplyTimerRef.current = window.setTimeout(() => {
        if (workspaceIdRef.current !== applyWorkspaceId) {
          return;
        }
        setWorktreeApplySuccess(false);
        worktreeApplyTimerRef.current = null;
      }, 2500);
    } catch (error) {
      if (workspaceIdRef.current !== applyWorkspaceId) {
        return;
      }
      setWorktreeApplyError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      if (workspaceIdRef.current === applyWorkspaceId) {
        setWorktreeApplyLoading(false);
      }
    }
  }, [isWorktree, workspaceId]);

  const initGitRepo = useCallback(async (branch: string): Promise<InitGitRepoOutcome> => {
    if (!workspaceId) {
      return "failed";
    }
    const actionWorkspaceId = workspaceId;
    setInitGitRepoLoading(true);
    let shouldRefresh = false;
    let outcome: InitGitRepoOutcome = "failed";
    let commitError: string | null = null;
    try {
      const response = await initGitRepoService(actionWorkspaceId, branch, false);
      if (workspaceIdRef.current !== actionWorkspaceId) {
        return "cancelled";
      }

      if (response.status === "needs_confirmation") {
        const entryCount = response.entryCount ?? 0;
        const plural = entryCount === 1 ? "" : "s";
        const confirmed = await ask(
          `Initialize Git in this folder?\n\nThis will create a .git directory, set the initial branch to "${branch}", and create an initial commit.\n\nThis folder contains ${entryCount} existing item${plural}.`,
          {
            title: "Initialize Git",
            kind: "warning",
            okLabel: "Initialize",
            cancelLabel: "Cancel",
          },
        );
        if (!confirmed) {
          return "cancelled";
        }

        if (workspaceIdRef.current !== actionWorkspaceId) {
          return "cancelled";
        }

        const forced = await initGitRepoService(actionWorkspaceId, branch, true);
        shouldRefresh = forced.status === "initialized" || forced.status === "already_initialized";
        if (forced.status === "initialized") {
          commitError = forced.commitError ?? null;
        }
        outcome = shouldRefresh ? "initialized" : "failed";
      } else {
        shouldRefresh = response.status === "initialized" || response.status === "already_initialized";
        if (response.status === "initialized") {
          commitError = response.commitError ?? null;
        }
        outcome = shouldRefresh ? "initialized" : "failed";
      }

      if (commitError) {
        onError?.(
          new Error(
            `Git was initialized, but the initial commit failed.\n\n${commitError}\n\nYou may need to set git user.name and user.email, then commit manually.`,
          ),
        );
      }
    } catch (error) {
      onError?.(error);
      outcome = "failed";
    } finally {
      if (workspaceIdRef.current === actionWorkspaceId) {
        setInitGitRepoLoading(false);
        if (shouldRefresh) {
          onClearGitRootCandidates?.();
          refreshGitData();
        }
      }
    }
    return outcome;
  }, [onClearGitRootCandidates, onError, refreshGitData, workspaceId]);

  const createGitHubRepo = useCallback(
    async (
      repo: string,
      visibility: "private" | "public",
      branch: string,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!workspaceId) {
        return { ok: false, error: "No active workspace." };
      }

      const actionWorkspaceId = workspaceId;
      setCreateGitHubRepoLoading(true);
      try {
        const response = await createGitHubRepoService(
          actionWorkspaceId,
          repo,
          visibility,
          branch,
        );
        if (workspaceIdRef.current !== actionWorkspaceId) {
          return { ok: false, error: "Workspace changed." };
        }

        if (response.status === "ok") {
          return { ok: true };
        }

        const pushError = response.pushError?.trim() ?? "";
        const defaultBranchError = response.defaultBranchError?.trim() ?? "";
        const parts = [];
        if (pushError) {
          parts.push(`Push failed:\n${pushError}`);
        }
        if (defaultBranchError) {
          parts.push(`Failed to set default branch:\n${defaultBranchError}`);
        }
        const errorMessage =
          parts.length > 0 ? parts.join("\n\n") : "Remote repo was created, but setup was incomplete.";
        return { ok: false, error: errorMessage };
      } catch (error) {
        if (workspaceIdRef.current !== actionWorkspaceId) {
          return { ok: false, error: "Workspace changed." };
        }
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        if (workspaceIdRef.current === actionWorkspaceId) {
          setCreateGitHubRepoLoading(false);
        }
      }
    },
    [workspaceId],
  );

  return {
    applyWorktreeChanges,
    createGitHubRepo,
    createGitHubRepoLoading,
    initGitRepo,
    initGitRepoLoading,
    revertAllGitChanges,
    revertGitFile,
    stageGitAll,
    stageGitFile,
    stageGitSelection,
    unstageGitFile,
    worktreeApplyError,
    worktreeApplyLoading,
    worktreeApplySuccess,
  };
}
