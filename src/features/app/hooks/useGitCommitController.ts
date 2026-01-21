import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import type { WorkspaceInfo } from "../../../types";
import {
  commitGit,
  generateCommitMessage,
  pushGit,
  stageGitAll,
  syncGit,
} from "../../../services/tauri";
import { shouldApplyCommitMessage } from "../../../utils/commitMessage";
import { useGitStatus } from "../../git/hooks/useGitStatus";

type GitStatusState = ReturnType<typeof useGitStatus>["status"];

type GitCommitControllerOptions = {
  activeWorkspace: WorkspaceInfo | null;
  activeWorkspaceId: string | null;
  activeWorkspaceIdRef: RefObject<string | null>;
  gitStatus: GitStatusState;
  refreshGitStatus: () => void;
  refreshGitLog?: () => void;
};

type GitCommitController = {
  commitMessage: string;
  commitMessageLoading: boolean;
  commitMessageError: string | null;
  commitLoading: boolean;
  pushLoading: boolean;
  syncLoading: boolean;
  commitError: string | null;
  pushError: string | null;
  syncError: string | null;
  hasWorktreeChanges: boolean;
  onCommitMessageChange: (value: string) => void;
  onGenerateCommitMessage: () => Promise<void>;
  onCommit: () => Promise<void>;
  onCommitAndPush: () => Promise<void>;
  onCommitAndSync: () => Promise<void>;
  onPush: () => Promise<void>;
  onSync: () => Promise<void>;
};

