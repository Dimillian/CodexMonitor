import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceInfo } from "../../../types";

type RenamePromptState = {
  workspaceId: string;
  name: string;
  originalName: string;
  error: string | null;
  isSubmitting: boolean;
};

type UpstreamPromptState = {
  workspaceId: string;
  oldBranch: string;
  newBranch: string;
  isSubmitting: boolean;
  error: string | null;
};

type UseRenameWorktreePromptOptions = {
  workspaces: WorkspaceInfo[];
  activeWorkspaceId: string | null;
  renameWorktree: (workspaceId: string, branch: string) => Promise<WorkspaceInfo>;
  renameWorktreeUpstream: (
    workspaceId: string,
    oldBranch: string,
    newBranch: string,
  ) => Promise<void>;
  onRenameSuccess?: (workspace: WorkspaceInfo) => void;
};

export function useRenameWorktreePrompt({
  workspaces,
  activeWorkspaceId,
  renameWorktree,
  renameWorktreeUpstream,
  onRenameSuccess,
}: UseRenameWorktreePromptOptions) {
  const [renamePrompt, setRenamePrompt] = useState<RenamePromptState | null>(
    null,
  );
  const [upstreamPrompt, setUpstreamPrompt] =
    useState<UpstreamPromptState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const setNoticeMessage = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!renamePrompt) {
      return;
    }
    const workspace = workspaces.find((entry) => entry.id === renamePrompt.workspaceId);
    if (!workspace || (workspace.kind ?? "main") !== "worktree") {
      setRenamePrompt(null);
      return;
    }
    if (activeWorkspaceId && workspace.id !== activeWorkspaceId) {
      setRenamePrompt(null);
    }
  }, [activeWorkspaceId, renamePrompt, workspaces]);

  useEffect(() => {
    if (!upstreamPrompt) {
      return;
    }
    if (
      activeWorkspaceId &&
      upstreamPrompt.workspaceId !== activeWorkspaceId
    ) {
      setUpstreamPrompt(null);
    }
  }, [activeWorkspaceId, upstreamPrompt]);

  const openRenamePrompt = useCallback(
    (workspaceId: string) => {
      const workspace = workspaces.find((entry) => entry.id === workspaceId);
      if (!workspace || (workspace.kind ?? "main") !== "worktree") {
        return;
      }
      const currentName = workspace.worktree?.branch ?? workspace.name;
      setNotice(null);
      setUpstreamPrompt(null);
      setRenamePrompt({
        workspaceId,
        name: currentName,
        originalName: currentName,
        error: null,
        isSubmitting: false,
      });
    },
    [workspaces],
  );

  const handleRenameChange = useCallback((value: string) => {
    setRenamePrompt((prev) =>
      prev
        ? {
            ...prev,
            name: value,
            error: null,
          }
        : prev,
    );
  }, []);

  const handleRenameCancel = useCallback(() => {
    setRenamePrompt(null);
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    if (!renamePrompt || renamePrompt.isSubmitting) {
      return;
    }
    const target = renamePrompt;
    setRenamePrompt({ ...target, error: null, isSubmitting: true });
    const trimmed = target.name.trim();
    if (!trimmed) {
      setRenamePrompt((prev) =>
        prev
          ? {
              ...prev,
              error: "Branch name is required.",
              isSubmitting: false,
            }
          : prev,
      );
      return;
    }
    if (trimmed === target.originalName) {
      setRenamePrompt(null);
      return;
    }
    try {
      const updated = await renameWorktree(target.workspaceId, trimmed);
      const actualName = updated.worktree?.branch ?? updated.name;
      onRenameSuccess?.(updated);
      if (actualName !== target.originalName) {
        setUpstreamPrompt({
          workspaceId: target.workspaceId,
          oldBranch: target.originalName,
          newBranch: actualName,
          isSubmitting: false,
          error: null,
        });
      }
      if (actualName !== trimmed) {
        setNoticeMessage(`Branch already exists. Renamed to "${actualName}".`);
      } else {
        setNoticeMessage("Worktree renamed.");
      }
      setRenamePrompt(null);
    } catch (error) {
      setRenamePrompt((prev) =>
        prev
          ? {
              ...prev,
              error: error instanceof Error ? error.message : String(error),
              isSubmitting: false,
            }
          : prev,
      );
    }
  }, [onRenameSuccess, renamePrompt, renameWorktree, setNoticeMessage]);

  const confirmUpstream = useCallback(async () => {
    if (!upstreamPrompt || upstreamPrompt.isSubmitting) {
      return;
    }
    setUpstreamPrompt((prev) =>
      prev ? { ...prev, isSubmitting: true, error: null } : prev,
    );
    try {
      await renameWorktreeUpstream(
        upstreamPrompt.workspaceId,
        upstreamPrompt.oldBranch,
        upstreamPrompt.newBranch,
      );
      setUpstreamPrompt(null);
      setNoticeMessage("Upstream branch updated.");
    } catch (error) {
      setUpstreamPrompt((prev) =>
        prev
          ? {
              ...prev,
              isSubmitting: false,
              error: error instanceof Error ? error.message : String(error),
            }
          : prev,
      );
    }
  }, [renameWorktreeUpstream, setNoticeMessage, upstreamPrompt]);

  return {
    renamePrompt,
    notice,
    upstreamPrompt,
    confirmUpstream,
    openRenamePrompt,
    handleRenameChange,
    handleRenameCancel,
    handleRenameConfirm,
  };
}
