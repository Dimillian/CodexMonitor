import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CollaborationModeOption,
  DebugEntry,
  WorkspaceInfo,
} from "../../../types";
import { getCollaborationModes } from "../../../services/tauri";
import { formatCollaborationModeLabel } from "../../../utils/collaborationModes";

type UseCollaborationModesOptions = {
  activeWorkspace: WorkspaceInfo | null;
  enabled: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

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
          if (!item || typeof item !== "object") {
            return null;
          }
          const mode = String(item.mode ?? item.name ?? "");
          if (!mode) {
            return null;
          }
          const normalizedMode = mode.trim().toLowerCase();
          if (normalizedMode && normalizedMode !== "plan" && normalizedMode !== "code") {
            return null;
          }

          const settings =
            item.settings && typeof item.settings === "object"
              ? item.settings
              : {
                  model: item.model ?? null,
                  reasoning_effort:
                    item.reasoning_effort ?? item.reasoningEffort ?? null,
                  developer_instructions:
                    item.developer_instructions ??
                    item.developerInstructions ??
                    null,
                };

          const model = String(settings.model ?? "");
          const reasoningEffort = settings.reasoning_effort ?? null;
          const developerInstructions = settings.developer_instructions ?? null;

          const labelSource = String(item.name ?? item.label ?? mode);

          const normalizedValue = {
            ...(item as Record<string, unknown>),
            mode: normalizedMode,
          };

          return {
            id: normalizedMode,
            label: formatCollaborationModeLabel(labelSource),
            mode: normalizedMode,
            model,
            reasoningEffort: reasoningEffort ? String(reasoningEffort) : null,
            developerInstructions: developerInstructions
              ? String(developerInstructions)
              : null,
            value: normalizedValue,
          };
        })
        .filter(Boolean);
      setModes(data);
      lastFetchedWorkspaceId.current = workspaceId;
      const preferredModeId =
        data.find((mode) => mode.mode === "code" || mode.id === "code")?.id ??
        data[0]?.id ??
        null;
      if (!selectedModeId) {
        if (preferredModeId) {
          setSelectedModeId(preferredModeId);
        }
        return;
      }
      if (!data.some((mode) => mode.id === selectedModeId)) {
        setSelectedModeId(preferredModeId);
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
      lastFetchedWorkspaceId.current = null;
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!enabled) {
      setModes([]);
      setSelectedModeId(null);
      lastFetchedWorkspaceId.current = null;
      return;
    }
    if (!workspaceId || !isConnected) {
      setModes([]);
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
