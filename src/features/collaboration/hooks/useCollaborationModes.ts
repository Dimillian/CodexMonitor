import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CollaborationModeOption,
  DebugEntry,
  WorkspaceInfo,
} from "../../../types";
import { getCollaborationModes } from "../../../services/tauri";

type UseCollaborationModesOptions = {
  activeWorkspace: WorkspaceInfo | null;
  enabled: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

function titleCase(value: string) {
  if (!value) {
    return value;
  }
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

export function useCollaborationModes({
  activeWorkspace,
  enabled,
  onDebug,
}: UseCollaborationModesOptions) {
  const [modes, setModes] = useState<CollaborationModeOption[]>([]);
  const [selectedModeId, setSelectedModeId] = useState<string | null>(null);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const previousWorkspaceId = useRef<string | null>(null);
  const inFlight = useRef(false);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);

  const selectedMode = useMemo(
    () => modes.find((mode) => mode.id === selectedModeId) ?? null,
    [modes, selectedModeId],
  );

  const refreshModes = useCallback(async () => {
    if (!workspaceId || !isConnected || !enabled) {
      return;
    }
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    onDebug?.({
      id: `${Date.now()}-client-collaboration-mode-list`,
      timestamp: Date.now(),
      source: "client",
      label: "collaborationMode/list",
      payload: { workspaceId },
    });
    try {
      const response = await getCollaborationModes(workspaceId);
      onDebug?.({
        id: `${Date.now()}-server-collaboration-mode-list`,
        timestamp: Date.now(),
        source: "server",
        label: "collaborationMode/list response",
        payload: response,
      });
      const rawData = response.result?.data ?? response.data ?? [];
      const data: CollaborationModeOption[] = rawData
        .map((item: any) => {
          const mode = String(item.mode ?? "");
          if (!mode) {
            return null;
          }
          const model = String(item.model ?? "");
          const reasoningEffort =
            item.reasoningEffort ?? item.reasoning_effort ?? null;
          const developerInstructions =
            item.developerInstructions ?? item.developer_instructions ?? null;
          return {
            id: mode,
            label: titleCase(mode),
            mode,
            model,
            reasoningEffort: reasoningEffort ? String(reasoningEffort) : null,
            developerInstructions: developerInstructions
              ? String(developerInstructions)
              : null,
            value: item as Record<string, unknown>,
          };
        })
        .filter(Boolean);
      setModes(data);
      lastFetchedWorkspaceId.current = workspaceId;
      if (selectedModeId && !data.some((mode) => mode.id === selectedModeId)) {
        setSelectedModeId(null);
      }
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-collaboration-mode-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "collaborationMode/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight.current = false;
    }
  }, [enabled, isConnected, onDebug, selectedModeId, workspaceId]);

  useEffect(() => {
    if (previousWorkspaceId.current !== workspaceId) {
      previousWorkspaceId.current = workspaceId;
      setModes([]);
      setSelectedModeId(null);
      lastFetchedWorkspaceId.current = null;
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected || !enabled) {
      setModes([]);
      setSelectedModeId(null);
      lastFetchedWorkspaceId.current = null;
      return;
    }
    if (lastFetchedWorkspaceId.current === workspaceId) {
      return;
    }
    refreshModes();
  }, [enabled, isConnected, modes.length, refreshModes, workspaceId]);

  return {
    collaborationModes: modes,
    selectedCollaborationMode: selectedMode,
    selectedCollaborationModeId: selectedModeId,
    setSelectedCollaborationModeId: setSelectedModeId,
    refreshCollaborationModes: refreshModes,
  };
}
