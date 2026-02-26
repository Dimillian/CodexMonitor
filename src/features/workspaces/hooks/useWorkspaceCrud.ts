import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import * as Sentry from "@sentry/react";
import type { DebugEntry, WorkspaceInfo, WorkspaceSettings } from "../../../types";
import {
  addWorkspace as addWorkspaceService,
  addWorkspaceFromGitUrl as addWorkspaceFromGitUrlService,
  connectWorkspace as connectWorkspaceService,
  isWorkspacePathDir as isWorkspacePathDirService,
  listWorkspaces,
  removeWorkspace as removeWorkspaceService,
  updateWorkspaceSettings as updateWorkspaceSettingsService,
} from "../../../services/tauri";

type UseWorkspaceCrudOptions = {
  onDebug?: (entry: DebugEntry) => void;
  workspaces: WorkspaceInfo[];
  setWorkspaces: Dispatch<SetStateAction<WorkspaceInfo[]>>;
  setActiveWorkspaceId: Dispatch<SetStateAction<string | null>>;
  workspaceSettingsRef: MutableRefObject<Map<string, WorkspaceSettings>>;
  setHasLoaded: Dispatch<SetStateAction<boolean>>;
};

export type AddWorkspacesFromPathsFailure = {
  path: string;
  message: string;
};

export type AddWorkspacesFromPathsResult = {
  added: WorkspaceInfo[];
  firstAdded: WorkspaceInfo | null;
  skippedExisting: string[];
  skippedInvalid: string[];
  failures: AddWorkspacesFromPathsFailure[];
};

function normalizeWorkspacePathKey(value: string) {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

function inferHomePrefixes(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const normalized = path.trim().replace(/\\/g, "/");
    if (!normalized.startsWith("/")) {
      continue;
    }
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length < 2) {
      continue;
    }
    const candidate = `/${segments[0]}/${segments[1]}`;
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    result.push(candidate);
  }
  return result;
}

function buildWorkspacePathCandidates(path: string, homePrefixes: string[]): string[] {
  const trimmed = path.trim();
  if (trimmed === "~") {
    return [trimmed, ...homePrefixes];
  }
  const rest = trimmed.startsWith("~/") ? trimmed.slice(2) : null;
  if (rest == null) {
    return [trimmed];
  }
  const expanded = homePrefixes.map((prefix) => `${prefix}/${rest}`);
  return [trimmed, ...expanded];
}

function buildWorkspacePathKeyCandidates(path: string, homePrefixes: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of buildWorkspacePathCandidates(path, homePrefixes)) {
    const key = normalizeWorkspacePathKey(candidate);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(key);
  }
  return result;
}

