import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import * as Sentry from "@sentry/react";
import type { DebugEntry, WorkspaceInfo } from "../../../types";
import {
  addClone as addCloneService,
  addWorktree as addWorktreeService,
  removeWorktree as removeWorktreeService,
  renameWorktree as renameWorktreeService,
  renameWorktreeUpstream as renameWorktreeUpstreamService,
} from "../../../services/tauri";

type UseWorktreeOpsOptions = {
  onDebug?: (entry: DebugEntry) => void;
  setWorkspaces: Dispatch<SetStateAction<WorkspaceInfo[]>>;
  setActiveWorkspaceId: Dispatch<SetStateAction<string | null>>;
};

export function useWorktreeOps({
  onDebug,
  setWorkspaces,
  setActiveWorkspaceId,
}: UseWorktreeOpsOptions) {
  const [deletingWorktreeIds, setDeletingWorktreeIds] = useState<Set<string>>(
    () => new Set(),
  );

  const addWorktreeAgent = useCallback(
    async (
      parent: WorkspaceInfo,
      branch: string,
      options?: {
        activate?: boolean;
        displayName?: string | null;
        copyAgentsMd?: boolean;
      },
    ) => {
      const trimmed = branch.trim();
      if (!trimmed) {
        return null;
      }
      const trimmedName = options?.displayName?.trim() || null;
      const copyAgentsMd = options?.copyAgentsMd ?? true;
      onDebug?.({
        id: `${Date.now()}-client-add-worktree`,
        timestamp: Date.now(),
        source: "client",
        label: "worktree/add",
        payload: {
          parentId: parent.id,
          branch: trimmed,
          name: trimmedName,
          copyAgentsMd,
        },
      });
      try {
        const workspace = await addWorktreeService(
          parent.id,
          trimmed,
          trimmedName,
          copyAgentsMd,
        );
        setWorkspaces((prev) => [...prev, workspace]);
        if (options?.activate !== false) {
          setActiveWorkspaceId(workspace.id);
        }
        Sentry.metrics.count("worktree_agent_created", 1, {
          attributes: {
            workspace_id: workspace.id,
            parent_id: parent.id,
          },
        });
        return workspace;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-add-worktree-error`,
          timestamp: Date.now(),
          source: "error",
          label: "worktree/add error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [onDebug, setActiveWorkspaceId, setWorkspaces],
  );

  const addCloneAgent = useCallback(
    async (source: WorkspaceInfo, copyName: string, copiesFolder: string) => {
      const trimmedName = copyName.trim();
      if (!trimmedName) {
        return null;
      }
      const trimmedFolder = copiesFolder.trim();
      if (!trimmedFolder) {
        throw new Error("Copies folder is required.");
      }
      onDebug?.({
        id: `${Date.now()}-client-add-clone`,
        timestamp: Date.now(),
        source: "client",
        label: "clone/add",
        payload: {
          sourceWorkspaceId: source.id,
          copyName: trimmedName,
          copiesFolder: trimmedFolder,
        },
      });
      try {
        const workspace = await addCloneService(source.id, trimmedFolder, trimmedName);
        setWorkspaces((prev) => [...prev, workspace]);
        setActiveWorkspaceId(workspace.id);
        Sentry.metrics.count("clone_agent_created", 1, {
          attributes: {
            workspace_id: workspace.id,
            parent_id: source.id,
          },
        });
        return workspace;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-add-clone-error`,
          timestamp: Date.now(),
          source: "error",
          label: "clone/add error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [onDebug, setActiveWorkspaceId, setWorkspaces],
  );

  const removeWorktree = useCallback(
    async (workspaceId: string) => {
      setDeletingWorktreeIds((prev) => {
        const next = new Set(prev);
        next.add(workspaceId);
        return next;
      });
      onDebug?.({
        id: `${Date.now()}-client-remove-worktree`,
        timestamp: Date.now(),
        source: "client",
        label: "worktree/remove",
        payload: { workspaceId },
      });
      try {
        await removeWorktreeService(workspaceId);
        setWorkspaces((prev) => prev.filter((entry) => entry.id !== workspaceId));
        setActiveWorkspaceId((prev) => (prev === workspaceId ? null : prev));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        onDebug?.({
          id: `${Date.now()}-client-remove-worktree-error`,
          timestamp: Date.now(),
          source: "error",
          label: "worktree/remove error",
          payload: errorMessage,
        });
        throw error;
      } finally {
        setDeletingWorktreeIds((prev) => {
          const next = new Set(prev);
          next.delete(workspaceId);
          return next;
        });
      }
    },
    [onDebug, setActiveWorkspaceId, setWorkspaces],
  );

  const renameWorktree = useCallback(
    async (workspaceId: string, branch: string) => {
      const trimmed = branch.trim();
      onDebug?.({
        id: `${Date.now()}-client-rename-worktree`,
        timestamp: Date.now(),
        source: "client",
        label: "worktree/rename",
        payload: { workspaceId, branch: trimmed },
      });
      let previous: WorkspaceInfo | null = null;
      if (trimmed) {
        setWorkspaces((prev) =>
          prev.map((entry) => {
            if (entry.id !== workspaceId) {
              return entry;
            }
            previous = entry;
            return {
              ...entry,
              name: trimmed,
              worktree: entry.worktree
                ? { ...entry.worktree, branch: trimmed }
                : { branch: trimmed },
            };
          }),
        );
      }
      try {
        const updated = await renameWorktreeService(workspaceId, trimmed);
        setWorkspaces((prev) =>
          prev.map((entry) => (entry.id === workspaceId ? updated : entry)),
        );
        return updated;
      } catch (error) {
        if (previous) {
          const restore = previous;
          setWorkspaces((prev) =>
            prev.map((entry) => (entry.id === workspaceId ? restore : entry)),
          );
        }
        onDebug?.({
          id: `${Date.now()}-client-rename-worktree-error`,
          timestamp: Date.now(),
          source: "error",
          label: "worktree/rename error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [onDebug, setWorkspaces],
  );

  const renameWorktreeUpstream = useCallback(
    async (workspaceId: string, oldBranch: string, newBranch: string) => {
      onDebug?.({
        id: `${Date.now()}-client-rename-worktree-upstream`,
        timestamp: Date.now(),
        source: "client",
        label: "worktree/rename-upstream",
        payload: { workspaceId, oldBranch, newBranch },
      });
      try {
        await renameWorktreeUpstreamService(workspaceId, oldBranch, newBranch);
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-rename-worktree-upstream-error`,
          timestamp: Date.now(),
          source: "error",
          label: "worktree/rename-upstream error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [onDebug],
  );

  return {
    addCloneAgent,
    addWorktreeAgent,
    deletingWorktreeIds,
    removeWorktree,
    renameWorktree,
    renameWorktreeUpstream,
  };
}