export function useGitCommitController({
  activeWorkspace,
  activeWorkspaceId,
  activeWorkspaceIdRef,
  gitStatus,
  refreshGitStatus,
  refreshGitLog,
}: GitCommitControllerOptions): GitCommitController {
  const [commitMessage, setCommitMessage] = useState("");
  const [commitMessageLoading, setCommitMessageLoading] = useState(false);
  const [commitMessageError, setCommitMessageError] = useState<string | null>(
    null,
  );
  const [commitLoading, setCommitLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const hasWorktreeChanges = useMemo(() => {
    const hasStagedChanges = gitStatus.stagedFiles.length > 0;
    const hasUnstagedChanges = gitStatus.unstagedFiles.length > 0;
    return hasStagedChanges || hasUnstagedChanges;
  }, [gitStatus.stagedFiles.length, gitStatus.unstagedFiles.length]);

  const ensureStagedForCommit = useCallback(async () => {
    const hasStagedChanges = gitStatus.stagedFiles.length > 0;
    const hasUnstagedChanges = gitStatus.unstagedFiles.length > 0;
    if (!activeWorkspace || hasStagedChanges || !hasUnstagedChanges) {
      return;
    }
    await stageGitAll(activeWorkspace.id);
  }, [activeWorkspace, gitStatus.stagedFiles.length, gitStatus.unstagedFiles.length]);

  const handleCommitMessageChange = useCallback((value: string) => {
    setCommitMessage(value);
  }, []);

  const handleGenerateCommitMessage = useCallback(async () => {
    if (!activeWorkspace || commitMessageLoading) {
      return;
    }
    const workspaceId = activeWorkspace.id;
    setCommitMessageLoading(true);
    setCommitMessageError(null);
    try {
      const message = await generateCommitMessage(workspaceId);
      if (!shouldApplyCommitMessage(activeWorkspaceIdRef.current, workspaceId)) {
        return;
      }
      setCommitMessage(message);
    } catch (error) {
      if (!shouldApplyCommitMessage(activeWorkspaceIdRef.current, workspaceId)) {
        return;
      }
      setCommitMessageError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      if (shouldApplyCommitMessage(activeWorkspaceIdRef.current, workspaceId)) {
        setCommitMessageLoading(false);
      }
    }
  }, [activeWorkspace, commitMessageLoading, activeWorkspaceIdRef]);

  useEffect(() => {
    setCommitMessage("");
    setCommitMessageError(null);
    setCommitMessageLoading(false);
  }, [activeWorkspaceId]);

  const handleCommit = useCallback(async () => {
    if (
      !activeWorkspace ||
      commitLoading ||
      !commitMessage.trim() ||
      !hasWorktreeChanges
    ) {
      return;
    }
    setCommitLoading(true);
    setCommitError(null);
    try {
      await ensureStagedForCommit();
      await commitGit(activeWorkspace.id, commitMessage.trim());
      setCommitMessage("");
      refreshGitStatus();
      refreshGitLog?.();
    } catch (error) {
      setCommitError(error instanceof Error ? error.message : String(error));
    } finally {
      setCommitLoading(false);
    }
  }, [
    activeWorkspace,
    commitLoading,
    commitMessage,
    ensureStagedForCommit,
    hasWorktreeChanges,
    refreshGitLog,
    refreshGitStatus,
  ]);

  const handleCommitAndPush = useCallback(async () => {
    if (
      !activeWorkspace ||
      commitLoading ||
      pushLoading ||
      !commitMessage.trim() ||
      !hasWorktreeChanges
    ) {
      return;
    }
    let commitSucceeded = false;
    setCommitLoading(true);
    setPushLoading(true);
    setCommitError(null);
    setPushError(null);
    try {
      await ensureStagedForCommit();
      await commitGit(activeWorkspace.id, commitMessage.trim());
      commitSucceeded = true;
      setCommitMessage("");
      setCommitLoading(false);
      await pushGit(activeWorkspace.id);
      refreshGitStatus();
      refreshGitLog?.();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!commitSucceeded) {
        setCommitError(errorMsg);
      } else {
        setPushError(errorMsg);
      }
    } finally {
      setCommitLoading(false);
      setPushLoading(false);
    }
  }, [
    activeWorkspace,
    commitLoading,
    pushLoading,
    commitMessage,
    ensureStagedForCommit,
    hasWorktreeChanges,
    refreshGitLog,
    refreshGitStatus,
  ]);

  const handleCommitAndSync = useCallback(async () => {
    if (
      !activeWorkspace ||
      commitLoading ||
      syncLoading ||
      !commitMessage.trim() ||
      !hasWorktreeChanges
    ) {
      return;
    }
    let commitSucceeded = false;
    setCommitLoading(true);
    setSyncLoading(true);
    setCommitError(null);
    setSyncError(null);
    try {
      await ensureStagedForCommit();
      await commitGit(activeWorkspace.id, commitMessage.trim());
      commitSucceeded = true;
      setCommitMessage("");
      setCommitLoading(false);
      await syncGit(activeWorkspace.id);
      refreshGitStatus();
      refreshGitLog?.();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!commitSucceeded) {
        setCommitError(errorMsg);
      } else {
        setSyncError(errorMsg);
      }
    } finally {
      setCommitLoading(false);
      setSyncLoading(false);
    }
  }, [
    activeWorkspace,
    commitLoading,
    syncLoading,
    commitMessage,
    ensureStagedForCommit,
    hasWorktreeChanges,
    refreshGitLog,
    refreshGitStatus,
  ]);

  const handlePush = useCallback(async () => {
    if (!activeWorkspace || pushLoading) {
      return;
    }
    setPushLoading(true);
    setPushError(null);
    try {
      await pushGit(activeWorkspace.id);
      refreshGitStatus();
      refreshGitLog?.();
    } catch (error) {
      setPushError(error instanceof Error ? error.message : String(error));
    } finally {
      setPushLoading(false);
    }
  }, [activeWorkspace, pushLoading, refreshGitLog, refreshGitStatus]);

  const handleSync = useCallback(async () => {
    if (!activeWorkspace || syncLoading) {
      return;
    }
    setSyncLoading(true);
    setSyncError(null);
    try {
      await syncGit(activeWorkspace.id);
      refreshGitStatus();
      refreshGitLog?.();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncLoading(false);
    }
  }, [activeWorkspace, refreshGitLog, refreshGitStatus, syncLoading]);

  return {
    commitMessage,
    commitMessageLoading,
    commitMessageError,
    commitLoading,
    pushLoading,
    syncLoading,
    commitError,
    pushError,
    syncError,
    hasWorktreeChanges,
    onCommitMessageChange: handleCommitMessageChange,
    onGenerateCommitMessage: handleGenerateCommitMessage,
    onCommit: handleCommit,
    onCommitAndPush: handleCommitAndPush,
    onCommitAndSync: handleCommitAndSync,
    onPush: handlePush,
    onSync: handleSync,
  };
}
