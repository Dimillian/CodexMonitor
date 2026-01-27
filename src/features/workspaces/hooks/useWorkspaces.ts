import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Sentry from "@sentry/react";
import type {
  AppSettings,
  DebugEntry,
  WorkspaceGroup,
  WorkspaceInfo,
  WorkspaceSettings,
} from "../../../types";
import { ask, message } from "@tauri-apps/plugin-dialog";
import {
  addClone as addCloneService,
  addWorkspace as addWorkspaceService,
  addWorktree as addWorktreeService,
  connectWorkspace as connectWorkspaceService,
  isWorkspacePathDir as isWorkspacePathDirService,
  listWorkspaces,
  pickWorkspacePath,
  removeWorkspace as removeWorkspaceService,
  removeWorktree as removeWorktreeService,
  renameWorktree as renameWorktreeService,
  renameWorktreeUpstream as renameWorktreeUpstreamService,
  updateWorkspaceCodexBin as updateWorkspaceCodexBinService,
  updateWorkspaceSettings as updateWorkspaceSettingsService,
} from "../../../services/tauri";

const GROUP_ID_RANDOM_MODULUS = 1_000_000;
const RESERVED_GROUP_NAME = "Ungrouped";
const RESERVED_GROUP_NAME_NORMALIZED = RESERVED_GROUP_NAME.toLowerCase();
const SORT_ORDER_FALLBACK = Number.MAX_SAFE_INTEGER;

type UseWorkspacesOptions = {
  onDebug?: (entry: DebugEntry) => void;
  defaultCodexBin?: string | null;
  appSettings?: AppSettings;
  onUpdateAppSettings?: (next: AppSettings) => Promise<AppSettings>;
};

type WorkspaceGroupSection = {
  id: string | null;
  name: string;
  workspaces: WorkspaceInfo[];
};

function normalizeGroupName(name: string) {
  return name.trim();
}

function getSortOrderValue(value: number | null | undefined) {
  return typeof value === "number" ? value : SORT_ORDER_FALLBACK;
}

function isReservedGroupName(name: string) {
  return normalizeGroupName(name).toLowerCase() === RESERVED_GROUP_NAME_NORMALIZED;
}

function isDuplicateGroupName(
  name: string,
  groups: WorkspaceGroup[],
  excludeId?: string,
) {
  const normalized = normalizeGroupName(name).toLowerCase();
  return groups.some(
    (group) =>
      group.id !== excludeId &&
      normalizeGroupName(group.name).toLowerCase() === normalized,
  );
}

