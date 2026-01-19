import { useCallback, useEffect, useRef, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import {
  applyWorktreeChanges as applyWorktreeChangesService,
  revertGitAll,
  revertGitFile as revertGitFileService,
  stageGitFile as stageGitFileService,
  unstageGitFile as unstageGitFileService,
} from "../../../services/tauri";
import type { WorkspaceInfo } from "../../../types";

type UseGitActionsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onRefreshGitStatus: () => void;
  onRefreshGitDiffs: () => void;
  onError?: (error: unknown) => void;
};

export function useGitActions({
  activeWorkspace,
  onRefreshGitStatus,
  onRefreshGitDiffs,
  onError,
}: UseGitActionsOptions) {
  const [worktreeApplyError, setWorktreeApplyError] = useState<string | null>(null);
  const [worktreeApplyLoading, setWorktreeApplyLoading] = useState(false);
  const [worktreeApplySuccess, setWorktreeApplySuccess] = useState(false);
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

  return {
    applyWorktreeChanges,
    revertAllGitChanges,
    revertGitFile,
    stageGitFile,
    unstageGitFile,
    worktreeApplyError,
    worktreeApplyLoading,
    worktreeApplySuccess,
  };
}