export function useWorkspaceCrud({
  onDebug,
  workspaces,
  setWorkspaces,
  setActiveWorkspaceId,
  workspaceSettingsRef,
  setHasLoaded,
}: UseWorkspaceCrudOptions) {
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
  }, [setActiveWorkspaceId, setHasLoaded, setWorkspaces]);

  const addWorkspaceFromPath = useCallback(
    async (path: string, options?: { activate?: boolean }) => {
      const selection = path.trim();
      if (!selection) {
        return null;
      }
      const shouldActivate = options?.activate !== false;
      onDebug?.({
        id: `${Date.now()}-client-add-workspace`,
        timestamp: Date.now(),
        source: "client",
        label: "workspace/add",
        payload: { path: selection },
      });
      try {
        const workspace = await addWorkspaceService(selection);
        setWorkspaces((prev) => [...prev, workspace]);
        if (shouldActivate) {
          setActiveWorkspaceId(workspace.id);
        }
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
    [onDebug, setActiveWorkspaceId, setWorkspaces],
  );

  const addWorkspaceFromGitUrl = useCallback(
    async (
      url: string,
      destinationPath: string,
      targetFolderName?: string | null,
      options?: { activate?: boolean },
    ) => {
      const trimmedUrl = url.trim();
      const trimmedDestination = destinationPath.trim();
      const trimmedFolderName = targetFolderName?.trim() || null;
      if (!trimmedUrl) {
        throw new Error("Remote Git URL is required.");
      }
      if (!trimmedDestination) {
        throw new Error("Destination folder is required.");
      }
      const shouldActivate = options?.activate !== false;
      onDebug?.({
        id: `${Date.now()}-client-add-workspace-from-url`,
        timestamp: Date.now(),
        source: "client",
        label: "workspace/add-from-url",
        payload: {
          url: trimmedUrl,
          destinationPath: trimmedDestination,
          targetFolderName: trimmedFolderName,
        },
      });
      try {
        const workspace = await addWorkspaceFromGitUrlService(
          trimmedUrl,
          trimmedDestination,
          trimmedFolderName,
        );
        setWorkspaces((prev) => [...prev, workspace]);
        if (shouldActivate) {
          setActiveWorkspaceId(workspace.id);
        }
        return workspace;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-add-workspace-from-url-error`,
          timestamp: Date.now(),
          source: "error",
          label: "workspace/add-from-url error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [onDebug, setActiveWorkspaceId, setWorkspaces],
  );

  const addWorkspacesFromPaths = useCallback(
    async (paths: string[]): Promise<AddWorkspacesFromPathsResult> => {
      const homePrefixes = inferHomePrefixes(workspaces.map((entry) => entry.path));
      const existingPaths = new Set(
        workspaces.map((entry) => normalizeWorkspacePathKey(entry.path)),
      );
      const skippedExisting: string[] = [];
      const skippedInvalid: string[] = [];
      const failures: AddWorkspacesFromPathsFailure[] = [];
      const added: WorkspaceInfo[] = [];

      const seenSelections = new Set<string>();
      const selections = paths
        .map((path) => path.trim())
        .filter(Boolean)
        .filter((path) => {
          const key = normalizeWorkspacePathKey(path);
          if (seenSelections.has(key)) {
            return false;
          }
          seenSelections.add(key);
          return true;
        });

      for (const selection of selections) {
        const pathCandidates = buildWorkspacePathCandidates(selection, homePrefixes);
        let addedWorkspace = false;
        let hadExistingCandidate = false;
        let checkFailedMessage: string | null = null;
        for (const candidate of pathCandidates) {
          let isDir = false;
          try {
            isDir = await isWorkspacePathDirService(candidate);
          } catch (error) {
            checkFailedMessage = error instanceof Error ? error.message : String(error);
            continue;
          }
          if (!isDir) {
            continue;
          }
          const candidateKeys = buildWorkspacePathKeyCandidates(
            candidate,
            homePrefixes,
          );
          if (candidateKeys.some((key) => existingPaths.has(key))) {
            hadExistingCandidate = true;
            continue;
          }
          try {
            const workspace = await addWorkspaceFromPath(candidate, {
              activate: added.length === 0,
            });
            if (workspace) {
              added.push(workspace);
              existingPaths.add(normalizeWorkspacePathKey(workspace.path));
              addedWorkspace = true;
              break;
            }
          } catch (error) {
            failures.push({
              path: selection,
              message: error instanceof Error ? error.message : String(error),
            });
            addedWorkspace = true;
            break;
          }
        }

        if (addedWorkspace) {
          continue;
        }
        if (hadExistingCandidate) {
          skippedExisting.push(selection);
          continue;
        }
        if (checkFailedMessage) {
          failures.push({
            path: selection,
            message: checkFailedMessage,
          });
          continue;
        }
        skippedInvalid.push(selection);
      }

      return {
        added,
        firstAdded: added[0] ?? null,
        skippedExisting,
        skippedInvalid,
        failures,
      };
    },
    [addWorkspaceFromPath, workspaces],
  );

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

  const connectWorkspace = useCallback(
    async (entry: WorkspaceInfo) => {
      onDebug?.({
        id: `${Date.now()}-client-connect-workspace`,
        timestamp: Date.now(),
        source: "client",
        label: "workspace/connect",
        payload: { workspaceId: entry.id, path: entry.path },
      });
      try {
        await connectWorkspaceService(entry.id);
        setWorkspaces((prev) =>
          prev.map((workspace) =>
            workspace.id === entry.id
              ? { ...workspace, connected: true }
              : workspace,
          ),
        );
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
    },
    [onDebug, setWorkspaces],
  );

  const markWorkspaceConnected = useCallback(
    (id: string) => {
      setWorkspaces((prev) =>
        prev.map((entry) => (entry.id === id ? { ...entry, connected: true } : entry)),
      );
    },
    [setWorkspaces],
  );

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
    [onDebug, setWorkspaces, workspaces, workspaceSettingsRef],
  );

  const removeWorkspace = useCallback(
    async (workspaceId: string) => {
      const childIds = new Set(
        workspaces
          .filter((entry) => entry.parentId === workspaceId)
          .map((entry) => entry.id),
      );

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
        const errorMessage = error instanceof Error ? error.message : String(error);
        onDebug?.({
          id: `${Date.now()}-client-remove-workspace-error`,
          timestamp: Date.now(),
          source: "error",
          label: "workspace/remove error",
          payload: errorMessage,
        });
        throw error;
      }
    },
    [onDebug, setActiveWorkspaceId, setWorkspaces, workspaces],
  );

  return {
    addWorkspaceFromPath,
    addWorkspaceFromGitUrl,
    addWorkspacesFromPaths,
    connectWorkspace,
    filterWorkspacePaths,
    markWorkspaceConnected,
    refreshWorkspaces,
    removeWorkspace,
    updateWorkspaceSettings,
  };
}