function createGroupId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * GROUP_ID_RANDOM_MODULUS)}`;
}

export function useWorkspaces(options: UseWorkspacesOptions = {}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [deletingWorktreeIds, setDeletingWorktreeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const workspaceSettingsRef = useRef<Map<string, WorkspaceSettings>>(new Map());
  const { onDebug, defaultCodexBin, appSettings, onUpdateAppSettings } = options;

  const refreshWorkspaces = useCallback(async () => {
    try {
      const entries = await listWorkspaces();
      setWorkspaces(entries);
      setActiveWorkspaceId((prev) => {
        if (!prev) {
          return prev;
        }
        return entries.some((entry) => entry.id === prev) ? prev : null;
      });
      setHasLoaded(true);
      return entries;
    } catch (err) {
      console.error("Failed to load workspaces", err);
      setHasLoaded(true);
      return undefined;
    }
  }, []);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  useEffect(() => {
    const next = new Map<string, WorkspaceSettings>();
    workspaces.forEach((entry) => {
      next.set(entry.id, entry.settings);
    });
    workspaceSettingsRef.current = next;
  }, [workspaces]);

  const activeWorkspace = useMemo(
    () => workspaces.find((entry) => entry.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );

  const workspaceById = useMemo(() => {
    const map = new Map<string, WorkspaceInfo>();
    workspaces.forEach((entry) => {
      map.set(entry.id, entry);
    });
    return map;
  }, [workspaces]);

  const workspaceGroups = useMemo(() => {
    const groups = appSettings?.workspaceGroups ?? [];
    return groups.slice().sort((a, b) => {
      const orderDiff = getSortOrderValue(a.sortOrder) - getSortOrderValue(b.sortOrder);
      if (orderDiff !== 0) {
        return orderDiff;
      }
      return a.name.localeCompare(b.name);
    });
  }, [appSettings?.workspaceGroups]);

  const workspaceGroupById = useMemo(() => {
    const map = new Map<string, WorkspaceGroup>();
    workspaceGroups.forEach((group) => {
      map.set(group.id, group);
    });
    return map;
  }, [workspaceGroups]);

  const getWorkspaceGroupId = useCallback(
    (workspace: WorkspaceInfo) => {
      if ((workspace.kind ?? "main") === "worktree" && workspace.parentId) {
        const parent = workspaceById.get(workspace.parentId);
        return parent?.settings.groupId ?? null;
      }
      return workspace.settings.groupId ?? null;
    },
    [workspaceById],
  );

  const groupedWorkspaces = useMemo(() => {
    const rootWorkspaces = workspaces.filter(
      (entry) => (entry.kind ?? "main") !== "worktree" && !entry.parentId,
    );
    const buckets = new Map<string | null, WorkspaceInfo[]>();
    workspaceGroups.forEach((group) => {
      buckets.set(group.id, []);
    });
    const ungrouped: WorkspaceInfo[] = [];
    rootWorkspaces.forEach((workspace) => {
      const groupId = workspace.settings.groupId ?? null;
      const bucket = groupId ? buckets.get(groupId) : null;
      if (bucket) {
        bucket.push(workspace);
      } else {
        ungrouped.push(workspace);
      }
    });

    const sortWorkspaces = (list: WorkspaceInfo[]) =>
      list.slice().sort((a, b) => {
        const orderDiff =
          getSortOrderValue(a.settings.sortOrder) - getSortOrderValue(b.settings.sortOrder);
        if (orderDiff !== 0) {
          return orderDiff;
        }
        return a.name.localeCompare(b.name);
      });

    const sections: WorkspaceGroupSection[] = workspaceGroups.map((group) => ({
      id: group.id,
      name: group.name,
      workspaces: sortWorkspaces(buckets.get(group.id) ?? []),
    }));

    if (ungrouped.length > 0) {
      sections.push({
        id: null,
        name: RESERVED_GROUP_NAME,
        workspaces: sortWorkspaces(ungrouped),
      });
    }

    return sections.filter((section) => section.workspaces.length > 0);
  }, [workspaces, workspaceGroups]);

  const getWorkspaceGroupName = useCallback(
    (workspaceId: string) => {
      const workspace = workspaceById.get(workspaceId);
      if (!workspace) {
        return null;
      }
      const groupId = getWorkspaceGroupId(workspace);
      if (!groupId) {
        return null;
      }
      return workspaceGroupById.get(groupId)?.name ?? null;
    },
    [getWorkspaceGroupId, workspaceById, workspaceGroupById],
  );

  const addWorkspaceFromPath = useCallback(
    async (path: string) => {
      const selection = path.trim();
      if (!selection) {
        return null;
      }
      onDebug?.({
        id: `${Date.now()}-client-add-workspace`,
        timestamp: Date.now(),
        source: "client",
        label: "workspace/add",
        payload: { path: selection },
      });
      try {
        const workspace = await addWorkspaceService(selection, defaultCodexBin ?? null);
        setWorkspaces((prev) => [...prev, workspace]);
        setActiveWorkspaceId(workspace.id);
        Sentry.metrics.count("workspace_added", 1, {
          attributes: {
            workspace_id: workspace.id,
            workspace_kind: workspace.kind ?? "main",
          },
        });
        return workspace;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-add-workspace-error`,
          timestamp: Date.now(),
          source: "error",
          label: "workspace/add error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [defaultCodexBin, onDebug],
  );

  const addWorkspace = useCallback(async () => {
    const selection = await pickWorkspacePath();
    if (!selection) {
      return null;
    }
    return addWorkspaceFromPath(selection);
  }, [addWorkspaceFromPath]);

  const filterWorkspacePaths = useCallback(async (paths: string[]) => {
    const trimmed = paths.map((path) => path.trim()).filter(Boolean);
    if (trimmed.length === 0) {
      return [];
    }
    const checks = await Promise.all(
      trimmed.map(async (path) => ({
        path,
        isDir: await isWorkspacePathDirService(path),
      })),
    );
    return checks.filter((entry) => entry.isDir).map((entry) => entry.path);
  }, []);

  async function addWorktreeAgent(
    parent: WorkspaceInfo,
    branch: string,
    options?: { activate?: boolean },
  ) {
    const trimmed = branch.trim();
    if (!trimmed) {
      return null;
    }
    onDebug?.({
      id: `${Date.now()}-client-add-worktree`,
      timestamp: Date.now(),
      source: "client",
      label: "worktree/add",
      payload: { parentId: parent.id, branch: trimmed },
    });
    try {
      const workspace = await addWorktreeService(parent.id, trimmed);
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
  }

  async function addCloneAgent(
    source: WorkspaceInfo,
    copyName: string,
    copiesFolder: string,
  ) {
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
  }

  async function connectWorkspace(entry: WorkspaceInfo) {
    onDebug?.({
      id: `${Date.now()}-client-connect-workspace`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/connect",
      payload: { workspaceId: entry.id, path: entry.path },
    });
    try {
      await connectWorkspaceService(entry.id);
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-connect-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/connect error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  function markWorkspaceConnected(id: string) {
    setWorkspaces((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, connected: true } : entry)),
    );
  }

  const updateWorkspaceSettings = useCallback(
    async (workspaceId: string, patch: Partial<WorkspaceSettings>) => {
      onDebug?.({
        id: `${Date.now()}-client-update-workspace-settings`,
        timestamp: Date.now(),
        source: "client",
        label: "workspace/settings",
        payload: { workspaceId, patch },
      });
      const currentWorkspace = workspaces.find((entry) => entry.id === workspaceId) ?? null;
      const currentSettings =
        workspaceSettingsRef.current.get(workspaceId) ?? currentWorkspace?.settings ?? null;
      if (!currentWorkspace || !currentSettings) {
        throw new Error("workspace not found");
      }
      const previousSettings = currentSettings;
      const nextSettings = { ...currentSettings, ...patch };
      workspaceSettingsRef.current.set(workspaceId, nextSettings);
      setWorkspaces((prev) =>
        prev.map((entry) => {
          if (entry.id !== workspaceId) {
            return entry;
          }
          return { ...entry, settings: nextSettings };
        }),
      );
      try {
        const updated = await updateWorkspaceSettingsService(workspaceId, nextSettings);
        workspaceSettingsRef.current.set(workspaceId, updated.settings);
        setWorkspaces((prev) =>
          prev.map((entry) => (entry.id === workspaceId ? updated : entry)),
        );
        return updated;
      } catch (error) {
        workspaceSettingsRef.current.set(workspaceId, previousSettings);
        setWorkspaces((prev) =>
          prev.map((entry) =>
            entry.id === workspaceId
              ? { ...entry, settings: previousSettings }
              : entry,
          ),
        );
        onDebug?.({
          id: `${Date.now()}-client-update-workspace-settings-error`,
          timestamp: Date.now(),
          source: "error",
          label: "workspace/settings error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [onDebug, workspaces],
  );

  async function updateWorkspaceCodexBin(workspaceId: string, codexBin: string | null) {
    onDebug?.({
      id: `${Date.now()}-client-update-workspace-codex-bin`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/codexBin",
      payload: { workspaceId, codexBin },
    });
    const previous = workspaces.find((entry) => entry.id === workspaceId) ?? null;
    if (previous) {
      setWorkspaces((prev) =>
        prev.map((entry) =>
          entry.id === workspaceId ? { ...entry, codex_bin: codexBin } : entry,
        ),
      );
    }
    try {
      const updated = await updateWorkspaceCodexBinService(workspaceId, codexBin);
      setWorkspaces((prev) =>
        prev.map((entry) => (entry.id === workspaceId ? updated : entry)),
      );
      return updated;
    } catch (error) {
      if (previous) {
        setWorkspaces((prev) =>
          prev.map((entry) => (entry.id === workspaceId ? previous : entry)),
        );
      }
      onDebug?.({
        id: `${Date.now()}-client-update-workspace-codex-bin-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/codexBin error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  const updateWorkspaceGroups = useCallback(
    async (nextGroups: WorkspaceGroup[]) => {
      if (!appSettings || !onUpdateAppSettings) {
        return null;
      }
      const nextSettings = {
        ...appSettings,
        workspaceGroups: nextGroups,
      };
      return onUpdateAppSettings(nextSettings);
    },
    [appSettings, onUpdateAppSettings],
  );

  const createWorkspaceGroup = useCallback(
    async (name: string) => {
      if (!appSettings || !onUpdateAppSettings) {
        return null;
      }
      const trimmed = normalizeGroupName(name);
      if (!trimmed) {
        throw new Error("Group name is required.");
      }
      if (isReservedGroupName(trimmed)) {
        throw new Error(`"${RESERVED_GROUP_NAME}" is reserved.`);
      }
      const currentGroups = appSettings.workspaceGroups ?? [];
      if (isDuplicateGroupName(trimmed, currentGroups)) {
        throw new Error("Group name already exists.");
      }
      const nextSortOrder =
        currentGroups.reduce((max, group) => {
          if (typeof group.sortOrder === "number") {
            return Math.max(max, group.sortOrder);
          }
          return max;
        }, -1) + 1;
      const nextGroup: WorkspaceGroup = {
        id: createGroupId(),
        name: trimmed,
        sortOrder: nextSortOrder,
        copiesFolder: null,
      };
      await updateWorkspaceGroups([...currentGroups, nextGroup]);
      return nextGroup;
    },
    [appSettings, onUpdateAppSettings, updateWorkspaceGroups],
  );

  const renameWorkspaceGroup = useCallback(
    async (groupId: string, name: string) => {
      if (!appSettings || !onUpdateAppSettings) {
        return null;
      }
      const trimmed = normalizeGroupName(name);
      if (!trimmed) {
        throw new Error("Group name is required.");
      }
      if (isReservedGroupName(trimmed)) {
        throw new Error(`"${RESERVED_GROUP_NAME}" is reserved.`);
      }
      const currentGroups = appSettings.workspaceGroups ?? [];
      if (isDuplicateGroupName(trimmed, currentGroups, groupId)) {
        throw new Error("Group name already exists.");
      }
      const nextGroups = currentGroups.map((group) =>
        group.id === groupId ? { ...group, name: trimmed } : group,
      );
      await updateWorkspaceGroups(nextGroups);
      return true;
    },
    [appSettings, onUpdateAppSettings, updateWorkspaceGroups],
  );

  const moveWorkspaceGroup = useCallback(
    async (groupId: string, direction: "up" | "down") => {
      if (!appSettings || !onUpdateAppSettings) {
        return null;
      }
      const ordered = workspaceGroups.slice();
      const index = ordered.findIndex((group) => group.id === groupId);
      if (index === -1) {
        return null;
      }
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= ordered.length) {
        return null;
      }
      const nextOrdered = ordered.slice();
      const temp = nextOrdered[index];
      nextOrdered[index] = nextOrdered[nextIndex];
      nextOrdered[nextIndex] = temp;
      const nextOrderById = new Map(
        nextOrdered.map((group, idx) => [group.id, idx]),
      );
      const currentGroups = appSettings.workspaceGroups ?? [];
      const nextGroups = currentGroups.map((group) => {
        const nextOrder = nextOrderById.get(group.id);
        if (typeof nextOrder !== "number") {
          return group;
        }
        return { ...group, sortOrder: nextOrder };
      });
      await updateWorkspaceGroups(nextGroups);
      return true;
    },
    [appSettings, onUpdateAppSettings, updateWorkspaceGroups, workspaceGroups],
  );

  const deleteWorkspaceGroup = useCallback(
    async (groupId: string) => {
      if (!appSettings || !onUpdateAppSettings) {
        return null;
      }
      const currentGroups = appSettings.workspaceGroups ?? [];
      const nextGroups = currentGroups.filter((group) => group.id !== groupId);
      const workspacesToUpdate = workspaces.filter(
        (workspace) => (workspace.settings.groupId ?? null) === groupId,
      );
      await Promise.all([
        ...workspacesToUpdate.map((workspace) =>
          updateWorkspaceSettings(workspace.id, {
            groupId: null,
          }),
        ),
        updateWorkspaceGroups(nextGroups),
      ]);
      return true;
    },
    [
      appSettings,
      onUpdateAppSettings,
      updateWorkspaceGroups,
      updateWorkspaceSettings,
      workspaces,
    ],
  );

  const assignWorkspaceGroup = useCallback(
    async (workspaceId: string, groupId: string | null) => {
      const target = workspaces.find((workspace) => workspace.id === workspaceId);
      if (!target || (target.kind ?? "main") === "worktree") {
        return null;
      }
      const resolvedGroupId =
        groupId && workspaceGroupById.has(groupId) ? groupId : null;
      await updateWorkspaceSettings(target.id, {
        groupId: resolvedGroupId,
      });
      return true;
    },
    [updateWorkspaceSettings, workspaceGroupById, workspaces],
  );

  async function removeWorkspace(workspaceId: string) {
    const workspace = workspaces.find((entry) => entry.id === workspaceId);
    const workspaceName = workspace?.name || "this workspace";
    const worktreeCount = workspaces.filter(
      (entry) => entry.parentId === workspaceId,
    ).length;
    const childIds = new Set(
      workspaces
        .filter((entry) => entry.parentId === workspaceId)
        .map((entry) => entry.id),
    );
    const detail =
      worktreeCount > 0
        ? `\n\nThis will also delete ${worktreeCount} worktree${
            worktreeCount === 1 ? "" : "s"
          } on disk.`
        : "";

    const confirmed = await ask(
      `Are you sure you want to delete "${workspaceName}"?\n\nThis will remove the workspace from CodexMonitor.${detail}`,
      {
        title: "Delete Workspace",
        kind: "warning",
        okLabel: "Delete",
        cancelLabel: "Cancel",
      },
    );

    if (!confirmed) {
      return;
    }

    onDebug?.({
      id: `${Date.now()}-client-remove-workspace`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/remove",
      payload: { workspaceId },
    });
    try {
      await removeWorkspaceService(workspaceId);
      setWorkspaces((prev) =>
        prev.filter(
          (entry) =>
            entry.id !== workspaceId && entry.parentId !== workspaceId,
        ),
      );
      setActiveWorkspaceId((prev) =>
        prev && (prev === workspaceId || childIds.has(prev)) ? null : prev,
      );
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-remove-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/remove error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function removeWorktree(workspaceId: string) {
    const workspace = workspaces.find((entry) => entry.id === workspaceId);
    const workspaceName = workspace?.name || "this worktree";

    const confirmed = await ask(
      `Are you sure you want to delete "${workspaceName}"?\n\nThis will close the agent, remove its worktree, and delete it from CodexMonitor.`,
      {
        title: "Delete Worktree",
        kind: "warning",
        okLabel: "Delete",
        cancelLabel: "Cancel",
      },
    );

    if (!confirmed) {
      return;
    }

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
      void message(errorMessage, {
        title: "Delete worktree failed",
        kind: "error",
      });
    } finally {
      setDeletingWorktreeIds((prev) => {
        const next = new Set(prev);
        next.delete(workspaceId);
        return next;
      });
    }
  }

  async function renameWorktree(workspaceId: string, branch: string) {
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
            worktree: entry.worktree ? { ...entry.worktree, branch: trimmed } : { branch: trimmed },
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
  }

  async function renameWorktreeUpstream(
    workspaceId: string,
    oldBranch: string,
    newBranch: string,
  ) {
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
  }

  return {
    workspaces,
    workspaceGroups,
    groupedWorkspaces,
    getWorkspaceGroupName,
    ungroupedLabel: RESERVED_GROUP_NAME,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    addWorkspace,
    addWorkspaceFromPath,
    filterWorkspacePaths,
    addCloneAgent,
    addWorktreeAgent,
    connectWorkspace,
    markWorkspaceConnected,
    updateWorkspaceSettings,
    updateWorkspaceCodexBin,
    createWorkspaceGroup,
    renameWorkspaceGroup,
    moveWorkspaceGroup,
    deleteWorkspaceGroup,
    assignWorkspaceGroup,
    removeWorkspace,
    removeWorktree,
    renameWorktree,
    renameWorktreeUpstream,
    deletingWorktreeIds,
    hasLoaded,
    refreshWorkspaces,
  };
}
